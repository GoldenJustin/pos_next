# POS Next - Modern Retail & Restaurant POS for ERPNext

**Version:** 3.0.0 | **ERPNext:** v15, v16 | **Frappe:** v15, v16 | **License:** MIT

POS Next is a modern, professional, high-performance Point of Sale app for ERPNext. Built for all retail formats - single shops, supermarkets, wholesale, pharmacy, fashion, electronics, restaurants, bars and multi-branch chains.

Fast, elegant, offline-resilient and packed with operational tools that usually require separate systems.

### Brand
- No external references, 100% standalone ERPNext app
- Professional iconography, clean purple/indigo theme (#5A67D8)
- Works as its own Desk Workspace `POS Next` with icon

---

## ✨ Feature Overview

### 1. Business Modes
Select in POS Profile:
- **Retail** - classic counter sale
- **Wholesale** - price lists, bulk qty, credit limits
- **Supermarket** - weighted barcodes, park/hold, split bill
- **Restaurant** - floors, tables, guest count, order types
- **Bar, Bakery, Pharmacy, Fashion, Multi-Business**

Each mode adapts UI shortcuts and workflows.

### 2. Restaurant Suite
- **Floors & Tables**: Visual management in `POS Floor`, `POS Table`. Status colors, round/square shapes, seats, transfer, merge, clear.
- **Order Types**: Dine In, Takeaway, Delivery, Drive-Thru, Quick Sale, Wholesale
- **KOT (Kitchen Order Ticket)**: Fires only new items, printer routing by Item Group, auto print, history, notes.
- **Table Operations**: Occupied → Available auto on invoice submit, transfer table (move invoice), merge tables (future), guest count tracking.

### 3. Kitchen Display System (KDS)
**Route:** `/kds?pos_profile=YourProfile`

Modern dark UI for kitchen:
- Columns: New → Cooking → Ready → Served (recent)
- Aging: White 0-5m, Yellow 5-10m, Red 10m+ with animation
- Priority flags: Normal, Urgent, VIP
- Actions: Start Cooking, Mark Ready, Served/Bump
- Beep sound on new order, auto-refresh 3s, fullscreen, realtime via socket
- Performance: avg cooking time, total time

Works on tablet, TV, kitchen monitor. No extra hardware.

### 4. Customer Display (Second Screen)
**Route:** `/customer-display?pos_profile=YourProfile`

Second screen that runs in browser:
- BroadcastChannel + localStorage → zero latency, works offline
- Shows: store name, items, qty, rate, subtotal, tax, grand total, QR payment, footer ad
- States: Idle (welcome), Cart Update, Payment Thank You
- Ad HTML configurable in POS Profile or POS Next Settings
- Fullscreen, suitable for 1024x768 customer pole display

### 5. Retail & Supermarket Power
- **Weighted Barcode:** Reads prefixes 20-29, parses `PP IIIII WWWWW C` → weight as qty. Ideal for fruits, vegetables, cheese.
- **Hold / Park Bill:** Save current cart to localStorage, recall later, survives reload. List of parked bills with recall.
- **Split Bill:** Dialog with source → target panels. Split by selected items, by qty (if qty>1), equal split. Creates linked split invoices `custom_parent_invoice`.
- **Multi-bill Workflow:** Park one, start new, checkout parallel.

### 6. Cash Management
- **Cash In / Cash Out**: From POS action bar, with mandatory reason, reference, linked to opening shift, submittable `POS Cash Transaction`
- **X Report**: Mid-day summary: Opening cash, sales total, payments breakdown, cash in/out, expected cash
- **Z Report**: Closing report: counted vs expected, difference flagged, shortage alert
- **Audit**: `POS Cashier Log` report, all movements tracked

### 7. Receipts - 5 Premium Templates
Jinja templates in `POS Receipt Template`:
1. **Minimal 80mm** - fast thermal, logo, QR
2. **Modern Retail** - clean card style, purple badge, perfect for fashion/electronics
3. **Restaurant Elegant** - serif, fine dining border, guest/table/order type, kitchen notes
4. **Supermarket Detailed** - compact monospace, savings, barcode, item code
5. **A4 Tax Invoice** - full A4 tax compliant, company, billing, taxes, payments, signature

ESC/POS optimized, works with `window.print()` or QZ Tray / WebUSB raw printing. Choose per POS Profile.

### 8. Offline - Hard Network Resilience
`offline_handler.js`:
- IndexedDB `pos_next_offline_v2` DB: invoices, kots, cash, sync_queue
- Badge: Red offline with pending count, Green syncing
- Every invoice/KOT/Cash saved locally + queued
- Sync with exponential backoff, retry 10x, conflict resolution via `offline_id`
- Customer display still works offline (BroadcastChannel is local)
- Z Report blocked if pending queue > 0

Superior to built-in POS offline (localStorage only).

### 9. Reports & Analytics (8 reports)
- **POS Sales Summary** - sales by profile, customer, payment mode, donut chart
- **POS X Z Report** - shifts, opening cash, expected vs counted
- **POS Cashier Log** - all Cash In/Out
- **POS Product Performance** - fast/slow movers
- **POS Hourly Sales** - heatmap bar chart
- **POS Table Wise Sales** - per table revenue, guests
- **KOT Performance** - cooking time, total time analysis

Access via Workspace POS Next → Reports or hotkeys F9/F10.

### 10. Desk Integration
- **Workspace:** `POS Next` workspace with sections: POS Operations, Master Data, Receipt & Printing, Settings & Tools, Reports. Icon = `pos`, Color = purple. Shortcuts for Opening Shift, Floors, KOT, Cash.
- **Module:** Module Def `POS Next` with icon `octicon-package` color `#5A67D8`
- **Settings:** Single DocType `POS Next Settings` - global toggles for restaurant, KDS, customer display, supermarket, offline, cash, receipts, shortage limit, footer text, sound. Central control.
- **App Icon:** `/assets/pos_next/images/pos-next-icon.svg` and PNG for Apps screen (`add_to_apps_screen`)
- **Roles:** Kitchen User, POS Cashier Manager, POS Manager

### 11. Performance
- Bundle size ~67KB JS + 5KB CSS
- No heavy dependencies, pure Frappe + IndexedDB
- Lazy KDS refresh 3s, not polling invoice list
- Works on low-end Android tablets

---

## 📦 Installation - Frappe v15 & v16 Compatible

**Important v16 fix:** App has **no pip dependencies** (`dependencies = []`) to avoid `uv` resolver error with `pypika @ git+...`. It depends only on ERPNext via `required_apps`.

```bash
cd /home/frappe/frappe-bench
bench get-app pos_next https://github.com/GoldenJustin/pos_next.git --branch main
bench --site yoursite install-app pos_next
bench --site yoursite migrate
bench build --app pos_next
bench restart
bench --site yoursite execute pos_next.seed.setup_after_install
bench --site yoursite execute pos_next.seed.install_demo_data
```

If bench build fails with supervisorctl not found (docker), ignore, use `bench --site yoursite clear-cache`.

### Post Install Configuration

1. Open **POS Next Settings** (via Workspace POS Next → Settings)
   - Set Business Type
   - Toggle Restaurant / Supermarket / KDS / Customer Display / Offline / Cash In-Out

2. Open **POS Profile**
   - Enable **Enable POS Next**
   - Set POS Mode: Retail / Restaurant / Supermarket / Wholesale
   - Assign Receipt Template (Modern Retail recommended)
   - Fill KOT Printer Map: Item Group → Printer Name / IP
   - Enable Table Management if restaurant

3. Create **POS Floor** and **POS Tables** or run demo seed:
   ```
   bench --site yoursite execute pos_next.seed.seed_demo_for_profile --kwargs "{'pos_profile':'Your Profile Name'}"
   ```

4. Open **Point of Sale** — new top bar appears: mode badge, table info, offline indicator, Tables, Hold, Split, Cash In, Cash Out, Reports.

5. For kitchen: open `https://yoursite/kds?pos_profile=YourProfile` on tablet/TV

6. For customer: open `https://yoursite/customer-display?pos_profile=YourProfile` on second screen chrome, drag to extended display, F11 fullscreen.

---

## 🧩 DocTypes

- POS Floor
- POS Table
- POS KOT + POS KOT Item (child)
- POS Receipt Template
- POS Cash Transaction
- POS KOT Printer Map (child)
- POS Next Settings (Single)

Custom fields added to POS Profile, POS Invoice, POS Invoice Item via `seed.py` to avoid fixture import errors.

---

## 🖨️ Printing

All receipts use Jinja `doc`, `items`, `payments`, `taxes`, `company`. Edit in `POS Receipt Template`.

For 80mm thermal: use Minimal or Modern Retail, enable ESC/POS optimized, print via browser.

For raw ESC/POS silent: install QZ Tray, configure printer IP in KOT Printer Map, enable in receipt template.

---

## 🔐 Offline Flow

1. Network dies → red badge “OFFLINE – X pending”
2. Billing continues, IndexedDB saves locally
3. Customer Display still live (local channel)
4. Network back → green badge syncing → background sync to server via `pos_next.api.pos.create_kot` / `cash_transaction` / invoice sync
5. Duplicate protection via `custom_offline_id`

---

## 📝 License MIT - Standalone, no external pip packages required.

Designed for modern retailers & restaurants worldwide. Fast, professional, ready for multi-branch.

