import os
import json
from pymongo import MongoClient
from supabase import create_client, Client
from datetime import datetime
from bson import ObjectId
from dotenv import load_dotenv

# Load environment variables from backend .env
load_dotenv()

# Load table columns from the output file of step 952
step_output_path = r"C:\Users\shree\.gemini\antigravity-ide\brain\8c3f7be1-dcf5-412f-8577-2894ebd00e07\.system_generated\steps\952\output.txt"
with open(step_output_path, "r", encoding="utf-8") as fh:
    raw_data = json.load(fh)

# Parse table_columns mapping: table_name -> set of column_names
table_columns = {}
raw_result = raw_data["result"]
start_idx = raw_result.find('[{"table_name":')
end_idx = raw_result.rfind('}]') + 2
if start_idx != -1 and end_idx != -1:
    json_str = raw_result[start_idx:end_idx]
    cols_list = json.loads(json_str)
    for col in cols_list:
        t_name = col["table_name"]
        c_name = col["column_name"]
        if t_name not in table_columns:
            table_columns[t_name] = set()
        table_columns[t_name].add(c_name)
else:
    print("Could not find column JSON array boundaries!")

# Track valid IDs for referential integrity checks
valid_company_ids = set()
valid_user_ids = set()
valid_client_ids = set()
valid_complaint_ids = set()
valid_mr_ids = set()

# Add default tables to migrate
mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
db_name = os.environ.get("DB_NAME", "solarix_db")
supabase_url = os.environ.get("SUPABASE_URL", "https://arptlbvfjtlnrlnnubwm.supabase.co")
supabase_key = os.environ.get("SUPABASE_KEY", "sb_publishable_pEFU1vx7UYT3l9TMWOlLnw_cx_tZ61N")

mongo_client = MongoClient(mongo_url)
mongo_db = mongo_client[db_name]

supabase_client: Client = create_client(supabase_url, supabase_key)

print(f"Connected to MongoDB: {mongo_url} / {db_name}")
print(f"Connected to Supabase: {supabase_url}")

# Ordering to prevent foreign key errors
tables = [
    "companies",
    "users",
    "clients",
    "tasks",
    "products",
    "material_requests",
    "inward_entries",
    "outward_entries",
    "counters",
    "activity_logs",
    "inverter_monitoring",
    "service_tickets",
    "complaints",
    "complaint_comments",
    "complaint_audit",
    "notifications",
    "files",
    "inventory_defaults",
    "document_templates",
    "password_reset_tokens",
    "password_reset_otps",
    "verifications",
    "projects",
    "employees"
]

def clean_doc(doc, table_name):
    # PyMongo ObjectId to string
    if "_id" in doc:
        del doc["_id"]
    
    # Ensure there is an id
    if "id" not in doc and table_name not in ["counters", "inventory_defaults", "password_reset_tokens"]:
        import uuid
        doc["id"] = str(uuid.uuid4())
        
    # Serialize datetimes and ObjectIds to strings
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
        elif isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, dict) or isinstance(v, list):
            doc[k] = clean_nested(v)
            
    # Foreign key checks to prevent constraint violations
    if "company_id" in doc and doc["company_id"] not in valid_company_ids:
        if table_name != "companies" and valid_company_ids:
            doc["company_id"] = list(valid_company_ids)[0]
            
    for k in ["created_by", "assigned_to", "uploader_id", "user_id", "requested_by", "raised_by", "to_user_id"]:
        if k in doc and doc[k] not in valid_user_ids:
            doc[k] = None
            
    if "client_id" in doc and doc["client_id"] not in valid_client_ids:
        doc["client_id"] = None
        
    if "complaint_id" in doc and doc["complaint_id"] not in valid_complaint_ids:
        doc["complaint_id"] = None
        
    if "material_request_id" in doc and doc["material_request_id"] not in valid_mr_ids:
        doc["material_request_id"] = None
            
    # Filter keys to only keep those that exist in Postgres table columns
    if table_name in table_columns:
        valid_cols = table_columns[table_name]
        for k in list(doc.keys()):
            if k not in valid_cols:
                del doc[k]
            elif (k.endswith("_id") or k in ["created_by", "assigned_to", "uploader_id", "user_id"]) and doc[k] == "":
                doc[k] = None
                
    if table_name == "counters" and "type" not in doc:
        doc["type"] = "client"
        
    if table_name == "notifications" and doc.get("audience") is None:
        doc["audience"] = "user" if doc.get("to_user_id") else "admin"
                
    return doc

