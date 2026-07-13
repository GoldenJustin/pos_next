import frappe
from frappe.utils import nowdate, nowtime, now_datetime, flt
import json
from frappe import _

@frappe.whitelist()
def get_tables(pos_profile):
    tables = frappe.get_all("POS Table", filters={"pos_profile": pos_profile}, fields=["name", "table_name", "floor", "seats", "status", "current_invoice", "x_coordinate", "y_coordinate", "color", "shape", "width", "height"], order_by="table_name asc")
    floors = frappe.get_all("POS Floor", filters={"pos_profile": pos_profile}, fields=["name", "floor_name", "floor_color"], order_by="floor_name asc")
    # Attach invoices data for occupied tables
    for t in tables:
        if t.current_invoice:
            inv = frappe.db.get_value("POS Invoice", t.current_invoice, ["grand_total", "customer", "custom_guest_count", "custom_order_type"], as_dict=1)
            if inv:
                t["invoice_data"] = inv
    return {"tables": tables, "floors": floors}

@frappe.whitelist()
def update_table_status(table, status, invoice=None):
    doc = frappe.get_doc("POS Table", table)
    doc.status = status
    if invoice is not None:
        doc.current_invoice = invoice if invoice else ""
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_dict()

@frappe.whitelist()
def create_kot(pos_profile, data):
    """
    data: JSON string or dict containing:
      pos_invoice, table, order_type, guest_count, customer, items [{item_code, qty, kot_notes, uom}]
    """
    if isinstance(data, str):
        data = json.loads(data)

    # validate POS Profile
    if not pos_profile:
        frappe.throw(_("POS Profile missing"))

    kot = frappe.new_doc("POS KOT")
    kot.pos_profile = pos_profile
    kot.company = frappe.db.get_value("POS Profile", pos_profile, "company")
    kot.pos_invoice = data.get("pos_invoice")
    kot.table = data.get("table")
    kot.order_type = data.get("order_type") or "Dine In"
    kot.guest_count = data.get("guest_count") or 1
    kot.customer = data.get("customer")
    kot.cashier = frappe.session.user
    kot.remarks = data.get("remarks")
    kot.kot_status = "Sent to Kitchen"
    kot.order_time = now_datetime()
    kot.fired_time = now_datetime()
    kot.is_fired = 1
    kot.offline_id = data.get("offline_id")

    # printer routing based on POS Profile
    printer_map = {}
    try:
        profile_doc = frappe.get_doc("POS Profile", pos_profile)
        if hasattr(profile_doc, 'custom_kot_printer_map'):
            for row in profile_doc.custom_kot_printer_map:
                printer_map[row.item_group] = row.printer_name
    except Exception:
        pass

    for it in data.get("items", []):
        if not it.get("item_code"):
            continue
        # Avoid duplicate if already fired logic should be handled in frontend, but we create anyway
        item_group = frappe.db.get_value("Item", it["item_code"], "item_group")
        printer = printer_map.get(item_group) or printer_map.get("Default") or ""
        kot.append("items", {
            "item_code": it["item_code"],
            "item_name": it.get("item_name") or frappe.db.get_value("Item", it["item_code"], "item_name"),
            "qty": it.get("qty") or 1,
            "kot_notes": it.get("kot_notes") or it.get("custom_kot_notes") or "",
            "printer": printer,
            "fired": 1,
            "kot_status": "New"
        })

    if not kot.items:
        frappe.throw(_("No items to fire KOT"))

    kot.insert(ignore_permissions=True)
    kot.db_set("kot_status", "Sent to Kitchen")
    frappe.db.commit()

    # Realtime broadcast
    frappe.publish_realtime("pos_next_kot_created", {"kot": kot.name, "table": kot.table}, after_commit=True)

    return kot.as_dict()

