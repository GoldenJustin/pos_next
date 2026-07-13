import frappe
from frappe.utils import flt

def execute(filters=None):
    filters = filters or {}
    columns = [
        {"label": "POS Profile", "fieldname": "pos_profile", "fieldtype": "Link", "options": "POS Profile", "width": 150},
        {"label": "Shift", "fieldname": "name", "fieldtype": "Link", "options": "POS Opening Shift", "width": 140},
        {"label": "User", "fieldname": "user", "fieldtype": "Link", "options": "User", "width": 120},
        {"label": "Start", "fieldname": "period_start_date", "fieldtype": "Datetime", "width": 150},
        {"label": "End", "fieldname": "period_end_date", "fieldtype": "Datetime", "width": 150},
        {"label": "Opening Cash", "fieldname": "opening_amount", "fieldtype": "Currency", "width": 110},
        {"label": "Sales Total", "fieldname": "sales_total", "fieldtype": "Currency", "width": 120},
        {"label": "Cash Sales", "fieldname": "cash_sales", "fieldtype": "Currency", "width": 110},
        {"label": "Cash In", "fieldname": "cash_in", "fieldtype": "Currency", "width": 90},
        {"label": "Cash Out", "fieldname": "cash_out", "fieldtype": "Currency", "width": 90},
        {"label": "Expected Cash", "fieldname": "expected_cash", "fieldtype": "Currency", "width": 120},
        {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 80},
    ]

    cond = ""
    if filters.get("pos_profile"):
        cond += f" AND pos.pos_profile = '{filters['pos_profile']}'"
    if filters.get("user"):
        cond += f" AND pos.user = '{filters['user']}'"

    data = frappe.db.sql(f"""
        SELECT
            pos.name, pos.pos_profile, pos.user, pos.period_start_date, pos.period_end_date, pos.status,
            COALESCE((SELECT opening_amount FROM `tabPOS Opening Shift Detail` WHERE parent = pos.name LIMIT 1), 0) as opening_amount
        FROM `tabPOS Opening Shift` pos
        WHERE 1=1 {cond}
        ORDER BY pos.period_start_date DESC
        LIMIT 200
    """, as_dict=1)

    for row in data:
        # sales total for shift
        sales = frappe.db.sql("""
            SELECT SUM(grand_total) as sales_total FROM `tabPOS Invoice` WHERE pos_opening_shift = %s AND docstatus = 1
        """, (row.name,), as_dict=1)
        row["sales_total"] = sales[0].sales_total if sales and sales[0].sales_total else 0

        cash_sales = frappe.db.sql("""
            SELECT SUM(mop.amount) as cash_sales FROM `tabSales Invoice Payment` mop JOIN `tabPOS Invoice` pi ON pi.name=mop.parent WHERE pi.pos_opening_shift=%s AND mop.mode_of_payment='Cash' AND pi.docstatus=1
        """, (row.name,), as_dict=1)
        row["cash_sales"] = cash_sales[0].cash_sales if cash_sales and cash_sales[0].cash_sales else 0

        cash_tx = frappe.db.sql("""
            SELECT transaction_type, SUM(amount) as amt FROM `tabPOS Cash Transaction` WHERE pos_opening_shift=%s AND docstatus=1 GROUP BY transaction_type
        """, (row.name,), as_dict=1)
        cash_in = 0
        cash_out = 0
        for tx in cash_tx:
            if tx.transaction_type == "Cash In":
                cash_in = tx.amt
            else:
                cash_out = tx.amt
        row["cash_in"] = cash_in
        row["cash_out"] = cash_out
        row["expected_cash"] = flt(row["opening_amount"]) + flt(row["cash_sales"]) + flt(cash_in) - flt(cash_out)

    return columns, data
