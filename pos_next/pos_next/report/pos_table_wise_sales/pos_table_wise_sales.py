import frappe

def execute(filters=None):
    filters=filters or {}
    columns=[
        {"label":"Table","fieldname":"custom_table","fieldtype":"Link","options":"POS Table","width":120},
        {"label":"Floor","fieldname":"floor","fieldtype":"Link","options":"POS Floor","width":120},
        {"label":"Invoices","fieldname":"invoice_count","fieldtype":"Int","width":90},
        {"label":"Total Sales","fieldname":"total_sales","fieldtype":"Currency","width":120},
        {"label":"Avg Sale","fieldname":"avg_sale","fieldtype":"Currency","width":100},
        {"label":"Guests Served","fieldname":"guests","fieldtype":"Int","width":110},
    ]
    cond="WHERE pi.docstatus=1 AND pi.custom_table IS NOT NULL AND pi.custom_table != ''"
    if filters.get("pos_profile"):
        cond+=f" AND pi.pos_profile='{filters['pos_profile']}'"
    if filters.get("from_date"):
        cond+=f" AND pi.posting_date >= '{filters['from_date']}'"
    if filters.get("to_date"):
        cond+=f" AND pi.posting_date <= '{filters['to_date']}'"
    data=frappe.db.sql(f"""
        SELECT pi.custom_table, t.floor,
               COUNT(pi.name) as invoice_count,
               SUM(pi.grand_total) as total_sales,
               AVG(pi.grand_total) as avg_sale,
               SUM(COALESCE(pi.custom_guest_count,0)) as guests
        FROM `tabPOS Invoice` pi LEFT JOIN `tabPOS Table` t ON t.name=pi.custom_table
        {cond}
        GROUP BY pi.custom_table
        ORDER BY total_sales DESC
    """, as_dict=1)
    return columns, data
