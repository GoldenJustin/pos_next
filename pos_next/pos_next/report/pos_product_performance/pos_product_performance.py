import frappe

def execute(filters=None):
    filters=filters or {}
    columns=[
        {"label":"Item","fieldname":"item_code","fieldtype":"Link","options":"Item","width":140},
        {"label":"Item Name","fieldname":"item_name","fieldtype":"Data","width":200},
        {"label":"Group","fieldname":"item_group","fieldtype":"Link","options":"Item Group","width":120},
        {"label":"Qty Sold","fieldname":"qty","fieldtype":"Float","width":90},
        {"label":"Total Sales","fieldname":"amount","fieldtype":"Currency","width":120},
        {"label":"Avg Rate","fieldname":"avg_rate","fieldtype":"Currency","width":90},
        {"label":"Invoices","fieldname":"invoice_count","fieldtype":"Int","width":80},
    ]
    cond="WHERE pi.docstatus=1"
    if filters.get("pos_profile"):
        cond+=f" AND pi.pos_profile='{filters['pos_profile']}'"
    if filters.get("from_date"):
        cond+=f" AND pi.posting_date >= '{filters['from_date']}'"
    if filters.get("to_date"):
        cond+=f" AND pi.posting_date <= '{filters['to_date']}'"
    data=frappe.db.sql(f"""
        SELECT
            ii.item_code, ii.item_name, ii.item_group,
            SUM(ii.qty) as qty, SUM(ii.amount) as amount,
            AVG(ii.rate) as avg_rate, COUNT(DISTINCT ii.parent) as invoice_count
        FROM `tabPOS Invoice Item` ii JOIN `tabPOS Invoice` pi ON pi.name=ii.parent
        {cond}
        GROUP BY ii.item_code
        ORDER BY qty DESC
        LIMIT 500
    """, as_dict=1)
    return columns, data
