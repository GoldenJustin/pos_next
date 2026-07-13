import frappe
from frappe import _
from frappe.utils import now_datetime

def setup_after_install():
    """Run after install / migrate - creates custom fields if not via fixtures, receipt templates, roles"""
    try:
        create_roles()
    except Exception as e:
        print(f"Role creation failed: {e}")

    try:
        create_receipt_templates()
    except Exception as e:
        print(f"Receipt template creation failed: {e}")

    try:
        create_custom_fields_if_missing()
    except Exception as e:
        print(f"Custom field creation failed: {e}")

    print("POS Next setup_after_install completed")

def create_roles():
    roles = ["Kitchen User", "POS Cashier Manager"]
    for role_name in roles:
        if not frappe.db.exists("Role", role_name):
            doc = frappe.new_doc("Role")
            doc.role_name = role_name
            doc.desk_access = 1 if role_name != "Kitchen User" else 0
            doc.insert(ignore_permissions=True)
    frappe.db.commit()

def create_custom_fields_if_missing():
    # Custom fields are in fixtures, but we also ensure via code for quick install without fixtures import
    # This is secondary safeguard - loads from fixtures json if present
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    fields_to_create = [
        # POS Profile
        {"dt":"POS Profile","label":"Enable POS Next (Super POS)","fieldname":"custom_enable_pos_next","fieldtype":"Check","insert_after":"company","default":"1","module":"POS Next"},
        {"dt":"POS Profile","label":"POS Mode","fieldname":"custom_pos_mode","fieldtype":"Select","options":"Retail\nRestaurant\nSupermarket\nBar & Pub\nBakery\nPharmacy\nOdoo Clone","default":"Retail","insert_after":"custom_enable_pos_next","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Table Management","fieldname":"custom_enable_table_management","fieldtype":"Check","default":"1","insert_after":"custom_pos_mode","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable KDS","fieldname":"custom_enable_kds","fieldtype":"Check","default":"1","insert_after":"custom_enable_table_management","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Customer Display","fieldname":"custom_enable_customer_display","fieldtype":"Check","default":"1","insert_after":"custom_enable_kds","module":"POS Next"},
        {"dt":"POS Profile","label":"Customer Display Ads (HTML)","fieldname":"custom_customer_display_ad","fieldtype":"Code","options":"HTML","insert_after":"custom_enable_customer_display","module":"POS Next"},
        {"dt":"POS Profile","label":"Receipt Template","fieldname":"custom_receipt_template","fieldtype":"Link","options":"POS Receipt Template","insert_after":"custom_customer_display_ad","module":"POS Next"},
        {"dt":"POS Profile","label":"KDS Auto Refresh (sec)","fieldname":"custom_kds_refresh_seconds","fieldtype":"Int","default":"3","insert_after":"custom_receipt_template","module":"POS Next"},
        {"dt":"POS Profile","label":"KOT Printer Routing","fieldname":"custom_kot_printer_map","fieldtype":"Table","options":"POS KOT Printer Map","insert_after":"custom_kds_refresh_seconds","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Weighted Barcode","fieldname":"custom_enable_weighted_barcode","fieldtype":"Check","default":"1","insert_after":"custom_kot_printer_map","module":"POS Next"},
        {"dt":"POS Profile","label":"Weighted Barcode Prefixes","fieldname":"custom_weighted_barcode_prefixes","fieldtype":"Data","default":"20,21,22,23,24,27,28,29","insert_after":"custom_enable_weighted_barcode","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Cash In/Out","fieldname":"custom_enable_cash_in_out","fieldtype":"Check","default":"1","insert_after":"custom_weighted_barcode_prefixes","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Split Bill","fieldname":"custom_enable_split_bill","fieldtype":"Check","default":"1","insert_after":"custom_enable_cash_in_out","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Hard Offline","fieldname":"custom_enable_offline_hard","fieldtype":"Check","default":"1","insert_after":"custom_enable_split_bill","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Odoo Hotkeys","fieldname":"custom_enable_odoo_hotkeys","fieldtype":"Check","default":"1","insert_after":"custom_enable_offline_hard","module":"POS Next"},

        # POS Invoice
        {"dt":"POS Invoice","label":"Table","fieldname":"custom_table","fieldtype":"Link","options":"POS Table","insert_after":"pos_profile","module":"POS Next"},
        {"dt":"POS Invoice","label":"Guest Count","fieldname":"custom_guest_count","fieldtype":"Int","default":"1","insert_after":"custom_table","module":"POS Next"},
        {"dt":"POS Invoice","label":"Order Type","fieldname":"custom_order_type","fieldtype":"Select","options":"Dine In\nTakeaway\nDelivery\nDrive-Thru\nQuick","default":"Dine In","insert_after":"custom_guest_count","module":"POS Next"},
        {"dt":"POS Invoice","label":"KOT Status","fieldname":"custom_kot_status","fieldtype":"Select","options":"Not Sent\nSent\nPartially Served\nServed","default":"Not Sent","insert_after":"custom_order_type","module":"POS Next"},
        {"dt":"POS Invoice","label":"Offline ID","fieldname":"custom_offline_id","fieldtype":"Data","insert_after":"custom_kot_status","module":"POS Next"},
        {"dt":"POS Invoice","label":"Is Split Bill","fieldname":"custom_is_split","fieldtype":"Check","insert_after":"custom_offline_id","module":"POS Next"},
        {"dt":"POS Invoice","label":"Parent Invoice","fieldname":"custom_parent_invoice","fieldtype":"Link","options":"POS Invoice","insert_after":"custom_is_split","module":"POS Next"},

        # POS Invoice Item
        {"dt":"POS Invoice Item","label":"KOT Notes","fieldname":"custom_kot_notes","fieldtype":"Small Text","module":"POS Next"},
        {"dt":"POS Invoice Item","label":"KOT Fired","fieldname":"custom_is_kot_fired","fieldtype":"Check","default":"0","module":"POS Next"},
    ]

    for field in fields_to_create:
        if not frappe.db.exists("Custom Field", {"dt": field["dt"], "fieldname": field["fieldname"]}):
            try:
                create_custom_field(field["dt"], field, ignore_validate=True)
                print(f"Created custom field {field['dt']} - {field['fieldname']}")
            except Exception as e:
                print(f"Failed to create {field['fieldname']}: {e}")

    frappe.db.commit()

