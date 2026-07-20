"""
Production Data Cleanup Script
===============================
Deletes all APPLICATION DATA from Supabase while preserving:
  - Tables, Schema, Foreign Keys, Indexes, Functions, Triggers, Views
  - Storage Buckets (structure only)
  - Document Templates
  - Product Master / Inventory Defaults
  - System Configuration

Run from the backend directory with the venv activated:
    python cleanup_data.py --force
"""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import sys

PRESERVE_ADMIN = True  # Set to True to keep GVP Solar / Giriraj Dhoot admin user+company

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")

if not supabase_url or not supabase_key:
    print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in backend/.env")
    sys.exit(1)

from supabase import create_client, Client

client: Client = create_client(supabase_url, supabase_key)

print("=" * 60)
print("GVP SOLAR ENERGY APP - PRODUCTION DATA CLEANUP")
print("=" * 60)
print(f"Target: {supabase_url}")
print(f"Preserve Admin: {PRESERVE_ADMIN}")
print()

# Prompt for confirmation unless --force or FORCE_CLEANUP is provided
force_mode = "--force" in sys.argv or "-y" in sys.argv or os.environ.get("FORCE_CLEANUP") == "1"
if not force_mode:
    confirm = input("This will DELETE ALL application data permanently.\nType 'DELETE ALL DATA' to confirm: ")
    if confirm != "DELETE ALL DATA":
        print("Aborted.")
        sys.exit(0)

print("\nStarting cleanup...\n")

# ─── Deletion order (children before parents to avoid FK violations) ──────────
DELETION_ORDER = [
    # Audit/comment tables first (depend on complaints, tasks)
    "complaint_audit",
    "complaint_comments",
    # Task-related
    "task_updates",
    "tasks",
    # Complaint Center
    "complaints",
    # Verification & workflow records
    "verifications",
    # Inventory movement
    "outward_entries",
    "inward_entries",
    # Material requests
    "material_requests",
    # Notifications & logs
    "notifications",
    "activity_logs",
    # Files metadata
    "files",
    # Auth tokens
    "password_reset_tokens",
    "password_reset_otps",
    # Client data & projects
    "projects",
    "clients",
    # Counters (sequence generators)
    "counters",
    # Sales documents (quotations, invoices, delivery bills)
    "quotations",
    "tax_invoices",
    "delivery_bills",
    # High value assets
    "assets",
    # Service / complaint tickets
    "service_tickets",
]

# Tables to SKIP entirely (preserved)
SKIP_TABLES = {
    "document_templates",   # Keep templates
    "products",             # Keep product master
    "inventory_defaults",   # Keep defaults
}

# Tables to delete AFTER employees/users
USER_TABLES = [
    "employees",
    "users",
    "companies",
]

admin_company_id = None
admin_user_id = None

if PRESERVE_ADMIN:
    # Find Giriraj Dhoot / GVP Solar company and user
    try:
        comp_res = client.table("companies").select("id").ilike("company_name", "%GVP Solar%").limit(1).execute()
        if not comp_res.data:
            comp_res = client.table("companies").select("id").limit(1).execute()
        if comp_res.data and isinstance(comp_res.data[0], dict):
            admin_company_id = comp_res.data[0].get("id")
            print(f"Preserving GVP Solar company: {admin_company_id}")

        user_res = client.table("users").select("id").ilike("name", "%Giriraj%").limit(1).execute()
        if not user_res.data:
            user_res = client.table("users").select("id").eq("role", "Admin").limit(1).execute()
        if user_res.data and isinstance(user_res.data[0], dict):
            admin_user_id = user_res.data[0].get("id")
            print(f"Preserving Giriraj Dhoot user: {admin_user_id}")
    except Exception as e:
        print(f"Warning: Could not find admin to preserve: {e}")

errors = []

