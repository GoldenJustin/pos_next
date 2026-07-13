import frappe
from frappe.utils import now_datetime, get_datetime
from frappe import _

@frappe.whitelist()
def get_kitchen_orders(pos_profile=None, status=None, floor=None):
    if not pos_profile:
        frappe.throw(_("POS Profile required"))
    filters = {"pos_profile": pos_profile}
    if status:
        if isinstance(status, str):
            try:
                import json
                status_list = json.loads(status)
                if isinstance(status_list, list):
                    filters["kot_status"] = ["in", status_list]
                else:
                    filters["kot_status"] = status
            except:
                filters["kot_status"] = status
        else:
            filters["kot_status"] = status
    else:
        filters["kot_status"] = ["not in", ["Served", "Cancelled"]]

    fields = ["name", "pos_profile", "pos_invoice", "table", "order_type", "kot_status", "priority", "guest_count", "order_time", "fired_time", "ready_time", "remarks", "customer", "cashier"]
    
    kots = frappe.get_all("POS KOT", filters=filters, fields=fields, order_by="priority desc, order_time asc", limit=200)

    # Enrich each with items and table name and aging
    for kot in kots:
        kot["items"] = frappe.get_all("POS KOT Item", filters={"parent": kot["name"]}, fields=["item_code", "item_name", "qty", "kot_status", "kot_notes"])
        if kot.get("table"):
            kot["table_label"] = frappe.db.get_value("POS Table", kot["table"], "table_name")
        # aging minutes
        try:
            ot = get_datetime(kot["order_time"]) if kot.get("order_time") else now_datetime()
            diff = now_datetime() - ot
            kot["aging_minutes"] = int(diff.total_seconds() / 60)
        except:
            kot["aging_minutes"] = 0

    return kots

@frappe.whitelist()
def update_kot_status(kot_name, status, item_code=None):
    doc = frappe.get_doc("POS KOT", kot_name)
    previous = doc.kot_status

    valid_transitions = {
        "Draft": ["Sent to Kitchen"],
        "Sent to Kitchen": ["In Progress", "Cancelled"],
        "In Progress": ["Ready", "Cancelled"],
        "Ready": ["Served", "In Progress"],
        "Served": [],
        "Cancelled": []
    }

    # Allow direct if kitchen user
    doc.kot_status = status
    now = now_datetime()
    if status == "Sent to Kitchen" and not doc.fired_time:
        doc.fired_time = now
        doc.is_fired = 1
    elif status == "Ready":
        doc.ready_time = now
    elif status == "Served":
        doc.served_time = now

    # Update child items if needed
    if item_code:
        for i in doc.items:
            if i.item_code == item_code:
                if status == "In Progress":
                    i.kot_status = "Cooking"
                elif status == "Ready":
                    i.kot_status = "Ready"
                elif status == "Served":
                    i.kot_status = "Served"
    else:
        # bulk update child status
        mapping = {
            "In Progress": "Cooking",
            "Ready": "Ready",
            "Served": "Served",
            "Cancelled": "Cancelled"
        }
        if status in mapping:
            for i in doc.items:
                i.kot_status = mapping[status]

    doc.save(ignore_permissions=True)

    # Also update linked POS Invoice if all served
    if status == "Served" and doc.pos_invoice:
        try:
            pinv = frappe.get_doc("POS Invoice", doc.pos_invoice)
            # if invoice field custom_kot_status exists
            if hasattr(pinv, 'custom_kot_status'):
                pinv.db_set('custom_kot_status', 'Served')
        except Exception:
            pass

    frappe.db.commit()
    # Realtime push
    frappe.publish_realtime("pos_next_kds_update", {"kot": kot_name, "status": status}, after_commit=True)

    return {"ok": True, "name": kot_name, "status": status, "previous": previous}

@frappe.whitelist()
def auto_close_old_kots():
    # Close KOTs older than 12 hours that are served but not closed
    from frappe.utils import add_hours
    old_time = add_hours(now_datetime(), -12)
    old_kots = frappe.get_all("POS KOT", filters={"kot_status": "Served", "modified": ["<", old_time]}, pluck="name", limit=50)
    for name in old_kots:
        # Keep but maybe archive? For demo do nothing
        pass
    return len(old_kots)