def create_receipt_templates():
    templates = [
        {
            "template_name": "Minimal 80mm",
            "paper_size": "80mm",
            "is_escpos": 1,
            "is_default": 1,
            "show_logo": 1,
            "show_qr": 1,
            "template_html": """
<div style="width:80mm;font-family:monospace;font-size:12px;padding:8px;color:#000;">
    <div style="text-align:center;">
        {% if company.company_logo %}<img src="{{ company.company_logo }}" style="max-width:60px;"><br>{% endif %}
        <strong style="font-size:15px;">{{ doc.company }}</strong><br>
        <span style="font-size:10px;">{{ company.address_display or '' }}</span>
    </div>
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <div style="display:flex;justify-content:space-between;font-size:10px;"><span>Inv: {{ doc.name }}</span><span>{{ doc.posting_date }}</span></div>
    <div style="font-size:10px;">Cashier: {{ doc.owner }} | Cust: {{ doc.customer_name or doc.customer }}</div>
    {% if doc.custom_table %}<div style="font-weight:700;">Table: {{ doc.custom_table }} | Guests: {{ doc.custom_guest_count }}</div>{% endif %}
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <table style="width:100%;font-size:11px;"><thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Amt</th></tr></thead>
    <tbody>{% for item in items %}<tr><td>{{ item.item_name[:24] }}</td><td align="right">{{ item.qty }}</td><td align="right">{{ item.amount }}</td></tr>{% endfor %}</tbody></table>
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <table style="width:100%;font-size:12px;">
        <tr><td>Subtotal</td><td align="right">{{ doc.net_total }}</td></tr>
        <tr style="font-weight:900;"><td>Total</td><td align="right">{{ doc.grand_total }}</td></tr>
    </table>
    <div style="text-align:center;margin-top:8px;font-size:10px;">Thank you! Powered by POS Next</div>
</div>
""",
            "template_css": "/* minimal */"
        },
        {
            "template_name": "Odoo Clone",
            "paper_size": "80mm",
            "is_escpos": 1,
            "is_default": 0,
            "show_logo": 1,
            "show_qr": 0,
            "template_html": """
<div style="width:80mm;font-family:'Helvetica',sans-serif;padding:10px;">
    <div style="text-align:center;">
        <h2 style="margin:0;font-weight:900;">{{ doc.company }}</h2>
        <div style="background:#000;color:#fff;display:inline-block;padding:2px 10px;margin-top:8px;font-size:10px;">RECEIPT</div>
    </div>
    <div style="margin-top:12px;font-size:11px;">
        <div style="display:flex;justify-content:space-between;"><span>Receipt:</span><span style="font-weight:700;">{{ doc.name }}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Customer:</span><span>{{ doc.customer_name }}</span></div>
        {% if doc.custom_table %}<div style="font-weight:700;background:#F7FAFC;padding:4px;border-radius:4px;margin-top:4px;">Table {{ doc.custom_table }} ({{ doc.custom_order_type }}) - {{ doc.custom_guest_count }} Guests</div>{% endif %}
    </div>
    <div style="margin-top:12px;border-top:2px solid #000;padding-top:8px;">
        {% for item in items %}
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid #EDF2F7;">
            <div><div style="font-weight:600;">{{ item.item_name }}</div><div style="font-size:10px;color:#718096;">{{ item.qty }} x {{ item.rate }}</div></div>
            <div style="font-weight:700;">{{ item.amount }}</div>
        </div>
        {% endfor %}
    </div>
    <div style="margin-top:10px;background:#F7FAFC;padding:8px;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;"><span>TOTAL</span><span>{{ doc.grand_total }}</span></div>
    </div>
    <div style="text-align:center;margin-top:14px;font-size:11px;color:#999;">Thank you for your purchase! Odoo taste - POS Next</div>
</div>
""",
            "template_css": ""
        },
        {
            "template_name": "Restaurant Elegant",
            "paper_size": "80mm",
            "is_escpos": 1,
            "is_default": 0,
            "show_logo": 0,
            "show_qr": 1,
            "template_html": """
<div style="width:80mm;font-family:'Georgia',serif;padding:12px;">
    <div style="text-align:center;border:2px solid #000;padding:10px;">
        <div style="font-size:20px;font-weight:900;letter-spacing:2px;">{{ doc.company }}</div>
        <div style="font-size:10px;margin-top:4px;">FINE DINING • TAKEAWAY • DELIVERY</div>
    </div>
    <div style="font-size:12px;margin-top:8px;">
        <div><strong>Bill No:</strong> {{ doc.name }} | <strong>Date:</strong> {{ doc.posting_date }} {{ doc.posting_time }}</div>
        <div><strong>Table:</strong> {{ doc.custom_table or 'N/A' }} | <strong>Guests:</strong> {{ doc.custom_guest_count or 1 }}</div>
        <div><strong>Customer:</strong> {{ doc.customer_name }}</div>
    </div>
    <table style="width:100%;margin-top:10px;font-size:12px;border-top:2px solid #000;border-bottom:2px solid #000;">
        <thead><tr><th align="left">Item</th><th align="center">Qty</th><th align="right">Price</th></tr></thead>
        <tbody>{% for it in items %}<tr><td>{{ it.item_name }}<br>{% if it.custom_kot_notes %}<small>Note: {{ it.custom_kot_notes }}</small>{% endif %}</td><td align="center">{{ it.qty }}</td><td align="right">{{ it.amount }}</td></tr>{% endfor %}</tbody>
    </table>
    <table style="width:100%;margin-top:8px;"><tr style="font-weight:900;font-size:14px;"><td>Grand Total</td><td align="right">{{ doc.grand_total }}</td></tr></table>
    <div style="text-align:center;margin-top:12px;">*** Thank You! ***</div>
</div>
""",
            "template_css": ""
        },
        {
            "template_name": "Supermarket Detailed",
            "paper_size": "80mm",
            "is_escpos": 1,
            "is_default": 0,
            "show_logo": 0,
            "show_qr": 0,
            "template_html": """
<div style="width:80mm;font-family:monospace;font-size:10px;padding:6px;">
    <div style="text-align:center;"><strong style="font-size:14px;">{{ doc.company }}</strong><br>{{ company.address_display or '' }}</div>
    <hr>
    <div>Inv: {{ doc.name }} | {{ doc.posting_date }} {{ doc.posting_time }}</div>
    <div>Customer: {{ doc.customer_name }}</div>
    <hr>
    <table style="width:100%;"><thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Rate</th><th align="right">Total</th></tr></thead>
    <tbody>{% for it in items %}<tr><td>{{ it.item_name[:16] }}</td><td align="right">{{ it.qty }}</td><td align="right">{{ it.rate }}</td><td align="right">{{ it.amount }}</td></tr>{% endfor %}</tbody></table>
    <hr>
    <table style="width:100%;"><tr style="font-weight:900;"><td>GRAND TOTAL</td><td align="right">{{ doc.grand_total }}</td></tr></table>
    <div style="text-align:center;margin-top:6px;">You saved: {{ doc.discount_amount }} today! Thank you</div>
</div>
""",
            "template_css": ""
        },
        {
            "template_name": "A4 Invoice",
            "paper_size": "A4",
            "is_escpos": 0,
            "is_default": 0,
            "show_logo": 1,
            "show_qr": 1,
            "template_html": """
<div style="width:210mm;padding:20px;font-family:Arial,sans-serif;">
    <div style="display:flex;justify-content:space-between;"><div><h1>{{ doc.company }}</h1><div style="font-size:11px;">{{ company.address_display or '' }}</div></div><div style="text-align:right;"><h2>TAX INVOICE</h2><div>No: {{ doc.name }}<br>Date: {{ doc.posting_date }}</div></div></div>
    <hr>
    <div>Bill To: {{ doc.customer_name }}</div>
    <table style="width:100%;margin-top:12px;border-collapse:collapse;"><thead><tr style="background:#5A67D8;color:white;"><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th align="right">Amount</th></tr></thead>
    <tbody>{% for idx, it in enumerate(items) %}<tr style="border-bottom:1px solid #eee;"><td>{{ idx+1 }}</td><td>{{ it.item_name }}</td><td>{{ it.qty }}</td><td>{{ it.rate }}</td><td align="right">{{ it.amount }}</td></tr>{% endfor %}</tbody></table>
    <div style="text-align:right;margin-top:12px;font-weight:900;">Grand Total: {{ doc.grand_total }}</div>
</div>
""",
            "template_css": ""
        },
    ]

    for tmpl in templates:
        if not frappe.db.exists("POS Receipt Template", tmpl["template_name"]):
            doc = frappe.new_doc("POS Receipt Template")
            doc.update(tmpl)
            doc.insert(ignore_permissions=True)
            print(f"Created receipt template {tmpl['template_name']}")

    frappe.db.commit()

