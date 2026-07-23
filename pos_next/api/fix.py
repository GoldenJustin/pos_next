import frappe, json

@frappe.whitelist()
def fix_workspace_now():
    print("=== POS Next v6.0 Fix ===")
    # Module Def
    if not frappe.db.exists("Module Def", "POS Next"):
        doc = frappe.new_doc("Module Def")
        doc.module_name = "POS Next"
        doc.app_name = "pos_next"
        doc.custom = 1
        doc.insert(ignore_permissions=True)

    # Desktop Icon
    app_title = "POS Next"
    try:
        if not frappe.db.exists("Desktop Icon", {"label": app_title, "icon_type": "App"}):
            d = frappe.new_doc("Desktop Icon")
            d.label = app_title
            d.icon_type = "App"
            d.app = "pos_next"
            d.icon = "octicon octicon-package"
            d.color = "blue"
            d.link = "/app/pos-next"
            d.standard = 1
            d.hidden = 0
            d.insert(ignore_permissions=True)
        else:
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "link", "/app/pos-next")
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "icon", "octicon octicon-package")
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "hidden", 0)
    except Exception as e:
        print(f"Desktop icon error: {e}")

    # Delete all old variants
    for ws_name in ["POS Next", "pos-next", "pos_next"]:
        try:
            if frappe.db.exists("Workspace", ws_name):
                frappe.db.delete("Workspace", ws_name)
                print(f"Deleted {ws_name}")
        except:
            pass
    frappe.db.commit()

    # Sync
    try:
        from frappe.model.sync import sync_for
        sync_for("pos_next", force=True, reset_permissions=True)
        print("sync_for done")
    except Exception as e:
        print(f"sync_for failed: {e}")

    # Create single workspace POS Next
    try:
        if frappe.db.exists("Workspace", "POS Next"):
            frappe.db.delete("Workspace", "POS Next")
            frappe.db.commit()
        
        content = [
            {"id":"header_ops","type":"header","data":{"text":"<span class=\"h4\">POS Operations</span>","col":12}},
            {"id":"card_pos","type":"card","data":{"card_name":"Point of Sale","col":4}},
            {"id":"card_cash","type":"card","data":{"card_name":"Cash & Shifts","col":4}},
            {"id":"card_kitchen","type":"card","data":{"card_name":"Kitchen","col":4}},
            {"id":"header_master","type":"header","data":{"text":"<span class=\"h4\">Master Data</span>","col":12}},
            {"id":"card_restaurant","type":"card","data":{"card_name":"Restaurant Setup","col":4}},
            {"id":"card_receipt","type":"card","data":{"card_name":"Receipt & Printing","col":4}},
            {"id":"card_settings","type":"card","data":{"card_name":"Settings & Tools","col":4}},
            {"id":"header_reports","type":"header","data":{"text":"<span class=\"h4\">Reports</span>","col":12}},
            {"id":"card_sales","type":"card","data":{"card_name":"Sales Reports","col":6}},
            {"id":"card_ops","type":"card","data":{"card_name":"Operations Reports","col":6}},
        ]
        links = [
            {"card_name": "Point of Sale","label": "Point of Sale","link_to": "point-of-sale","link_type": "Page","type": "Link"},
            {"card_name": "Point of Sale","label": "POS Invoices","link_to": "POS Invoice","link_type": "DocType","type": "Link"},
            {"card_name": "Point of Sale","label": "POS Profiles","link_to": "POS Profile","link_type": "DocType","type": "Link"},
            {"card_name": "Cash & Shifts","label": "Cash Transactions","link_to": "POS Cash Transaction","link_type": "DocType","type": "Link"},
            {"card_name": "Cash & Shifts","label": "POS Next Settings","link_to": "POS Next Settings","link_type": "DocType","type": "Link"},
            {"card_name": "Kitchen","label": "Kitchen Orders","link_to": "POS KOT","link_type": "DocType","type": "Link"},
            {"card_name": "Restaurant Setup","label": "POS Floors","link_to": "POS Floor","link_type": "DocType","type": "Link"},
            {"card_name": "Restaurant Setup","label": "POS Tables","link_to": "POS Table","link_type": "DocType","type": "Link"},
            {"card_name": "Receipt & Printing","label": "Receipt Templates","link_to": "POS Receipt Template","link_type": "DocType","type": "Link"},
            {"card_name": "Sales Reports","label": "Sales Summary","link_to": "POS Sales Summary","link_type": "Report","is_query_report": 1,"type": "Link"},
            {"card_name": "Operations Reports","label": "X Z Report","link_to": "POS X Z Report","link_type": "Report","is_query_report": 1,"type": "Link"},
        ]
        ws = frappe.new_doc("Workspace")
        ws.name = "POS Next"
        ws.label = "POS Next"
        ws.title = "POS Next"
        ws.icon = "package"
        ws.module = "POS Next"
        ws.app = "pos_next"
        ws.public = 1
        ws.is_hidden = 0
        ws.for_user = ""
        ws.content = json.dumps(content)
        ws.sequence_id = 10
        for l in links:
            ws.append("links", l)
        ws.append("roles", {"role": "System Manager"})
        ws.append("roles", {"role": "Sales Manager"})
        ws.insert(ignore_permissions=True)
        print(f"Created workspace POS Next with {len(links)} links")
    except Exception as e:
        print(f"Create failed: {e}")
        import traceback
        traceback.print_exc()

    frappe.db.commit()
    frappe.clear_cache()
    all_ws = frappe.get_all("Workspace", filters={"module": "POS Next"}, fields=["name","icon","public"])
    print(f"All WS: {all_ws}")
    return f"Fixed v6.0 - {all_ws} - Go to /app/pos-next with Ctrl+Shift+R"

@frappe.whitelist()
def check_workspace():
    return frappe.get_all("Workspace", filters={"module": "POS Next"}, fields=["name","icon","public","is_hidden","app"])

@frappe.whitelist()
def force_rebuild_workspace():
    return fix_workspace_now()
