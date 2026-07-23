import frappe

def setup_after_install():
    print("POS Next v5.0 - Setup started")
    try:
        ensure_module_def()
        ensure_desktop_icons()
        create_roles()
        create_receipt_templates()
        create_custom_fields_if_missing()
        create_pos_next_settings()
        from pos_next.api.fix import fix_workspace_now
        fix_workspace_now()
    except Exception as e:
        print(f"Setup failed: {e}")
        import traceback
        traceback.print_exc()
    print("POS Next v5.0 setup completed")

def ensure_module_def():
    if not frappe.db.exists("Module Def", "POS Next"):
        doc = frappe.new_doc("Module Def")
        doc.module_name = "POS Next"
        doc.app_name = "pos_next"
        doc.custom = 1
        doc.insert(ignore_permissions=True)
    frappe.db.commit()

def ensure_desktop_icons():
    app_title = "POS Next"
    if not frappe.db.exists("Desktop Icon", {"label": app_title, "icon_type": "App"}):
        try:
            icon_doc = frappe.new_doc("Desktop Icon")
            icon_doc.label = app_title
            icon_doc.icon_type = "App"
            icon_doc.app = "pos_next"
            icon_doc.icon = "octicon octicon-package"
            icon_doc.color = "blue"
            icon_doc.link = "/app/pos_next"
            icon_doc.standard = 1
            icon_doc.hidden = 0
            icon_doc.insert(ignore_permissions=True)
        except Exception as e:
            print(f"Desktop Icon failed: {e}")
    else:
        try:
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "link", "/app/pos_next")
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "icon", "octicon octicon-package")
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "hidden", 0)
        except:
            pass
    frappe.db.commit()

def create_roles():
    roles = [{"role_name": "Kitchen User", "desk_access": 0},{"role_name": "POS Cashier Manager", "desk_access": 1},{"role_name": "POS Manager", "desk_access": 1}]
    for r in roles:
        if not frappe.db.exists("Role", r["role_name"]):
            doc = frappe.new_doc("Role")
            doc.role_name = r["role_name"]
            doc.desk_access = r["desk_access"]
            doc.insert(ignore_permissions=True)
    frappe.db.commit()

def create_pos_next_settings():
    try:
        doc = frappe.get_single("POS Next Settings")
        doc.save(ignore_permissions=True)
    except:
        pass
    frappe.db.commit()

def create_custom_fields_if_missing():
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field
    fields = [
        {"dt":"POS Profile","label":"Enable POS Next","fieldname":"custom_enable_pos_next","fieldtype":"Check","insert_after":"company","default":"1","module":"POS Next"},
        {"dt":"POS Profile","label":"POS Mode","fieldname":"custom_pos_mode","fieldtype":"Select","options":"Retail\nRestaurant\nSupermarket\nWholesale\nBar & Pub\nBakery\nPharmacy\nFashion\nMulti-Business","default":"Retail","insert_after":"custom_enable_pos_next","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Table Management","fieldname":"custom_enable_table_management","fieldtype":"Check","default":"1","insert_after":"custom_pos_mode","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable KDS","fieldname":"custom_enable_kds","fieldtype":"Check","default":"1","insert_after":"custom_enable_table_management","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Customer Display","fieldname":"custom_enable_customer_display","fieldtype":"Check","default":"1","insert_after":"custom_enable_kds","module":"POS Next"},
        {"dt":"POS Profile","label":"Receipt Template","fieldname":"custom_receipt_template","fieldtype":"Link","options":"POS Receipt Template","insert_after":"custom_enable_customer_display","module":"POS Next"},
        {"dt":"POS Profile","label":"KDS Refresh","fieldname":"custom_kds_refresh_seconds","fieldtype":"Int","default":"3","insert_after":"custom_receipt_template","module":"POS Next"},
        {"dt":"POS Profile","label":"KOT Printer Map","fieldname":"custom_kot_printer_map","fieldtype":"Table","options":"POS KOT Printer Map","insert_after":"custom_kds_refresh_seconds","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Weighted Barcode","fieldname":"custom_enable_weighted_barcode","fieldtype":"Check","default":"1","insert_after":"custom_kot_printer_map","module":"POS Next"},
        {"dt":"POS Profile","label":"Weighted Prefixes","fieldname":"custom_weighted_barcode_prefixes","fieldtype":"Data","default":"20,21,22,23,24,27,28,29","insert_after":"custom_enable_weighted_barcode","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Cash In/Out","fieldname":"custom_enable_cash_in_out","fieldtype":"Check","default":"1","insert_after":"custom_weighted_barcode_prefixes","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Split Bill","fieldname":"custom_enable_split_bill","fieldtype":"Check","default":"1","insert_after":"custom_enable_cash_in_out","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Offline","fieldname":"custom_enable_offline_hard","fieldtype":"Check","default":"1","insert_after":"custom_enable_split_bill","module":"POS Next"},
        {"dt":"POS Profile","label":"Enable Hotkeys","fieldname":"custom_enable_quick_hotkeys","fieldtype":"Check","default":"1","insert_after":"custom_enable_offline_hard","module":"POS Next"},
        {"dt":"POS Invoice","label":"Table","fieldname":"custom_table","fieldtype":"Link","options":"POS Table","insert_after":"pos_profile","module":"POS Next"},
        {"dt":"POS Invoice","label":"Guest Count","fieldname":"custom_guest_count","fieldtype":"Int","default":"1","insert_after":"custom_table","module":"POS Next"},
        {"dt":"POS Invoice","label":"Order Type","fieldname":"custom_order_type","fieldtype":"Select","options":"Dine In\nTakeaway\nDelivery\nDrive-Thru\nQuick Sale\nWholesale","default":"Dine In","insert_after":"custom_guest_count","module":"POS Next"},
        {"dt":"POS Invoice","label":"KOT Status","fieldname":"custom_kot_status","fieldtype":"Select","options":"Not Sent\nSent\nPartially Served\nServed","default":"Not Sent","insert_after":"custom_order_type","module":"POS Next"},
        {"dt":"POS Invoice","label":"Offline ID","fieldname":"custom_offline_id","fieldtype":"Data","insert_after":"custom_kot_status","module":"POS Next"},
        {"dt":"POS Invoice","label":"Is Split","fieldname":"custom_is_split","fieldtype":"Check","insert_after":"custom_offline_id","module":"POS Next"},
        {"dt":"POS Invoice","label":"Parent Invoice","fieldname":"custom_parent_invoice","fieldtype":"Link","options":"POS Invoice","insert_after":"custom_is_split","module":"POS Next"},
        {"dt":"POS Invoice Item","label":"Kitchen Notes","fieldname":"custom_kot_notes","fieldtype":"Small Text","module":"POS Next"},
        {"dt":"POS Invoice Item","label":"KOT Fired","fieldname":"custom_is_kot_fired","fieldtype":"Check","default":"0","module":"POS Next"},
    ]
    for f in fields:
        if not frappe.db.exists("Custom Field", {"dt": f["dt"], "fieldname": f["fieldname"]}):
            try:
                create_custom_field(f["dt"], f, ignore_validate=True)
            except:
                pass
    frappe.db.commit()

