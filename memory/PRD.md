# Solarix - Solar CRM SaaS

## Problem Statement
Multi-tenant Solar CRM SaaS for Solar EPC/Vendor companies. Phase 1: auth, company profile, client CRM, team & RBAC, notifications, activity logs. Phase 2+: project execution, installer task portal, inventory, AI bulk import (Inward + Outward), DOCX templates, client data & service tickets, ERP-grade inventory tooling.

## Architecture
- **Backend:** FastAPI + MongoDB (motor async), JWT auth, bcrypt, Emergent Object Storage, multi-tenant via `company_id`.
- **Frontend:** React 19 + Tailwind + shadcn/ui, React Router v7, dayjs (relativeTime), sonner toasts.
- **AI:** Claude Sonnet 4.5 via `emergentintegrations` + Emergent LLM key.
- **DOCX engine:** python-docx run-aware substitution.

## Implemented

### Sprint 9 — Complaint Management Module (2026-06-24)
- ✅ Backend: 11 endpoints — `POST/GET /api/complaints`, `GET /api/complaints/stats`, `GET/PATCH/DELETE /api/complaints/{id}`, `POST/GET /api/complaints/{id}/comments`, `GET /api/complaints/{id}/audit`, `POST /api/complaints/{id}/convert-to-task`, `GET /api/complaints/lookup/assignable-users`. New collections: `complaints`, `complaint_comments`, `complaint_audit`. Counter `CMP-YYYY-NNNN` per company. Categories: Installation/Material/Customer/Document/Inverter/Service/Payment/Team/Other. Priorities: Low/Medium/High/Urgent. Statuses: Open → Assigned → In Progress → Waiting → Resolved → Closed. Resolution note MANDATORY for Resolved. Escalation computed on read: yellow ≥24h, red ≥48h (only non-Resolved/Closed). Convert-to-Task requires Admin/Supervisor + assigned_to + client_id. Delete = Admin only and purges comments + audit.
- ✅ Frontend: `/complaints` dashboard with 6 stat cards (Total/Open/In Progress/Resolved/High Priority/My Complaints) + escalation banner + filters (status/priority/category/date range/search) + `+ New Complaint` dialog. `/complaints/:id` detail page with status select (dropdown auto-opens resolve dialog if Resolved), Re-assign dialog, Convert-to-Task button, Comments thread (attachments), Audit log tab. ClientDataDetail: `Raise Complaint` button with lockedClient (renders client name in disabled input). TaskPortal: open-complaints summary card + Complaints tab. Sidebar: `Complaint Center` entry visible to all roles via ALWAYS_VISIBLE set.
- ✅ Tested: 22/22 backend pytests pass. Frontend smoke + agent verified create/detail/status/resolve-note-required/comments/audit/reassign/convert-to-task/lockedClient/TaskPortal-complaints-tab flows. Live: `#CMP-2026-0001` created from UI.

### Sprint 8 — Inventory Polish + Profile Improvements + Task Portal Visibility (2026-06-22)
- ✅ Challan/Bill digitsOnly enforcement across InwardTab, OutwardTab, EditTransactionDialog, AiBulkImport inline cells, and Default Settings panel (frontend mirror of backend `numeric_only`).
- ✅ AiBulkImport: VendorCombo (inward) + ClientCombo (outward) — fetch existing vendor names / clients, red-warning banner + per-row red border when AI extraction misses Vendor/Client, import button blocked with toast until each row is filled.
- ✅ TaskPortal: admin `My Tasks / All Team Tasks` scope toggle, 6 team-view stat cards (Total/Pending/In Progress/Completed/Overdue/Completion %), "Progress by Employee" with completion % bars, Employee + Status filter dropdowns on All Team Tasks.
- ✅ Profile: top-right avatar = ProfileMenu dropdown (My Profile / Change Email / Change Password / Company Details / Logout). PATCH `/api/auth/me` (name/mobile/photo), POST `/api/auth/change-email` (with current password gate), POST `/api/auth/change-password` (current + new ≥ 6 chars). Photo upload via Emergent Object Storage. AuthContext listens to `solarix:auth-refresh` window event.
- ✅ GET `/api/inventory/vendors` returns distinct non-empty vendor names per company.
- ✅ Fixed regression: `BulkRow` model now includes `bill_number`; bulk-inward persists it via `numeric_only()`.
- ✅ Tested: 13/13 Sprint-8 backend + 22/22 Sprint-9 backend pass. Frontend smoke + agent-verified.

