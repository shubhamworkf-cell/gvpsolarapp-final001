#!/usr/bin/env python3
"""
migrate_size_format.py
One-Time Existing Data Migration Script for Size Format Standardization & Product Merging.

Tasks:
1. Scan all existing records in inward_entries, outward_entries, and products.
2. Convert every size format (e.g. 4Cx95, 4cX95, 4C X 95, 4C×95) to standard format using '*' (4C*95).
3. Recalculate matching based on Product Name + Standardized Size.
4. Merge/relink duplicate products created because of different size formats.
5. Preserve stock quantity, inward history, outward history, ledger, reports, and product master.
6. Do NOT delete or lose any transaction history.
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

async def main():
    print("=" * 70)
    print("EXISTING DATA MIGRATION: SIZE FORMAT STANDARDIZATION & DEDUPLICATION")
    print("=" * 70)
    
    await svr.run_one_time_size_standardization_migration()
    
    # Audit summary
    flag = await svr.db.system_settings.find_one({"key": "migration_size_standardization_v1"})
    print("Migration status:", flag)
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(main())