def clean_nested(val):
    if isinstance(val, dict):
        return {k: clean_nested(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [clean_nested(v) for v in val]
    elif isinstance(val, ObjectId):
        return str(val)
    elif isinstance(val, datetime):
        return val.isoformat()
    return val

# Delete existing rows in Supabase before migrating
print("\n--- Cleaning target Supabase tables ---")
for t in reversed(tables):
    try:
        if t in table_columns:
            valid_cols = table_columns[t]
            if "company_id" in valid_cols:
                supabase_client.table(t).delete().neq("company_id", "dummy").execute()
            elif "id" in valid_cols:
                supabase_client.table(t).delete().neq("id", "dummy").execute()
            elif "token" in valid_cols:
                supabase_client.table(t).delete().neq("token", "dummy").execute()
            elif "email" in valid_cols:
                supabase_client.table(t).delete().neq("email", "dummy").execute()
            print(f"  Cleaned {t}")
    except Exception as e:
        print(f"  Could not clean {t}: {e}")

print("\n--- Copying collections ---")
for t in tables:
    mongo_col = mongo_db[t]
    count = mongo_col.count_documents({})
    print(f"\nTable '{t}': {count} documents in MongoDB")
    if count == 0:
        continue
        
    docs = list(mongo_col.find())
    cleaned_docs = [clean_doc(d, t) for d in docs]
    
    # Insert in batches of 50
    batch_size = 50
    for i in range(0, len(cleaned_docs), batch_size):
        batch = [row for row in cleaned_docs[i:i+batch_size] if row]  # filter empty dicts
        if not batch:
            continue
        try:
            res = supabase_client.table(t).insert(batch).execute()
            print(f"  Inserted batch {i//batch_size + 1} ({len(batch)} rows)")
            
            # Populate ID sets for foreign keys checks
            for row in batch:
                row_id = row.get("id") or row.get("token")
                if not row_id:
                    continue
                if t == "companies":
                    valid_company_ids.add(row_id)
                elif t == "users":
                    valid_user_ids.add(row_id)
                elif t == "clients":
                    valid_client_ids.add(row_id)
                elif t == "complaints":
                    valid_complaint_ids.add(row_id)
                elif t == "material_requests":
                    valid_mr_ids.add(row_id)
                    
        except Exception as e:
            # We print errors cleanly without breaking on encoding issues
            print(f"  ERROR inserting batch {i//batch_size + 1} in {t}")
            # Try inserting one-by-one to find error row
            for row in batch:
                try:
                    supabase_client.table(t).insert(row).execute()
                except Exception as ex:
                    # Log cleanly without raising exception or print with ascii representation
                    print(f"    Failed row details: {repr(row)}")
                    print(f"    Row error: {ex}")
                    raise ex

print("\n--- Verification ---")
for t in tables:
    mongo_count = mongo_db[t].count_documents({})
    try:
        res = supabase_client.table(t).select("count", count="exact").execute()
        sb_count = res.count if res.count is not None else len(res.data)
        status = "OK" if mongo_count == sb_count else "MISMATCH"
        print(f"Table '{t}': Mongo count = {mongo_count}, Supabase count = {sb_count} -> {status}")
    except Exception as e:
        print(f"Table '{t}': Mongo count = {mongo_count}, Supabase count = ERR ({e})")
