import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase_service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

print(f"URL: {supabase_url}")
print(f"Has Service Key: {supabase_service_key is not None}")

client: Client = create_client(supabase_url, supabase_key)

async def test_rpcs():
    print("\n--- Testing RPCs ---")
    # Let's see if we can call check_email_exists
    try:
        res = client.rpc("check_email_exists", {"email_to_check": "nonexistent@example.com"}).execute()
        print(f"check_email_exists success: {res.data}")
    except Exception as e:
        print(f"check_email_exists failed: {e}")

    # Let's see if there is a delete_auth_user or similar RPC
    try:
        res = client.rpc("delete_auth_user", {"p_email": "nonexistent@example.com"}).execute()
        print(f"delete_auth_user success: {res.data}")
    except Exception as e:
        print(f"delete_auth_user failed: {e}")

    # Let's try listing auth users via users table
    try:
        res = client.table("users").select("id, email, role").execute()
        print(f"public.users count: {len(res.data) if res.data else 0}")
        if res.data:
            print("Sample users:")
            for u in res.data[:5]:
                print(f"  ID: {u.get('id')}, Email: {u.get('email')}, Role: {u.get('role')}")
    except Exception as e:
        print(f"Failed to query public.users: {e}")

if __name__ == "__main__":
    asyncio.run(test_rpcs())
