import frappe
import json
import os

@frappe.whitelist()
def fix_workspace_now():
    """Force create POS Next workspace directly via code - bypass file sync issues"""
    print("=== POS Next Workspace Fix Started ===")
    
    # 1. Ensure Module Def exists
    try:
        if not frappe.db.exists("Module Def", "POS Next"):
            doc = frappe.new_doc("Module Def")
            doc.module_name = "POS Next"
            doc.app_name = "pos_next"
            doc.custom = 1
            doc.insert(ignore_permissions=True)
            print("Created Module Def POS Next")
        else:
            print("Module Def exists")
    except Exception as e:
        print(f"Module Def error: {e}")

    # 2. Delete broken workspace if exists
    try:
        if frappe.db.exists("Workspace", "POS Next"):
            frappe.db.delete("Workspace", "POS Next")
            frappe.db.commit()
            print("Deleted old broken workspace")
    except Exception as e:
        print(f"Delete old workspace failed: {e}")

    # 3. Try sync from file first
    try:
        from frappe.model.sync import sync_for
        sync_for("pos_next", force=True, reset_permissions=True)
        print("sync_for executed")
    except Exception as e:
        print(f"sync_for failed: {e}")

    # 4. If still not exists, create via code directly - guaranteed to work
    try:
        if not frappe.db.exists("Workspace", "POS Next"):
            print("Workspace still not found, creating via code...")
            workspace_content = [
                {"id":"header_ops","type":"header","data":{"text":"<span class=\"h4\">POS Operations</span>","col":12}},
                {"id":"card_pos","type":"card","data":{"card_name":"Point of Sale","col":6}},
                {"id":"card_cash","type":"card","data":{"card_name":"Cash & Shifts","col":6}},
                {"id":"card_kitchen","type":"card","data":{"card_name":"Kitchen","col":6}},
                {"id":"header_master","type":"header","data":{"text":"<span class=\"h4\">Master Data</span>","col":12}},
                {"id":"card_restaurant","type":"card","data":{"card_name":"Restaurant Setup","col":4}},
                {"id":"card_receipt","type":"card","data":{"card_name":"Receipt & Printing","col":4}},
                {"id":"card_settings","type":"card","data":{"card_name":"Settings & Tools","col":4}},
                {"id":"header_reports","type":"header","data":{"text":"<span class=\"h4\">Reports & Analytics</span>","col":12}},
                {"id":"card_sales","type":"card","data":{"card_name":"Sales Reports","col":6}},
                {"id":"card_ops_report","type":"card","data":{"card_name":"Operations Reports","col":6}},
            ]
            
            links = [
                {"card_name": "Point of Sale","label": "Point of Sale","link_to": "point-of-sale","link_type": "Page","type": "Link"},
                {"card_name": "Point of Sale","label": "POS Invoices","link_to": "POS Invoice","link_type": "DocType","type": "Link"},
                {"card_name": "Point of Sale","label": "POS Opening Shift","link_to": "POS Opening Shift","link_type": "DocType","type": "Link"},
                {"card_name": "Point of Sale","label": "POS Profiles","link_to": "POS Profile","link_type": "DocType","type": "Link"},
                {"card_name": "Cash & Shifts","label": "Cash Transactions","link_to": "POS Cash Transaction","link_type": "DocType","type": "Link"},
                {"card_name": "Cash & Shifts","label": "X Z Report","link_to": "POS X Z Report","link_type": "Report","is_query_report": 1,"type": "Link"},
                {"card_name": "Cash & Shifts","label": "Cashier Log","link_to": "POS Cashier Log","link_type": "Report","is_query_report": 1,"type": "Link"},
                {"card_name": "Kitchen","label": "Kitchen Orders (KOT)","link_to": "POS KOT","link_type": "DocType","type": "Link"},
                {"card_name": "Kitchen","label": "KOT Performance","link_to": "KOT Performance","link_type": "Report","is_query_report": 1,"type": "Link"},
                {"card_name": "Restaurant Setup","label": "POS Floors","link_to": "POS Floor","link_type": "DocType","type": "Link"},
                {"card_name": "Restaurant Setup","label": "POS Tables","link_to": "POS Table","link_type": "DocType","type": "Link"},
                {"card_name": "Restaurant Setup","label": "Table Wise Sales","link_to": "POS Table Wise Sales","link_type": "Report","is_query_report": 1,"type": "Link"},
                {"card_name": "Receipt & Printing","label": "Receipt Templates","link_to": "POS Receipt Template","link_type": "DocType","type": "Link"},
                {"card_name": "Settings & Tools","label": "POS Next Settings","link_to": "POS Next Settings","link_type": "DocType","type": "Link"},
                {"card_name": "Settings & Tools","label": "POS Settings","link_to": "POS Settings","link_type": "DocType","type": "Link"},
                {"card_name": "Sales Reports","label": "Sales Summary","link_to": "POS Sales Summary","link_type": "Report","is_query_report": 1,"type": "Link"},
                {"card_name": "Sales Reports","label": "Product Performance","link_to": "POS Product Performance","link_type": "Report","is_query_report": 1,"type": "Link"},
                {"card_name": "Sales Reports","label": "Hourly Sales","link_to": "POS Hourly Sales","link_type": "Report","is_query_report": 1,"type": "Link"},
                {"card_name": "Operations Reports","label": "X Z Report","link_to": "POS X Z Report","link_type": "Report","is_query_report": 1,"type": "Link"},
                {"card_name": "Operations Reports","label": "Cashier Log","link_to": "POS Cashier Log","link_type": "Report","is_query_report": 1,"type": "Link"},
            ]
            
            shortcuts = [
                {"label": "POS Opening Shift","link_to": "POS Opening Shift","type": "DocType","color": "#5A67D8","doc_view": "List","stats_filter": "[]"},
                {"label": "POS Floor","link_to": "POS Floor","type": "DocType","color": "#805AD5","doc_view": "List","stats_filter": "[]"},
                {"label": "Kitchen Orders","link_to": "POS KOT","type": "DocType","color": "#48BB78","doc_view": "List","stats_filter": "{\"kot_status\": [\"not in\", [\"Served\", \"Cancelled\"]]}"},
            ]
            
            ws = frappe.new_doc("Workspace")
            ws.name = "POS Next"
            ws.label = "POS Next"
            ws.title = "POS Next"
            ws.icon = "shopping-cart"
            ws.module = "POS Next"
            ws.public = 1
            ws.is_hidden = 0
            ws.hide_custom = 0
            ws.for_user = ""
            ws.content = json.dumps(workspace_content)
            ws.links = []
            for l in links:
                ws.append("links", l)
            ws.shortcuts = []
            for s in shortcuts:
                ws.append("shortcuts", s)
            ws.roles = []
            for role in ["System Manager", "Sales Manager", "Sales User"]:
                ws.append("roles", {"role": role})
            
            ws.insert(ignore_permissions=True)
            print(f"Created workspace via code: {ws.name}")
        else:
            print("Workspace exists after sync, updating icon to ensure visibility")
            frappe.db.set_value("Workspace", "POS Next", "icon", "shopping-cart")
            frappe.db.set_value("Workspace", "POS Next", "public", 1)
            frappe.db.set_value("Workspace", "POS Next", "is_hidden", 0)
    except Exception as e:
        print(f"Code creation failed: {e}")
        import traceback
        traceback.print_exc()

    frappe.db.commit()
    
    # Final check
    exists = frappe.db.exists("Workspace", "POS Next")
    print(f"Final check - Workspace exists: {exists}")
    if exists:
        ws = frappe.get_doc("Workspace", "POS Next")
        print(f"Workspace: {ws.name}, Icon: {ws.icon}, Public: {ws.public}, Module: {ws.module}")
    
    frappe.clear_cache()
    return f"POS Next workspace fixed - exists: {exists} - Go to /app/pos-next - Clear browser cache with Ctrl+Shift+R"

@frappe.whitelist()
def check_workspace():
    ws = frappe.get_all("Workspace", filters={"name":"POS Next"}, fields=["name","icon","public","module","is_hidden"])
    return ws

@frappe.whitelist()
def force_rebuild_workspace():
    return fix_workspace_now()