### Sprint 7 — AI Bulk Import (Outward) (2026-06-21)
- ✅ Extended `ai_inventory_extractor.py` with **OUTWARD schema** — new `OUTWARD_SYSTEM_PROMPT` instructs Claude to emit `outward_challan_no`, `client_name`, `project_name`, `status (Pending/Dispatched/Cancelled)` instead of inward's `reference_number`/`source_name`. New helpers: `_normalize_outward_rows`, `extract_outward_from_image/pdf/excel/upload`. Refactored `_call_claude_vision/text` to accept a system_prompt parameter (DRY pivot point for future variants).
- ✅ New endpoints: `POST /api/inventory/ai-extract-outward` (multipart, auto-resolves `client_id` from `clients.full_name` case-insensitive — multi-tenant safe), `POST /api/inventory/bulk-outward` (creates `outward_entries` with `source='ai-bulk-import'`, `import_batch`, default status=Dispatched, auto product-creation via `ensure_product`).
- ✅ Frontend: `AiBulkImport` upgraded to a **dual-mode component** (`mode="inward"` | `"outward"`). Preview table swaps columns dynamically — outward shows Out. Challan / Client+Project / Status (Pending/Dispatched/Cancelled) editable inline; inward keeps Reference + Source. Header gets amber-orange gradient for outward, indigo-blue for inward. Wired into Outward tab's "AI Bulk Import (Outward)" button.
- ✅ Tested: **16/16 backend tests passed**.

### Sprint 6 — ERP-Grade Data Management Upgrade
- 40/40 backend (+ 1 xfail later fixed). Product Drawer, paginated history with advanced filters, bulk delete + export, auto-continue entry, smart challan generation, product stats/transactions endpoints.

### Sprint 5 — Redesigned Data Management page
- 28/28 backend. Tabbed UI, defaults, attachments, edit/delete, Material-Request → Pending outward → Dispatched.

### Sprint 4 — Client Data & Asset Management (Page 6)
- 31/31 backend.

### Sprint 3 — DOCX Template Engine
- 24/24 backend.

### Sprint 2 — AI Bulk Inventory Import (Inward, Claude Sonnet 4.5)
- 15/15 backend.

### Earlier Phases — auth, clients, projects, tasks, verifications, templates, etc.

## Prioritized Backlog
- **P0** Refactor `server.py` (now 2137+ lines) into `routes/inventory.py`, `routes/material_requests.py`, `routes/client_data.py`, `routes/templates.py`, `routes/service_tickets.py`, `routes/ai_extract.py`. Now blocking readability.
- **P0** DRY `ai_inventory_extractor.py` — collapse near-duplicate `extract_from_*` / `extract_outward_from_*` into a single generic `extract(*, system_prompt, normalizer)` (~150 lines of duplication today).
- **P1** Validate UNIT_OPTIONS + status on Pydantic `BulkOutwardRow` / `InwardIn` / `OutwardIn` models (currently coerced silently in code).
- **P1** Push inventory history filters into MongoDB `$match` aggregation + `$skip/$limit` (Python-side O(N) today).
- **P1** Bulk-outward + bulk-inward + bulk-delete should cap payload at 500 rows + reject negative balances (Dispatched outward against zero stock currently allowed).
- **P1** Add `truncated: true` flag when AI Excel extraction caps at 500 rows.
- **P1** Atomic counter for ticket_no + challan_no (currently scan-based).
- **P1** Per-client PDF record + true .xlsx export with formatting.
- **P1** Engineer push (email/WhatsApp) on ticket assignment.
- **P2** Cap bulk-delete IDs at 1000; properly paginate `/products/{id}/transactions`.
- **P2** CSV streaming via iterator instead of in-memory full scan + 100k cap.
- **P2** Backfill `min_stock`/`category` on legacy products; persist `challan_number_int` for O(1) next-challan lookup.
- **P2** Image insertion in DOCX templates · `.doc → .docx` conversion · Persist AI extraction previews · Strip `//` comments from LLM JSON output.
- **P2** Stripe/Razorpay billing · WhatsApp notifications · Mobile installer app.
- **P3** Cleanup endpoint or pytest fixture teardown for accumulating TEST_S*_* seed data.

## Next Tasks
1. Split server.py into router modules.
2. DRY the extractor module (eliminate ~150 lines of duplication).
3. Add Pydantic validators for unit + status on bulk models.
4. Aggregation-pipeline + DB-level pagination for inventory history.
5. Per-client PDF record + true .xlsx export.
6. Engineer push on ticket assignment.
7. Fix pre-existing employee_id login bug.

## Key Files
- `/app/backend/server.py` — main FastAPI app
- `/app/backend/ai_inventory_extractor.py` — Sprint 2 inward + Sprint 7 outward
- `/app/backend/docx_template_engine.py` — Sprint 3
- `/app/frontend/src/pages/Inventory.js` — shell w/ 6 stat cards + tabs
- `/app/frontend/src/components/Inventory/{InwardTab,OutwardTab,ProductMasterTab,BalanceTab,HistoryTab,ProductDrawer,EditTransactionDialog,_shared}.js` — Sprint 5/6 components
- `/app/frontend/src/components/AiBulkImport.js` — Sprint 2/7 dual-mode dialog
- `/app/frontend/src/pages/ClientData.js`, `ClientDataDetail.js` — Sprint 4
- `/app/frontend/src/pages/DocumentTemplates.js` + `components/TemplateGenerateDialog.js` — Sprint 3
- `/app/memory/test_credentials.md` — admin login