@frappe.whitelist()
def split_invoice(invoice, split_data):
    """
    split_data: JSON string with list: [{item_code, qty, rate, ...}] for new invoice
    or strategy: {type: 'by_item', items: [indexes], equal_parts: 2}
    Returns new invoice(s)
    """
    if isinstance(split_data, str):
        split_data = json.loads(split_data)

    source = frappe.get_doc("POS Invoice", invoice)
    if source.docstatus != 0:
        frappe.throw(_("Only draft invoices can be split"))

    # Strategy handling
    new_invoices = []
    splits = []

    if isinstance(split_data, dict) and split_data.get("type") == "equal":
        parts = int(split_data.get("parts", 2))
        # split items proportional? Simplified: clone invoice equally by total but actually create N invoices with same items divided qty?
        # We'll implement: duplicate grand_total split logic via identical clone but adjust payments later in UI.
        for _ in range(parts-1):
            splits.append(source.items) # placeholder - frontend should prepare item splits
    elif isinstance(split_data, dict) and "splits" in split_data:
        splits = split_data["splits"]  # list of lists of item idx
    elif isinstance(split_data, list):
        splits = split_data

    # If splits is list of item groups
    for group in splits:
        # group could be list of item dicts with full row data
        if not group:
            continue
        new_inv = frappe.copy_doc(source)
        new_inv.name = None
        new_inv.items = []
        new_inv.custom_is_split = 1
        new_inv.custom_parent_invoice = source.name
        new_inv.custom_offline_id = f"split-{frappe.generate_hash(length=8)}"
        new_inv.set("payments", [])  # clear payments to be set on payment
        # group handling
        if isinstance(group, list) and len(group) > 0 and isinstance(group[0], dict) and "item_code" in group[0]:
            # dict list
            for it in group:
                # find source item match
                new_inv.append("items", {
                    "item_code": it.get("item_code"),
                    "qty": it.get("qty", 1),
                    "rate": it.get("rate"),
                    "uom": it.get("uom"),
                    "custom_kot_notes": it.get("custom_kot_notes")
                })
        elif isinstance(group, list) and isinstance(group[0], int):
            # indexes
            for idx in group:
                src_item = source.items[idx]
                new_inv.append("items", {
                    "item_code": src_item.item_code,
                    "qty": src_item.qty,
                    "rate": src_item.rate,
                    "uom": src_item.uom,
                })
        else:
            continue

        # Recalc taxes and totals
        new_inv.insert(ignore_permissions=True)
        new_invoices.append(new_inv.name)

    # Update source invoice as split/remaining? Keep source but we might adjust source to remove splitted items?
    # For simplicity, we don't auto-remove. UI will handle removal.
    frappe.db.commit()
    return {"new_invoices": new_invoices, "source": source.name}

@frappe.whitelist()
def cash_transaction(pos_profile, transaction_type, amount, reason, reference=None, opening_shift=None):
    amount = flt(amount)
    if amount <= 0:
        frappe.throw(_("Amount must be > 0"))
    if not reason:
        frappe.throw(_("Reason mandatory"))

    if not opening_shift:
        # get latest open shift for this profile/user
        opening_shift = frappe.db.get_value("POS Opening Shift", {"pos_profile": pos_profile, "user": frappe.session.user, "status": "Open", "docstatus": 1}, "name")

    doc = frappe.new_doc("POS Cash Transaction")
    doc.transaction_type = transaction_type
    doc.pos_profile = pos_profile
    doc.company = frappe.db.get_value("POS Profile", pos_profile, "company")
    doc.posting_date = nowdate()
    doc.posting_time = nowtime()
    doc.amount = amount
    doc.cashier = frappe.session.user
    doc.reason = reason
    doc.reference = reference
    doc.pos_opening_shift = opening_shift
    doc.insert(ignore_permissions=True)
    doc.submit()

    frappe.db.commit()
    return doc.as_dict()

