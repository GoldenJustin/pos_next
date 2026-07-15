import frappe
from frappe import _
from frappe.utils import now_datetime

def setup_after_install():
    """Called after install and after migrate - ensures everything exists"""
    print("POS Next v3.0.0 - Setup started")
    try:
        ensure_module_def()
    except Exception as e:
        print(f"ModuleDef ensure failed: {e}")

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

    try:
        create_pos_next_settings()
    except Exception as e:
        print(f"POS Next Settings creation failed: {e}")

    print("POS Next setup completed - Modern Retail & Restaurant POS Ready")

def ensure_module_def():
    """Ensure module def has proper icon and color for desk"""
    if not frappe.db.exists("Module Def", "POS Next"):
        doc = frappe.new_doc("Module Def")
        doc.module_name = "POS Next"
        doc.app_name = "pos_next"
        doc.custom = 1
        doc.insert(ignore_permissions=True)
    else:
        # Update color/icon if column exists
        try:
            frappe.db.set_value("Module Def", "POS Next", "app_name", "pos_next")
        except Exception:
            pass
    frappe.db.commit()

def create_roles():
    roles = [
        {"role_name": "Kitchen User", "desk_access": 0},
        {"role_name": "POS Cashier Manager", "desk_access": 1},
        {"role_name": "POS Manager", "desk_access": 1},
    ]
    for r in roles:
        if not frappe.db.exists("Role", r["role_name"]):
            doc = frappe.new_doc("Role")
            doc.role_name = r["role_name"]
            doc.desk_access = r["desk_access"]
            doc.insert(ignore_permissions=True)
    frappe.db.commit()

def create_pos_next_settings():
    if not frappe.db.exists("DocType", "POS Next Settings"):
        return
    # Ensure single doc exists
    if not frappe.db.exists("POS Next Settings", "POS Next Settings"):
        doc = frappe.get_single("POS Next Settings")
        try:
            doc.save(ignore_permissions=True)
        except Exception:
            pass
    frappe.db.commit()

