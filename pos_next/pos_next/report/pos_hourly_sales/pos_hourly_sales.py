import frappe

def execute(filters=None):
    filters=filters or {}
    columns=[
        {"label":"Hour","fieldname":"hour","fieldtype":"Data","width":80},
        {"label":"Invoices","fieldname":"invoice_count","fieldtype":"Int","width":80},
        {"label":"Total Sales","fieldname":"total","fieldtype":"Currency","width":120},
        {"label":"Avg Sale","fieldname":"avg","fieldtype":"Currency","width":100},
    ]
    cond="WHERE docstatus=1"
    if filters.get("pos_profile"):
        cond+=f" AND pos_profile='{filters['pos_profile']}'"
    if filters.get("from_date"):
        cond+=f" AND posting_date >= '{filters['from_date']}'"
    if filters.get("to_date"):
        cond+=f" AND posting_date <= '{filters['to_date']}'"
    data=frappe.db.sql(f"""
        SELECT HOUR(posting_time) as hour, COUNT(name) as invoice_count, SUM(grand_total) as total, AVG(grand_total) as avg
        FROM `tabPOS Invoice` {cond}
        GROUP BY HOUR(posting_time)
        ORDER BY hour
    """, as_dict=1)
    for d in data:
        d["hour"]=f"{int(d['hour']):02d}:00"
    chart={"data":{"labels":[r.hour for r in data],"datasets":[{"name":"Sales","values":[r.total or 0 for r in data]}]},"type":"bar"}
    return columns, data, None, chart
