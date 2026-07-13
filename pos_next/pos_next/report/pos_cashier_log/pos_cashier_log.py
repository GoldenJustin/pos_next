import frappe

def execute(filters=None):
    filters = filters or {}
    columns = [
        {"label": "Date", "fieldname": "posting_date", "fieldtype": "Date", "width": 90},
        {"label": "Time", "fieldname": "posting_time", "fieldtype": "Time", "width": 80},
        {"label": "Type", "fieldname": "transaction_type", "fieldtype": "Data", "width": 80},
        {"label": "Cashier", "fieldname": "cashier", "fieldtype": "Link", "options": "User", "width": 120},
        {"label": "Amount", "fieldname": "amount", "fieldtype": "Currency", "width": 100},
        {"label": "Reason", "fieldname": "reason", "fieldtype": "Data", "width": 250},
        {"label": "Reference", "fieldname": "reference", "fieldtype": "Data", "width": 120},
        {"label": "POS Profile", "fieldname": "pos_profile", "fieldtype": "Link", "options": "POS Profile", "width": 130},
        {"label": "Shift", "fieldname": "pos_opening_shift", "fieldtype": "Link", "options": "POS Opening Shift", "width": 130},
    ]

    cond = "WHERE docstatus=1"
    if filters.get("pos_profile"):
        cond += f" AND pos_profile='{filters['pos_profile']}'"
    if filters.get("cashier"):
        cond += f" AND cashier='{filters['cashier']}'"
    if filters.get("from_date"):
        cond += f" AND posting_date >= '{filters['from_date']}'"
    if filters.get("to_date"):
        cond += f" AND posting_date <= '{filters['to_date']}'"

    data = frappe.db.sql(f"""
        SELECT posting_date, posting_time, transaction_type, cashier, amount, reason, reference, pos_profile, pos_opening_shift
        FROM `tabPOS Cash Transaction`
        {cond}
        ORDER BY posting_date DESC, posting_time DESC
    """, as_dict=1)

    return columns, data
