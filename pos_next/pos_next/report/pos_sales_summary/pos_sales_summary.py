import frappe
from frappe import _

def execute(filters=None):
    filters = filters or {}
    columns = [
        {"label": _("POS Profile"), "fieldname": "pos_profile", "fieldtype": "Link", "options": "POS Profile", "width": 150},
        {"label": _("Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
        {"label": _("Invoice"), "fieldname": "name", "fieldtype": "Link", "options": "POS Invoice", "width": 140},
        {"label": _("Customer"), "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 130},
        {"label": _("Table"), "fieldname": "custom_table", "fieldtype": "Link", "options": "POS Table", "width": 80},
        {"label": _("Order Type"), "fieldname": "custom_order_type", "fieldtype": "Data", "width": 90},
        {"label": _("Cashier"), "fieldname": "owner", "fieldtype": "Link", "options": "User", "width": 120},
        {"label": _("Net Total"), "fieldname": "net_total", "fieldtype": "Currency", "width": 110},
        {"label": _("Tax"), "fieldname": "total_taxes_and_charges", "fieldtype": "Currency", "width": 90},
        {"label": _("Grand Total"), "fieldname": "grand_total", "fieldtype": "Currency", "width": 120},
        {"label": _("Paid"), "fieldname": "paid_amount", "fieldtype": "Currency", "width": 100},
        {"label": _("Mode"), "fieldname": "mode_of_payment", "fieldtype": "Data", "width": 100},
        {"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 90},
    ]

    conditions = "WHERE docstatus = 1"
    if filters.get("pos_profile"):
        conditions += f" AND pos_profile = '{filters['pos_profile']}'"
    if filters.get("from_date"):
        conditions += f" AND posting_date >= '{filters['from_date']}'"
    if filters.get("to_date"):
        conditions += f" AND posting_date <= '{filters['to_date']}'"
    if filters.get("company"):
        conditions += f" AND company = '{filters['company']}'"

    data = frappe.db.sql(f"""
        SELECT
            pi.name, pi.pos_profile, pi.posting_date, pi.customer, pi.custom_table, pi.custom_order_type,
            pi.owner, pi.net_total, pi.total_taxes_and_charges, pi.grand_total, pi.paid_amount, pi.status,
            (SELECT GROUP_CONCAT(mode_of_payment SEPARATOR ', ') FROM `tabSales Invoice Payment` WHERE parent = pi.name) as mode_of_payment
        FROM `tabPOS Invoice` pi
        {conditions}
        ORDER BY posting_date DESC, posting_time DESC
        LIMIT 1000
    """, as_dict=1)

    # Summary stats
    total_grand = sum([d.grand_total or 0 for d in data])
    total_net = sum([d.net_total or 0 for d in data])

    report_summary = [
        {"label": "Total Sales", "value": total_grand, "datatype": "Currency"},
        {"label": "Total Net", "value": total_net, "datatype": "Currency"},
        {"label": "Invoice Count", "value": len(data), "datatype": "Int"},
    ]

    # Chart by payment mode
    chart = None
    if data:
        from collections import Counter
        mop_counter = {}
        for d in data:
            mops = (d.mode_of_payment or "").split(", ")
            for mop in mops:
                if not mop: continue
                mop_counter[mop] = mop_counter.get(mop, 0) + (d.grand_total or 0)

        if mop_counter:
            chart = {
                "data": {
                    "labels": list(mop_counter.keys()),
                    "datasets": [{"name": "Sales by Payment", "values": list(mop_counter.values())}]
                },
                "type": "donut"
            }

    return columns, data, None, chart, report_summary