@frappe.whitelist()
def get_x_report(pos_profile, opening_shift=None):
    from erpnext.accounts.doctype.pos_invoice.pos_invoice import get_stock_availability
    # Basic X Report: current shift sales sum
    if not opening_shift:
        opening_shift = frappe.db.get_value("POS Opening Shift", {"pos_profile": pos_profile, "user": frappe.session.user, "status": "Open", "docstatus": 1}, "name")

    if not opening_shift:
        return {"error": "No open shift"}

    opening_doc = frappe.get_doc("POS Opening Shift", opening_shift)

    invoices = frappe.get_all("POS Invoice", filters={"pos_profile": pos_profile, "pos_opening_shift": opening_shift, "docstatus": 1}, fields=["name", "grand_total", "paid_amount", "status"])

    total_sales = sum([flt(i.grand_total) for i in invoices])
    payments = frappe.db.sql("""
        SELECT mop.mode_of_payment, SUM(mop.amount) as amount
        FROM `tabSales Invoice Payment` mop
        JOIN `tabPOS Invoice` pi ON pi.name = mop.parent
        WHERE pi.pos_opening_shift = %s AND pi.docstatus = 1
        GROUP BY mop.mode_of_payment
    """, (opening_shift,), as_dict=1)

    cash_transactions = frappe.get_all("POS Cash Transaction", filters={"pos_opening_shift": opening_shift, "docstatus": 1}, fields=["transaction_type", "amount", "reason", "posting_time"])

    cash_in = sum([flt(t.amount) for t in cash_transactions if t.transaction_type == "Cash In"])
    cash_out = sum([flt(t.amount) for t in cash_transactions if t.transaction_type == "Cash Out"])

    expected_cash = flt(opening_doc.balance_details[0].opening_amount if opening_doc.balance_details else 0) + sum([flt(p.amount) for p in payments if p.mode_of_payment.lower() == "cash"]) + cash_in - cash_out

    return {
        "pos_profile": pos_profile,
        "opening_shift": opening_shift,
        "opening_amount": opening_doc.balance_details[0].opening_amount if opening_doc.balance_details else 0,
        "total_sales": total_sales,
        "invoice_count": len(invoices),
        "payments": payments,
        "cash_in": cash_in,
        "cash_out": cash_out,
        "expected_cash": expected_cash,
        "cash_transactions": cash_transactions,
        "period_start": opening_doc.period_start_date,
        "generated_at": now_datetime()
    }

@frappe.whitelist()
def get_z_report(pos_profile, opening_shift=None, closing_amount=None):
    # Z report = final closing after shift close
    x = get_x_report(pos_profile, opening_shift)
    if "error" in x:
        return x
    x["report_type"] = "Z"
    x["closing_amount"] = closing_amount or x["expected_cash"]
    x["difference"] = flt(x["closing_amount"]) - flt(x["expected_cash"])
    return x

# POS invoice hooks
def before_pos_invoice_submit(doc, method):
    # Generate final KOT if needed
    pass

def on_pos_invoice_submit(doc, method):
    # Auto set table to Available and clear current_invoice
    if doc.get("custom_table"):
        try:
            frappe.db.set_value("POS Table", doc.custom_table, {"status": "Available", "current_invoice": ""})
        except Exception:
            pass
    # If restaurant, mark all related KOTs as Served
    kots = frappe.get_all("POS KOT", filters={"pos_invoice": doc.name}, pluck="name")
    for kot_name in kots:
        try:
            kot_doc = frappe.get_doc("POS KOT", kot_name)
            if kot_doc.kot_status != "Served":
                kot_doc.kot_status = "Served"
                kot_doc.served_time = now_datetime()
                kot_doc.save(ignore_permissions=True)
        except Exception:
            pass

def on_pos_invoice_update(doc, method):
    # When invoice updated draft & table assigned, occupy table
    if doc.get("custom_table") and doc.docstatus == 0:
        try:
            frappe.db.set_value("POS Table", doc.custom_table, {"status": "Occupied", "current_invoice": doc.name})
        except Exception:
            pass

def after_opening_shift_insert(doc, method):
    pass
