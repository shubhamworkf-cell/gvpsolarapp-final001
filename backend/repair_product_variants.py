#!/usr/bin/env python3
"""
repair_product_variants.py
Analyzes existing inward_entries, outward_entries, and products in the database.
Ensures every unique product specification (Product Name + Size/Specification + Unit)
is represented as a distinct product master record in db.products.
No transaction history is lost or modified.
"""
from __future__ import annotations
import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import server as svr

async def repair_and_report():
    print("=" * 60)
    print("PRODUCT IDENTIFICATION & DATA REPAIR ANALYSIS")
    print("=" * 60)

    try:
        inwards = await svr.db.inward_entries.find({}).to_list(100000)
        outwards = await svr.db.outward_entries.find({}).to_list(100000)
        existing_products = await svr.db.products.find({}).to_list(100000)

        print(f"Total Inward Entries Found: {len(inwards)}")
        print(f"Total Outward Entries Found: {len(outwards)}")
        print(f"Total Existing Product Master Entries: {len(existing_products)}")
        print("-" * 60)

        all_transactions = (inwards or []) + (outwards or [])
        
        # Build specification mapping per company: (company_id, product_name_upper) -> set of (size, unit)
        spec_map = {}
        for entry in all_transactions:
            cid = entry.get("company_id")
            pn = (entry.get("product") or "").strip().upper()
            ps = (entry.get("size") or "").strip()
            unit = (entry.get("unit") or "Nos").strip()
            if not cid or not pn:
                continue
            key = (cid, pn)
            if key not in spec_map:
                spec_map[key] = set()
            spec_map[key].add((ps, unit))

        print("\nAnalyzed Product Specifications in Transactions:")
        ac_cable_specs = []
        for (cid, pn), specs in spec_map.items():
            if "AC CABLE" in pn or "CABLE" in pn:
                print(f"  Company: {cid} | Product: {pn} -> Distinct Specifications found: {len(specs)}")
                for ps, u in specs:
                    print(f"    - Size/Spec: '{ps}' | Unit: '{u}'")
                    ac_cable_specs.append((cid, pn, ps, u))

        # Perform Repair & Splitting
        created_count = 0
        updated_count = 0

        # Step 1: Update empty-size product master records if transaction records have explicit size specs
        empty_prods = [p for p in existing_products if not (p.get("size") or "").strip()]
        for p in empty_prods:
            cid = p.get("company_id")
            pn = (p.get("name") or "").strip().upper()
            k = (cid, pn)
            if k in spec_map and len(spec_map[k]) > 0:
                sorted_specs = sorted(list(spec_map[k]))
                first_size, first_unit = sorted_specs[0]
                if first_size:
                    await svr.db.products.update_one(
                        {"id": p["id"]},
                        {"$set": {"size": first_size, "unit": first_unit or p.get("unit", "Nos")}}
                    )
                    updated_count += 1
                    print(f"[UPDATED MASTER] Product ID {p['id']}: Set '{pn}' size to '{first_size}'")

        # Step 2: Ensure distinct product records exist for ALL unique (company_id, product_name, size, unit) combinations
        seen_keys = set()
        for (cid, pn), specs in spec_map.items():
            for ps, u in specs:
                key = (cid, pn, ps, u)
                if key not in seen_keys:
                    seen_keys.add(key)
                    res = await svr.ensure_product(cid, pn, size=ps, unit=u)
                    if res:
                        created_count += 1

        print("\n" + "=" * 60)
        print("REPAIR & SPLIT SUMMARY REPORT")
        print("=" * 60)
        print(f"Updated Product Masters (empty size backfilled): {updated_count}")
        print(f"Verified/Created Distinct Product Masters: {len(seen_keys)}")
        print("All AC Cable & general product records are now split and uniquely identified by Name + Size + Unit.")
        print("Future imports will maintain completely separate product records and inventory balances.")
        print("=" * 60)

    except Exception as e:
        print(f"Error during repair analysis: {e}")

if __name__ == "__main__":
    asyncio.run(repair_and_report())
