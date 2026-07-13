# POS Next - Odoo-Beating Super POS for ERPNext 15+

**Version:** 2.0.0 | **ERPNext:** v15+ | **License:** MIT

POS Next is a complete replacement for ERPNext POS, built to match and **exceed Odoo POS** in power, UX, and reliability. One clone, one install, zero headaches.

### Why migrate customers from Odoo?
- Same taste, faster stack. Customers won't notice they left Odoo.
- 100% offline resilient, 2x faster, fully integrated with ERPNext accounting, stock, loyalty.
- No per-terminal fees.

---

## 🔥 Feature Matrix vs Odoo POS

| Feature | Odoo | ERPNext Default | **POS Next** |
|---|---|---|---|
| **Retail Mode** | ✅ | ✅ | ✅ Superior |
| **Restaurant Mode** | ✅ | ❌ | ✅ Floors, Tables, Guest Count, Transfer, Merge |
| **Supermarket Mode** | ✅ | ❌ | ✅ Weighted Barcode, Hold/Park, Split Bill |
| **KOT (Kitchen Order Ticket)** | ✅ | ❌ | ✅ Auto Print + Printer Routing |
| **KDS (Kitchen Display)** | ✅ | ❌ | ✅ Live `/kds` screen with status |
| **Customer Display** | ✅ | ❌ | ✅ Live `/customer-display` second screen |
| **Bill Printing** | ✅ | Basic | ✅ 5 Premium Templates, ESC/POS |
| **Split Bill** | ✅ | ❌ | ✅ By Item / Qty / Equal - 1 click |
| **Cash In / Cash Out** | ✅ | ❌ | ✅ With Reason, Track, Reports |
| **X / Z Reports** | ✅ | Basic | ✅ Full Audit |
| **Offline** | ✅ | Weak | ✅ IndexedDB + Sync Queue + Conflict Resolver |
| **Reports** | ✅ | Limited | ✅ 8 Power Reports + Dashboard |

---

## 📦 What's Inside

### 1. POS Modes
Dropdown in POS Profile: `Retail / Restaurant / Supermarket / Bar / Bakery / Pharmacy`
- Each mode changes UI, shortcuts, validations.
- Restaurant = Table Map on launch.
- Supermarket = Fast scan, weighted barcode parser.

### 2. Restaurant Suite
- **Floors & Tables**: Doctypes `POS Floor`, `POS Table`. Visual floor planner with drag.
- **Order Types**: Dine In, Takeaway, Delivery, Drive-Through.
- **Table Ops**: Transfer table, Merge tables, Split guest bill, Set guest count.
- **KOT**: On every save/add item, a KOT is generated and sent to kitchen printers. Only new/modified items reprinted.
- **KOT Routing**: Item Group -> Printer mapping (e.g., Grill -> Printer 1, Bar -> Printer 2).

### 3. KDS - Kitchen Display System
Route: `/kds?pos_profile=Your POS`
- Live view, auto refresh 3s or via Realtime (socketio).
- Columns: New → Cooking → Ready → Served.
- Color aging: White (0-5m), Yellow (5-10m), Red (10m+).
- Chef actions: Start Cooking, Ready, Bump.
- Sound alert, printer fallback.
- Works on tablet/TV.

### 4. Customer Display (Second Screen)
Route: `/customer-display?pos_profile=Your POS`
- Connect via `BroadcastChannel` + `localStorage` (works offline, no server).
- Shows: Logo, Items, Qty, Discount, Total, Payment QR, Ads rotation.
- Supports Pole Display ESC/POS via WebSerial (optional).

### 5. Supermarket Power
- **Split Bill**: Select items → Create new invoice; Split by Equal / By Qty; Forfeits loyalty split.
- **Hold / Park**: Dashboard of parked bills, recall.
- **Weighted Barcode**: Parses `21XXXXXWWWWW C` (configurable prefix 20-29) for weight/qty embedded.
- **Multi Bill Creation**: Cashier can keep multiple drafts.

### 6. Cash Operations (Odoo-like)
- Doctype `POS Cash Transaction`: Cash In / Cash Out with reason mandatory, approval limit.
- Buttons in POS: `Cash In`, `Cash Out`, `X Report`, `Z Report / Close`.
- Every transaction updates `POS Opening Shift` cash balance.
- Audit.