def delete_table(table_name: str, preserve_ids = None):
    """Delete all rows in a table, optionally preserving specific IDs."""
    try:
        builder = client.table(table_name).delete()
        if preserve_ids:
            builder = builder.not_.in_("id", preserve_ids)
            builder.execute()
        else:
            try:
                res = client.table(table_name).delete().neq("id", "___nonexistent___").execute()
            except Exception:
                try:
                    res = client.table(table_name).delete().neq("company_id", "___nonexistent___").execute()
                except Exception:
                    try:
                        res = client.table(table_name).delete().neq("token", "___nonexistent___").execute()
                    except Exception as e2:
                        raise e2
        print(f"  [OK] Cleared: {table_name}")
    except Exception as e:
        err_msg = str(e)
        if "does not exist" in err_msg or "relation" in err_msg.lower():
            print(f"  [SKIP] Table not found: {table_name}")
        else:
            print(f"  [ERROR] Clearing {table_name}: {e}")
            errors.append((table_name, str(e)))

# Step 1: Clear application data tables
print("Step 1/4: Clearing application data tables...")
for table in DELETION_ORDER:
    if table in SKIP_TABLES:
        print(f"  [SKIP] Preserved: {table}")
        continue
    delete_table(table)

# Step 2: Clear user/employee tables
print("\nStep 2/4: Clearing user & company data...")
preserve_ids = []
if PRESERVE_ADMIN and admin_user_id:
    preserve_ids = [admin_user_id]
delete_table("employees")

if PRESERVE_ADMIN and admin_user_id:
    client.table("users").delete().neq("id", admin_user_id).execute()
    print(f"  [OK] Cleared: users (preserved admin: {admin_user_id})")
else:
    delete_table("users")

if PRESERVE_ADMIN and admin_company_id:
    client.table("companies").delete().neq("id", admin_company_id).execute()
    print(f"  [OK] Cleared: companies (preserved company: {admin_company_id})")
else:
    delete_table("companies")

# Step 3: Clear Supabase Storage files
print("\nStep 3/4: Clearing Supabase Storage bucket files...")
BUCKETS = ["customer-documents", "project-images", "vendor-documents", "generated-pdfs", "user-profile-images"]
for bucket in BUCKETS:
    try:
        files = client.storage.from_(bucket).list()
        if not files:
            print(f"  [SKIP] Empty bucket: {bucket}")
            continue
        
        deleted_count = [0]
        def delete_folder(bucket_name, prefix=""):
            items = client.storage.from_(bucket_name).list(prefix)
            for item in (items or []):
                name = item.get("name", "")
                full_path = f"{prefix}/{name}" if prefix else name
                if item.get("id"):
                    client.storage.from_(bucket_name).remove([full_path])
                    deleted_count[0] += 1
                else:
                    delete_folder(bucket_name, full_path)
        
        delete_folder(bucket)
        print(f"  [OK] Cleared bucket: {bucket} ({deleted_count[0]} files deleted)")
    except Exception as e:
        print(f"  [ERROR] Clearing bucket {bucket}: {e}")
        errors.append((f"bucket:{bucket}", str(e)))

# Step 4: Clear local storage JSON files
print("\nStep 4/4: Resetting backend local_storage JSON files...")
local_storage_dir = ROOT_DIR / "local_storage"
if local_storage_dir.exists():
    dict_files = ["product_rates.json", "product_high_value.json"]
    array_files = [
        "attendance.json", "high_value_assets.json", "live_locations.json",
        "service_messages.json", "service_reports.json", "service_tasks.json"
    ]
    for fn in dict_files:
        p = local_storage_dir / fn
        try:
            with open(p, "w", encoding="utf-8") as f:
                f.write("{}")
            print(f"  [OK] Reset dict file: {fn}")
        except Exception as e:
            print(f"  [ERROR] Resetting {fn}: {e}")
            errors.append((fn, str(e)))

    for fn in array_files:
        p = local_storage_dir / fn
        try:
            with open(p, "w", encoding="utf-8") as f:
                f.write("[]")
            print(f"  [OK] Reset array file: {fn}")
        except Exception as e:
            print(f"  [ERROR] Resetting {fn}: {e}")
            errors.append((fn, str(e)))

# Summary
print("\n" + "=" * 60)
if errors:
    print(f"COMPLETED WITH {len(errors)} ERRORS:")
    for table, err in errors:
        print(f"  - {table}: {err}")
else:
    print("CLEANUP COMPLETED SUCCESSFULLY")
print("=" * 60)
print()
print("The database is now clean. You can register a new company at /register")