def create_receipt_templates():
    templates = [
        {"template_name": "Minimal 80mm","paper_size": "80mm","is_escpos": 1,"is_default": 1,"show_logo": 1,"show_qr": 1,"template_html": "<div>Minimal {{ doc.name }}</div>","template_css": ""},
        {"template_name": "Modern Retail","paper_size": "80mm","is_escpos": 1,"is_default": 0,"show_logo": 1,"show_qr": 0,"template_html": "<div>Modern {{ doc.company }}</div>","template_css": ""},
        {"template_name": "Restaurant Elegant","paper_size": "80mm","is_escpos": 1,"is_default": 0,"show_logo": 0,"show_qr": 1,"template_html": "<div>Restaurant {{ doc.grand_total }}</div>","template_css": ""},
        {"template_name": "Supermarket Detailed","paper_size": "80mm","is_escpos": 1,"is_default": 0,"show_logo": 0,"show_qr": 0,"template_html": "<div>Supermarket {{ doc.name }}</div>","template_css": ""},
        {"template_name": "A4 Tax Invoice","paper_size": "A4","is_escpos": 0,"is_default": 0,"show_logo": 1,"show_qr": 1,"template_html": "<div>A4 {{ doc.name }}</div>","template_css": ""},
    ]
    for tmpl in templates:
        if not frappe.db.exists("POS Receipt Template", tmpl["template_name"]):
            d = frappe.new_doc("POS Receipt Template")
            d.update(tmpl)
            d.insert(ignore_permissions=True)
    frappe.db.commit()

@frappe.whitelist()
def fix_workspace_now():
    from pos_next.api.fix import fix_workspace_now as _fix
    return _fix()

@frappe.whitelist()
def seed_demo_for_profile(pos_profile):
    if not pos_profile:
        frappe.throw("POS Profile required")
    company = frappe.db.get_value("POS Profile", pos_profile, "company")
    floors = []
    for fname in [f"{pos_profile}-Ground Floor", f"{pos_profile}-First Floor", f"{pos_profile}-Terrace"]:
        if not frappe.db.exists("POS Floor", fname):
            f = frappe.new_doc("POS Floor")
            f.floor_name = fname
            f.pos_profile = pos_profile
            f.company = company
            f.is_active = 1
            f.insert(ignore_permissions=True)
            floors.append(f.name)
        else:
            floors.append(fname)
    for floor in floors:
        for i in range(1, 5):
            tname = f"{floor}-T{i}"
            if not frappe.db.exists("POS Table", tname):
                t = frappe.new_doc("POS Table")
                t.table_name = tname
                t.floor = floor
                t.pos_profile = pos_profile
                t.seats = 4
                t.status = "Available"
                t.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"floors": floors, "message": f"Demo floors/tables created for {pos_profile}"}

@frappe.whitelist()
def install_demo_data():
    create_receipt_templates()
    create_roles()
    profiles = frappe.get_all("POS Profile", pluck="name", limit=1)
    if profiles:
        seed_demo_for_profile(profiles[0])
    return "Demo data installed - Floors, Tables, Receipts"