@frappe.whitelist()
def seed_demo_for_profile(pos_profile):
    """Create demo floors and tables for a given POS Profile"""
    if not pos_profile:
        frappe.throw("POS Profile required")

    company = frappe.db.get_value("POS Profile", pos_profile, "company")

    # Floors
    floors_data = [
        {"floor_name": f"{pos_profile}-Ground Floor", "floor_color": "#5A67D8"},
        {"floor_name": f"{pos_profile}-Terrace", "floor_color": "#ED8936"},
        {"floor_name": f"{pos_profile}-VIP", "floor_color": "#805AD5"},
    ]
    floors = []
    for fdata in floors_data:
        if not frappe.db.exists("POS Floor", fdata["floor_name"]):
            f = frappe.new_doc("POS Floor")
            f.floor_name = fdata["floor_name"]
            f.pos_profile = pos_profile
            f.company = company
            f.floor_color = fdata["floor_color"]
            f.is_active = 1
            f.insert(ignore_permissions=True)
            floors.append(f.name)
        else:
            floors.append(fdata["floor_name"])

    # Tables for each floor
    for floor in floors:
        for i in range(1, 9):
            table_name = f"{floor}-T{i}"
            if not frappe.db.exists("POS Table", table_name):
                t = frappe.new_doc("POS Table")
                t.table_name = table_name
                t.floor = floor
                t.pos_profile = pos_profile
                t.seats = 4 if i % 2 == 0 else 2
                t.status = "Available"
                t.shape = "Round" if i % 3 == 0 else "Square"
                t.x_coordinate = i * 10
                t.y_coordinate = i * 10
                t.insert(ignore_permissions=True)

    frappe.db.commit()
    return {"floors": floors}

@frappe.whitelist()
def install_demo_data():
    """Seed global demo data - receipt templates + sample"""
    create_receipt_templates()
    create_roles()
    # Find first POS Profile and seed floors
    profiles = frappe.get_all("POS Profile", pluck="name", limit=1)
    if profiles:
        seed_demo_for_profile(profiles[0])
    return "Demo data installed"

# For bench execute command
def sync_offline_invoice(data):
    """Sync offline invoice - called from offline handler"""
    import json
    if isinstance(data, str):
        data = json.loads(data)
    # data is POS Invoice dict
    # For demo, we just create invoice
    # In real, you'd validate offline_id uniqueness
    offline_id = data.get("custom_offline_id") or data.get("offline_id")
    if offline_id and frappe.db.exists("POS Invoice", {"custom_offline_id": offline_id}):
        return frappe.get_doc("POS Invoice", {"custom_offline_id": offline_id}).as_dict()

    doc = frappe.new_doc("POS Invoice")
    doc.update(data)
    doc.custom_offline_id = offline_id
    doc.insert(ignore_permissions=True)
    doc.submit()
    frappe.db.commit()
    return doc.as_dict()
