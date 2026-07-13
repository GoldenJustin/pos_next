import frappe

def execute(filters=None):
    filters=filters or {}
    columns=[
        {"label":"KOT","fieldname":"name","fieldtype":"Link","options":"POS KOT","width":130},
        {"label":"Table","fieldname":"table","fieldtype":"Link","options":"POS Table","width":90},
        {"label":"POS Profile","fieldname":"pos_profile","fieldtype":"Link","options":"POS Profile","width":120},
        {"label":"Order Time","fieldname":"order_time","fieldtype":"Datetime","width":150},
        {"label":"Fired","fieldname":"fired_time","fieldtype":"Datetime","width":140},
        {"label":"Ready","fieldname":"ready_time","fieldtype":"Datetime","width":140},
        {"label":"Served","fieldname":"served_time","fieldtype":"Datetime","width":140},
        {"label":"Cook Min","fieldname":"cook_minutes","fieldtype":"Int","width":90},
        {"label":"Total Min","fieldname":"total_minutes","fieldtype":"Int","width":90},
        {"label":"Status","fieldname":"kot_status","fieldtype":"Data","width":100},
        {"label":"Items","fieldname":"item_count","fieldtype":"Int","width":60},
    ]
    cond="WHERE 1=1"
    if filters.get("pos_profile"):
        cond+=f" AND pos_profile='{filters['pos_profile']}'"
    if filters.get("from_date"):
        cond+=f" AND DATE(order_time) >= '{filters['from_date']}'"
    if filters.get("to_date"):
        cond+=f" AND DATE(order_time) <= '{filters['to_date']}'"
    data=frappe.db.sql(f"""
        SELECT
            name, table, pos_profile, order_time, fired_time, ready_time, served_time, kot_status,
            TIMESTAMPDIFF(MINUTE, fired_time, ready_time) as cook_minutes,
            TIMESTAMPDIFF(MINUTE, order_time, served_time) as total_minutes,
            (SELECT COUNT(*) FROM `tabPOS KOT Item` WHERE parent=`tabPOS KOT`.name) as item_count
        FROM `tabPOS KOT`
        {cond}
        ORDER BY order_time DESC
        LIMIT 500
    """, as_dict=1)
    return columns, data