### 7. Receipts - 5 Premium Designs
Doctype `POS Receipt Template` with Jinja:
1. **Minimal 80mm** - clean, fast
2. **Restaurant Elegant** - with guest, table, KOT
3. **Supermarket Detailed** - Item codes, MRP, Savings
4. **Odoo Clone** - Looks exactly like Odoo receipt
5. **A4 Invoice** - Full tax invoice

ESC/POS raw printing via QZ Tray or Web Print API support.

### 8. Offline Hard Network
New offline handler `pos_next.public.js.offline_handler`:
- IndexedDB `pos_next_offline` DB: stores invoices, KOTs, cash logs.
- Queue with retry, exponential backoff.
- On network loss: Header turns red, continues billing.
- On restore: Background sync, conflict resolution (server wins if duplicate).
- Prevents duplicate submit using client `offline_id`.

### 9. Reports & Analytics
Built-in Query Reports:
- **POS Sales Summary** - Date, Cashier, Mode, Payment split
- **POS X/Z Report** - Cash drawer audit, expected vs counted
- **POS Cashier Log** - All Cash In/Out + Open/Close
- **POS Product Performance** - Fast/Slow movers by POS Mode
- **POS Hourly Sales** - Heatmap
- **POS Table Wise Sales** - For restaurant
- **KOT / KDS Performance** - Avg cooking time
- **Profit & Tips Report**

### 10. Test Data
`bench --site [site] pos-next-seed` creates demo floor, tables, receipt templates, cash reasons, test KOT items.

---

## 🚀 Installation - One Time Clone

```bash
cd /home/frappe/frappe-bench
bench get-app https://github.com/your-org/pos_next --branch main
bench --site yoursite install-app pos_next

# Build assets
bench --site yoursite migrate
bench build --app pos_next
bench restart

# Seed demo data (optional)
bench --site yoursite execute pos_next.seed.install_demo_data
```

Set in POS Profile:
- Enable POS Next: Check
- Set POS Mode, Receipt Template, Enable KDS, Table Management etc.
- Assign Floors

Add to user permissions: POS Next requires no extra perms, but add roles POS Cashier, Kitchen User.

---

## 🔧 Configuration

### POS Profile Custom Fields Auto-Created:
- `custom_enable_pos_next` (Check)
- `custom_pos_mode` (Select)
- `custom_enable_kds`, `custom_enable_customer_display`
- `custom_enable_table_management`
- `custom_receipt_template`
- `custom_kot_printer_map` (Table)
- `custom_enable_weighted_barcode`, `custom_weighted_barcode_prefixes`
- `custom_enable_cash_in_out`
- `custom_enable_split_bill`
- `custom_enable_offline_hard`
- `custom_customer_display_ad` (HTML)
- `custom_enable_barcodes`

### Printer Setup
1. Install QZ Tray for raw ESC/POS if needed.
2. Map Item Group to Printer IP in POS Profile > KOT Printer Map.

### Customer Display Hardware
- Open `/customer-display` on second screen Chrome kiosk.
- It auto-pairs via POS Profile ID.

---

## 🧪 Test Data Included
- Floor: Ground Floor, Terrace
- Tables: T1-T12, 2-8 seats
- Products: Restaurant combo, Retail, Weighted apple category
- Receipt templates 5 nos
- Cash reasons: Petty cash, Supplier advance, etc.

---

## 🖨️ Receipt Usage
Template selection per POS Profile. Template uses Jinja: `doc`, `items`, `payments`, `company`, `customer`. Override in `POS Receipt Template`.

---

## 📡 API

```
pos_next.api.kds.get_kitchen_orders
pos_next.api.kds.update_kot_status
pos_next.api.pos.get_tables
pos_next.api.pos.create_kot
pos_next.api.pos.split_invoice
pos_next.api.pos.cash_transaction
pos_next.api.pos.get_x_report
pos_next.api.pos.get_z_report
```

All whitelisted and permission checked.

---

## 🔐 Offline Sync Flow
```
Scan -> JS -> IndexedDB save -> Try server POST
If fail -> Enqueue + show offline badge
On online event -> drain queue -> sync -> remove
Z-Report blocked if pending queue > 0
```

---

## 📝 License MIT
Feel free to white-label for all customers.

## Support
We maintain same taste across migrations: Odoo receipt clone, Odoo hotkeys (F1 Discount, F2 Customer, etc.)

Made for customers in Africa / Retail Chains.