def create_custom_fields_if_missing():
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    fields_to_create = [
        # POS Profile - Modern modes
        {"dt":"POS Profile","label":"Enable POS Next","fieldname":"custom_enable_pos_next","fieldtype":"Check","insert_after":"company","default":"1","module":"POS Next"},
        {"dt":"POS Profile","label":"POS Mode","fieldname":"custom_pos_mode","fieldtype":"Select","options":"Retail\nRestaurant\nSupermarket\nWholesale\nBar & Pub\nBakery\nPharmacy\nFashion\nMulti-Business","default":"Retail","insert_after":"custom_enable_pos_next","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Table Management","fieldname":"custom_enable_table_management","fieldtype":"Check","default":"1","insert_after":"custom_pos_mode","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable KDS (Kitchen Display)","fieldname":"custom_enable_kds","fieldtype":"Check","default":"1","insert_after":"custom_enable_table_management","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Customer Display","fieldname":"custom_enable_customer_display","fieldtype":"Check","default":"1","insert_after":"custom_enable_kds","module":"POS Next"},
        {"dt":"POS Profile","label":"Customer Display Ads (HTML)","fieldname":"custom_customer_display_ad","fieldtype":"Code","options":"HTML","insert_after":"custom_enable_customer_display","module":"POS Next"},
        {"dt":"POS Profile","label":"Receipt Template","fieldname":"custom_receipt_template","fieldtype":"Link","options":"POS Receipt Template","insert_after":"custom_customer_display_ad","module":"POS Next"},
        {"dt":"POS Profile","label":"KDS Auto Refresh (sec)","fieldname":"custom_kds_refresh_seconds","fieldtype":"Int","default":"3","insert_after":"custom_receipt_template","module":"POS Next"},
        {"dt":"POS Profile","label":"KOT Printer Routing","fieldname":"custom_kot_printer_map","fieldtype":"Table","options":"POS KOT Printer Map","insert_after":"custom_kds_refresh_seconds","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Weighted Barcode","fieldname":"custom_enable_weighted_barcode","fieldtype":"Check","default":"1","insert_after":"custom_kot_printer_map","module":"POS Next"},
        {"dt":"POS Profile","label":"Weighted Barcode Prefixes","fieldname":"custom_weighted_barcode_prefixes","fieldtype":"Data","default":"20,21,22,23,24,27,28,29","insert_after":"custom_enable_weighted_barcode","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Cash In/Out","fieldname":"custom_enable_cash_in_out","fieldtype":"Check","default":"1","insert_after":"custom_weighted_barcode_prefixes","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Split Bill","fieldname":"custom_enable_split_bill","fieldtype":"Check","default":"1","insert_after":"custom_enable_cash_in_out","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Hard Offline (IndexedDB)","fieldname":"custom_enable_offline_hard","fieldtype":"Check","default":"1","insert_after":"custom_enable_split_bill","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Quick Hotkeys (F1-F10)","fieldname":"custom_enable_quick_hotkeys","fieldtype":"Check","default":"1","insert_after":"custom_enable_offline_hard","module":"POS Next"},

        # POS Invoice extensions
        {"dt":"POS Invoice","label":"Table","fieldname":"custom_table","fieldtype":"Link","options":"POS Table","insert_after":"pos_profile","module":"POS Next"},
        {"dt":"POS Invoice","label":"Guest Count","fieldname":"custom_guest_count","fieldtype":"Int","default":"1","insert_after":"custom_table","module":"POS Next"},
        {"dt":"POS Invoice","label":"Order Type","fieldname":"custom_order_type","fieldtype":"Select","options":"Dine In\nTakeaway\nDelivery\nDrive-Thru\nQuick Sale\nWholesale","default":"Dine In","insert_after":"custom_guest_count","module":"POS Next"},
        {"dt":"POS Invoice","label":"KOT Status","fieldname":"custom_kot_status","fieldtype":"Select","options":"Not Sent\nSent\nPartially Served\nServed","default":"Not Sent","insert_after":"custom_order_type","module":"POS Next"},
        {"dt":"POS Invoice","label":"Offline ID","fieldname":"custom_offline_id","fieldtype":"Data","insert_after":"custom_kot_status","module":"POS Next", "read_only": 1},
        {"dt":"POS Invoice","label":"Is Split Bill","fieldname":"custom_is_split","fieldtype":"Check","insert_after":"custom_offline_id","module":"POS Next"},
        {"dt":"POS Invoice","label":"Parent Invoice (Split From)","fieldname":"custom_parent_invoice","fieldtype":"Link","options":"POS Invoice","insert_after":"custom_is_split","module":"POS Next"},

        # POS Invoice Item
        {"dt":"POS Invoice Item","label":"Kitchen Notes","fieldname":"custom_kot_notes","fieldtype":"Small Text","module":"POS Next"},
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
    <div style="font-size:10px;">Cashier: {{ doc.owner }} | Customer: {{ doc.customer_name or doc.customer }}</div>
    {% if doc.custom_table %}<div style="font-weight:700;">Table: {{ doc.custom_table }} | Guests: {{ doc.custom_guest_count }}</div>{% endif %}
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <table style="width:100%;font-size:11px;"><thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Amt</th></tr></thead>
    <tbody>{% for item in items %}<tr><td>{{ item.item_name[:24] }}</td><td align="right">{{ item.qty }}</td><td align="right">{{ frappe.format(item.amount, {"fieldtype":"Currency"}) }}</td></tr>{% endfor %}</tbody></table>
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <table style="width:100%;font-size:12px;">
        <tr><td>Subtotal</td><td align="right">{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</td></tr>
        <tr style="font-weight:900;"><td>Total</td><td align="right">{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>
        {% for p in payments %}<tr><td>{{ p.mode_of_payment }}</td><td align="right">{{ frappe.format(p.amount, {"fieldtype":"Currency"}) }}</td></tr>{% endfor %}
    </table>
    <div style="text-align:center;margin-top:8px;font-size:10px;">{{ footer_text or 'Thank you for shopping!' }}<br>Powered by POS Next</div>
</div>
""",
            "template_css": "/* minimal 80mm */"
        },
        {
            "template_name": "Modern Retail",
            "paper_size": "80mm",
            "is_escpos": 1,
            "is_default": 0,
            "show_logo": 1,
            "show_qr": 0,
            "template_html": """
<div style="width:80mm;font-family:'Inter',Helvetica,sans-serif;padding:10px;color:#1A202C;">
    <div style="text-align:center;">
        <h2 style="margin:0;font-weight:900;letter-spacing:0.5px;">{{ doc.company }}</h2>
        <div style="font-size:10px;color:#718096;margin-top:4px;">{{ company.address_display or '' }}</div>
        <div style="background:#5A67D8;color:#fff;display:inline-block;padding:3px 12px;margin-top:10px;font-size:10px;border-radius:20px;letter-spacing:1px;font-weight:700;">RETAIL RECEIPT</div>
    </div>
    <div style="margin-top:14px;font-size:11px;background:#F7FAFC;padding:8px;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;"><span style="color:#718096;">Receipt No</span><span style="font-weight:700;">{{ doc.name }}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#718096;">Date</span><span>{{ frappe.datetime.now_datetime() }}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#718096;">Customer</span><span>{{ doc.customer_name }}</span></div>
        {% if doc.custom_table %}<div style="display:flex;justify-content:space-between;margin-top:3px;font-weight:700;"><span>Table {{ doc.custom_table }} ({{ doc.custom_order_type }})</span><span>{{ doc.custom_guest_count }} Guests</span></div>{% endif %}
    </div>
    <div style="margin-top:12px;">
        {% for item in items %}
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #EDF2F7;">
            <div><div style="font-weight:600;">{{ item.item_name }}</div><div style="font-size:10px;color:#718096;">{{ item.qty }} x {{ frappe.format(item.rate, {"fieldtype":"Currency"}) }}</div></div>
            <div style="font-weight:700;">{{ frappe.format(item.amount, {"fieldtype":"Currency"}) }}</div>
        </div>
        {% endfor %}
    </div>
    <div style="margin-top:12px;background:#F7FAFC;padding:10px;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;"><span>Subtotal</span><span>{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;"><span>Tax</span><span>{{ frappe.format(doc.total_taxes_and_charges, {"fieldtype":"Currency"}) }}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:900;margin-top:6px;border-top:1px dashed #CBD5E0;padding-top:6px;"><span>TOTAL</span><span>{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</span></div>
    </div>
    <div style="text-align:center;margin-top:14px;font-size:11px;color:#999;">Thank you for your purchase!<br><span style="font-size:9px;">{{ frappe.datetime.now_date() }} • POS Next • Fast & Modern</span></div>
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
<div style="width:80mm;font-family:'Georgia',serif;padding:12px;color:#000;">
    <div style="text-align:center;border:2px solid #000;padding:12px;border-radius:4px;">
        <div style="font-size:20px;font-weight:900;letter-spacing:2px;">{{ doc.company }}</div>
        <div style="font-size:10px;margin-top:4px;letter-spacing:1px;opacity:0.7;">FINE DINING • TAKEAWAY • DELIVERY</div>
    </div>
    <div style="font-size:12px;margin-top:10px;line-height:1.4;">
        <div><strong>Bill No:</strong> {{ doc.name }} | <strong>Date:</strong> {{ doc.posting_date }} {{ doc.posting_time }}</div>
        <div><strong>Table:</strong> {{ doc.custom_table or 'Takeaway' }} | <strong>Guests:</strong> {{ doc.custom_guest_count or 1 }} | <strong>Type:</strong> {{ doc.custom_order_type }}</div>
        <div><strong>Customer:</strong> {{ doc.customer_name }}</div>
        <div><strong>Server:</strong> {{ doc.owner }}</div>
    </div>
    <table style="width:100%;margin-top:12px;font-size:12px;border-top:2px solid #000;border-bottom:2px solid #000;border-collapse:collapse;">
        <thead><tr><th align="left" style="padding:6px 0;">Item</th><th align="center">Qty</th><th align="right">Price</th></tr></thead>
        <tbody>{% for it in items %}<tr><td style="padding:5px 0;">{{ it.item_name }}<br>{% if it.custom_kot_notes %}<span style="font-size:9px;font-style:italic;">Note: {{ it.custom_kot_notes }}</span>{% endif %}</td><td align="center">{{ it.qty }}</td><td align="right">{{ frappe.format(it.amount, {"fieldtype":"Currency"}) }}</td></tr>{% endfor %}</tbody>
    </table>
    <table style="width:100%;margin-top:8px;font-size:12px;">
        <tr><td>Net Total</td><td align="right">{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</td></tr>
        <tr><td>VAT / Service</td><td align="right">{{ frappe.format(doc.total_taxes_and_charges, {"fieldtype":"Currency"}) }}</td></tr>
        <tr style="font-weight:900;font-size:14px;border-top:2px solid #000;"><td>Grand Total</td><td align="right">{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>
    </table>
    <div style="text-align:center;margin-top:14px;border-top:1px dashed #000;padding-top:10px;font-size:10px;">
        Chef's Special: Show this bill for 10% off on next visit<br>
        <div style="margin-top:8px;font-size:12px;font-weight:700;">*** Thank You! Come Again ***</div>
        <div style="margin-top:8px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data={{ doc.name }}" style="width:70px;"></div>
    </div>
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
<div style="width:80mm;font-family:monospace;font-size:10px;padding:6px;color:#000;">
    <div style="text-align:center;"><strong style="font-size:14px;">{{ doc.company }}</strong><br>{{ company.address_display or '' }}<br>VAT: {{ company.tax_id or '' }}</div>
    <hr style="border-top:1px dashed #000;">
    <div>Inv: {{ doc.name }} | {{ doc.posting_date }} {{ doc.posting_time }} | Cashier: {{ doc.owner }}</div>
    <div>Customer: {{ doc.customer_name }}</div>
    <hr>
    <table style="width:100%;font-size:9px;"><thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Rate</th><th align="right">Total</th></tr></thead>
    <tbody>{% for it in items %}<tr><td>{{ it.item_name[:20] }}</td><td align="right">{{ it.qty }}</td><td align="right">{{ it.rate }}</td><td align="right">{{ it.amount }}</td></tr>{% endfor %}</tbody></table>
    <hr>
    <table style="width:100%;"><tr style="font-weight:900;font-size:12px;"><td>GRAND TOTAL</td><td align="right">{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr></table>
    <div style="text-align:center;margin-top:6px;">You saved {{ frappe.format(doc.discount_amount, {"fieldtype":"Currency"}) }} today!<br>Thank you • POS Next</div>
</div>
""",
            "template_css": ""
        },
        {
            "template_name": "A4 Tax Invoice",
            "paper_size": "A4",
            "is_escpos": 0,
            "is_default": 0,
            "show_logo": 1,
            "show_qr": 1,
            "template_html": """
<div style="width:210mm;padding:20px;font-family:Arial,sans-serif;color:#1A202C;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h1 style="margin:0;color:#5A67D8;">{{ doc.company }}</h1><div style="font-size:11px;color:#718096;margin-top:4px;">{{ company.address_display or '' }}<br>{{ company.phone_no or '' }} | {{ company.email or '' }}<br>Tax ID: {{ company.tax_id or '' }}</div></div>
        <div style="text-align:right;"><h2 style="margin:0;color:#2D3748;">TAX INVOICE</h2><div style="font-size:12px;margin-top:6px;">No: <strong>{{ doc.name }}</strong><br>Date: {{ doc.posting_date }}<br>Order: {{ doc.custom_order_type or '' }} | Table: {{ doc.custom_table or '' }}</div></div>
    </div>
    <hr style="border-top:2px solid #5A67D8;margin:16px 0;">
    <div style="display:flex;justify-content:space-between;font-size:12px;">
        <div><strong>Bill To:</strong><br>{{ doc.customer_name }}<br>{{ doc.address_display or '' }}<br>{{ doc.contact_mobile or '' }}</div>
        <div style="text-align:right;"><strong>POS Info:</strong><br>Profile: {{ doc.pos_profile }}<br>Cashier: {{ doc.owner }}<br>Shift: {{ doc.pos_opening_shift }}</div>
    </div>
    <table style="width:100%;margin-top:20px;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#5A67D8;color:white;"><th style="padding:10px;text-align:left;border-radius:6px 0 0 0;">#</th><th style="padding:10px;text-align:left;">Item Description</th><th style="padding:10px;">Qty</th><th style="padding:10px;">Rate</th><th style="padding:10px;">Discount</th><th style="padding:10px;text-align:right;border-radius:0 6px 0 0;">Amount</th></tr></thead>
        <tbody>{% for idx, it in enumerate(items) %}<tr style="border-bottom:1px solid #EDF2F7;"><td style="padding:8px;">{{ idx+1 }}</td><td style="padding:8px;"><strong>{{ it.item_name }}</strong><br><small style="color:#718096;">{{ it.item_code }}{% if it.description %} | {{ it.description[:80] }}{% endif %}</small></td><td style="padding:8px;text-align:center;">{{ it.qty }} {{ it.uom }}</td><td style="padding:8px;text-align:center;">{{ frappe.format(it.rate, {"fieldtype":"Currency"}) }}</td><td style="padding:8px;text-align:center;">{{ it.discount_percentage or 0 }}%</td><td style="padding:8px;text-align:right;font-weight:600;">{{ frappe.format(it.amount, {"fieldtype":"Currency"}) }}</td></tr>{% endfor %}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <table style="font-size:12px;width:320px;background:#F7FAFC;border-radius:8px;padding:10px;">
            <tr><td style="padding:6px;">Subtotal</td><td style="text-align:right;padding:6px;">{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</td></tr>
            {% for tax in taxes %}<tr><td style="padding:6px;">{{ tax.description }}</td><td style="text-align:right;padding:6px;">{{ frappe.format(tax.tax_amount, {"fieldtype":"Currency"}) }}</td></tr>{% endfor %}
            <tr style="font-weight:900;font-size:14px;background:white;border-radius:6px;"><td style="padding:8px;">Grand Total</td><td style="text-align:right;padding:8px;color:#5A67D8;">{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>
            <tr><td style="padding:6px;">Paid</td><td style="text-align:right;padding:6px;">{{ frappe.format(doc.paid_amount, {"fieldtype":"Currency"}) }}</td></tr>
            <tr><td style="padding:6px;">Change</td><td style="text-align:right;padding:6px;">{{ frappe.format(doc.paid_amount - doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>
        </table>
    </div>
    <div style="margin-top:24px;display:flex;justify-content:space-between;font-size:11px;color:#718096;">
        <div>Payments: {% for p in payments %}{{ p.mode_of_payment }} ({{ frappe.format(p.amount, {"fieldtype":"Currency"}) }}) {% endfor %}<br><br>Terms: Goods once sold cannot be returned.</div>
        <div style="text-align:center;"><br><br>___________________<br>Authorized Signature</div>
    </div>
    <div style="margin-top:20px;text-align:center;font-size:10px;color:#A0AEC0;">This is a computer generated invoice • Powered by POS Next • Modern POS • {{ frappe.datetime.now_datetime() }}</div>
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
    if not pos_profile:
        frappe.throw("POS Profile required")
    company = frappe.db.get_value("POS Profile", pos_profile, "company")
    floors_data = [
        {"floor_name": f"{pos_profile}-Ground Floor", "floor_color": "#5A67D8"},
        {"floor_name": f"{pos_profile}-First Floor", "floor_color": "#48BB78"},
        {"floor_name": f"{pos_profile}-Terrace", "floor_color": "#ED8936"},
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
    create_receipt_templates()
    create_roles()
    profiles = frappe.get_all("POS Profile", pluck="name", limit=1)
    if profiles:
        seed_demo_for_profile(profiles[0])
    return "Demo data installed for POS Next v3 - Modern"

@frappe.whitelist()
def fix_workspace_now():
    """Wrapper to fix workspace - callable via bench execute"""
    from pos_next.pos_next.api.fix import fix_workspace_now as _fix
    return _fix()
