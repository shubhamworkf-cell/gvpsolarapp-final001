"""
Purge Extra Companies & Users Script
====================================
Deletes all companies and users from Supabase EXCEPT:
  - Company: GVP Solar (ID: 82c320fe-e644-4255-ab40-cddc17d9ce3e)
  - Admin User: Giriraj Dhoot (girirajdhoot.gvp@gmail.com, ID: 949cf05f-43a3-4ddd-bb41-3122e30700af)

Requires SUPABASE_SERVICE_ROLE_KEY to bypass Row-Level Security (RLS).
"""
import os
import sys
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

supabase_url = os.environ.get("SUPABASE_URL")
service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

if not supabase_url or not service_role_key:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env")
    sys.exit(1)

from supabase import create_client, Client

client: Client = create_client(supabase_url, service_role_key)

GVP_COMPANY_NAME = "GVP Solar"
GVP_OWNER_NAME = "Giriraj Dhoot"
GVP_EMAIL = "girirajdhoot.gvp@gmail.com"

print("=" * 60)
print("PURGING EXTRA COMPANIES AND USERS FROM SUPABASE TABLE EDITOR")
print("=" * 60)

try:
    # 1. Identify GVP Solar company ID
    comp_res = client.table("companies").select("id, company_name, owner_name, email").execute()
    all_companies = comp_res.data or []
    print(f"Total companies in Table Editor: {len(all_companies)}")

    gvp_comp_ids = [
        c["id"] for c in all_companies 
        if GVP_COMPANY_NAME.lower() in c.get("company_name", "").lower() or GVP_EMAIL.lower() in c.get("email", "").lower()
    ]

    # 2. Identify Giriraj Dhoot user ID
    user_res = client.table("users").select("id, name, email, company_id").execute()
    all_users = user_res.data or []
    print(f"Total users in Table Editor: {len(all_users)}")

    gvp_user_ids = [
        u["id"] for u in all_users 
        if GVP_OWNER_NAME.lower() in u.get("name", "").lower() or GVP_EMAIL.lower() in u.get("email", "").lower()
    ]

    print(f"Preserving GVP Company IDs: {gvp_comp_ids}")
    print(f"Preserving Giriraj Dhoot User IDs: {gvp_user_ids}")

    # 3. Delete extra users
    extra_users = [u for u in all_users if u["id"] not in gvp_user_ids]
    print(f"\nDeleting {len(extra_users)} extra users...")
    for u in extra_users:
        uid = u["id"]
        try:
            client.table("users").delete().eq("id", uid).execute()
            print(f"  [OK] Deleted user: {u.get('name')} ({u.get('email')}) - ID: {uid}")
        except Exception as e:
            print(f"  [ERROR] Deleting user {uid}: {e}")

    # 4. Delete extra companies
    extra_companies = [c for c in all_companies if c["id"] not in gvp_comp_ids]
    print(f"\nDeleting {len(extra_companies)} extra companies...")
    for c in extra_companies:
        cid = c["id"]
        try:
            client.table("companies").delete().eq("id", cid).execute()
            print(f"  [OK] Deleted company: {c.get('company_name')} ({c.get('owner_name')}) - ID: {cid}")
        except Exception as e:
            print(f"  [ERROR] Deleting company {cid}: {e}")

    # 5. Summary verification
    final_comps = client.table("companies").select("id, company_name, owner_name, email").execute().data or []
    final_users = client.table("users").select("id, name, email").execute().data or []

    print("\n" + "=" * 60)
    print("FINAL BACKEND TABLE EDITOR STATE:")
    print(f"Companies remaining ({len(final_comps)}):")
    for c in final_comps:
        print(f"  - {c.get('company_name')} | Owner: {c.get('owner_name')} | Email: {c.get('email')}")
    print(f"Users remaining ({len(final_users)}):")
    for u in final_users:
        print(f"  - {u.get('name')} | Email: {u.get('email')}")
    print("=" * 60)

except Exception as e:
    print(f"Error during purge: {e}")
