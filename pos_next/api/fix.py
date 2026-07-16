import frappe
import json

@frappe.whitelist()
def fix_workspace_now():
    """Force create POS Next workspace via code - minimal then full, handles all edge cases"""
    print("=== POS Next Workspace Fix v4.4 ===")
    
    # 1. Ensure Module Def
    try:
        if not frappe.db.exists("Module Def", "POS Next"):
            doc = frappe.new_doc("Module Def")
            doc.module_name = "POS Next"
            doc.app_name = "pos_next"
            doc.custom = 1
            doc.insert(ignore_permissions=True)
            print("Created Module Def POS Next")
    except Exception as e:
        print(f"Module Def error: {e}")

    # 2. Ensure Desktop Icons for ALL apps to prevent NoneType startswith bug in frappe core
    try:
        from frappe import get_installed_apps
        for app in get_installed_apps():
            try:
                titles = frappe.get_hooks("app_title", app_name=app)
                app_title = titles[0] if titles else app
                if not frappe.db.exists("Desktop Icon", {"label": app_title, "icon_type": "App"}):
                    icon_doc = frappe.new_doc("Desktop Icon")
                    icon_doc.label = app_title
                    icon_doc.icon_type = "App"
                    icon_doc.app = app
                    icon_doc.icon = "octicon octicon-package"
                    icon_doc.color = "blue"
                    icon_doc.link = f"/app/{frappe.scrub(app_title)}"
                    icon_doc.standard = 1
                    icon_doc.hidden = 0
                    icon_doc.insert(ignore_permissions=True)
                    print(f"Created Desktop Icon for app: {app_title}")
                else:
                    # Ensure link starts with /app and icon not None
                    try:
                        frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "link", f"/app/{frappe.scrub(app_title)}")
                        # Ensure icon exists
                        existing_icon = frappe.db.get_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "icon")
                        if not existing_icon:
                            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "icon", "octicon octicon-package")
                    except Exception as inner:
                        print(f"Update icon for {app_title} failed: {inner}")
            except Exception as e:
                print(f"App icon ensure for {app} failed: {e}")
    except Exception as e:
        print(f"Ensure all app icons failed: {e}")
        import traceback
        traceback.print_exc()

    # 3. Delete old broken workspace
    try:
        if frappe.db.exists("Workspace", "POS Next"):
            frappe.db.delete("Workspace", "POS Next")
            frappe.db.commit()
            print("Deleted old POS Next workspace")
    except Exception as e:
        print(f"Delete old workspace failed: {e}")

    # 4. Try sync from file
    try:
        from frappe.model.sync import sync_for
        sync_for("pos_next", force=True, reset_permissions=True)
        print("sync_for executed")
    except Exception as e:
        print(f"sync_for failed: {e}")

    # 5. Create workspace via code - with validation-safe links
    try:
        if frappe.db.exists("Workspace", "POS Next"):
            frappe.db.delete("Workspace", "POS Next")
            frappe.db.commit()
        
        print("Creating NEW full workspace via code...")
        
        # Define all possible links with their types, will be filtered by existence
        possible_links = [
            {"card_name": "Point of Sale", "label": "Point of Sale", "link_to": "point-of-sale", "link_type": "Page", "type": "Link"},
            {"card_name": "Point of Sale", "label": "POS Invoices", "link_to": "POS Invoice", "link_type": "DocType", "type": "Link"},
            {"card_name": "Point of Sale", "label": "POS Opening Shift", "link_to": "POS Opening Shift", "link_type": "DocType", "type": "Link"},
            {"card_name": "Point of Sale", "label": "POS Closing Shift", "link_to": "POS Closing Shift", "link_type": "DocType", "type": "Link"},
            {"card_name": "Point of Sale", "label": "POS Profiles", "link_to": "POS Profile", "link_type": "DocType", "type": "Link"},
            {"card_name": "Cash & Shifts", "label": "Cash Transactions", "link_to": "POS Cash Transaction", "link_type": "DocType", "type": "Link"},
            {"card_name": "Cash & Shifts", "label": "POS Next Settings", "link_to": "POS Next Settings", "link_type": "DocType", "type": "Link"},
            {"card_name": "Kitchen", "label": "Kitchen Orders (KOT)", "link_to": "POS KOT", "link_type": "DocType", "type": "Link"},
            {"card_name": "Restaurant Setup", "label": "POS Floors", "link_to": "POS Floor", "link_type": "DocType", "type": "Link"},
            {"card_name": "Restaurant Setup", "label": "POS Tables", "link_to": "POS Table", "link_type": "DocType", "type": "Link"},
            {"card_name": "Receipt & Printing", "label": "Receipt Templates", "link_to": "POS Receipt Template", "link_type": "DocType", "type": "Link"},
            # Reports - only add if they exist
            {"card_name": "Sales Reports", "label": "Sales Summary", "link_to": "POS Sales Summary", "link_type": "Report", "is_query_report": 1, "type": "Link"},
            {"card_name": "Sales Reports", "label": "Product Performance", "link_to": "POS Product Performance", "link_type": "Report", "is_query_report": 1, "type": "Link"},
            {"card_name": "Sales Reports", "label": "Hourly Sales", "link_to": "POS Hourly Sales", "link_type": "Report", "is_query_report": 1, "type": "Link"},
            {"card_name": "Sales Reports", "label": "Table Wise Sales", "link_to": "POS Table Wise Sales", "link_type": "Report", "is_query_report": 1, "type": "Link"},
            {"card_name": "Operations Reports", "label": "X Z Report", "link_to": "POS X Z Report", "link_type": "Report", "is_query_report": 1, "type": "Link"},
            {"card_name": "Operations Reports", "label": "Cashier Log", "link_to": "POS Cashier Log", "link_type": "Report", "is_query_report": 1, "type": "Link"},
            {"card_name": "Operations Reports", "label": "KOT Performance", "link_to": "KOT Performance", "link_type": "Report", "is_query_report": 1, "type": "Link"},
        ]
        
        # Filter links - only keep those where link_to exists
        valid_links = []
        for link in possible_links:
            try:
                lt = link["link_type"]
                lto = link["link_to"]
                exists = False
                if lt == "DocType":
                    exists = frappe.db.exists("DocType", lto) is not None
                elif lt == "Report":
                    exists = frappe.db.exists("Report", lto) is not None
                elif lt == "Page":
                    exists = frappe.db.exists("Page", lto) is not None or True  # Pages may not be in DB, allow
                else:
                    exists = True
                
                if exists:
                    valid_links.append(link)
                    print(f"Link OK: {lto} ({lt})")
                else:
                    print(f"Link SKIP (not found): {lto} ({lt})")
            except Exception as e:
                print(f"Link check failed for {link['link_to']}: {e} - skipping")
        
        content = [
            {"id":"header_ops","type":"header","data":{"text":"<span class=\"h4\">POS Operations</span>","col":12}},
            {"id":"card_pos","type":"card","data":{"card_name":"Point of Sale","col":4}},
            {"id":"card_cash","type":"card","data":{"card_name":"Cash & Shifts","col":4}},
            {"id":"card_kitchen","type":"card","data":{"card_name":"Kitchen","col":4}},
            {"id":"header_master","type":"header","data":{"text":"<span class=\"h4\">Master Data</span>","col":12}},
            {"id":"card_restaurant","type":"card","data":{"card_name":"Restaurant Setup","col":4}},
            {"id":"card_receipt","type":"card","data":{"card_name":"Receipt & Printing","col":4}},
            {"id":"card_settings","type":"card","data":{"card_name":"Settings & Tools","col":4}},
            {"id":"header_reports","type":"header","data":{"text":"<span class=\"h4\">Reports & Analytics</span>","col":12}},
            {"id":"card_sales","type":"card","data":{"card_name":"Sales Reports","col":6}},
            {"id":"card_ops","type":"card","data":{"card_name":"Operations Reports","col":6}},
        ]
        
        shortcuts = [
            {"label": "POS Opening Shift","link_to": "POS Opening Shift","type": "DocType","color": "blue","doc_view": "List","stats_filter": "[]"},
            {"label": "POS Floor","link_to": "POS Floor","type": "DocType","color": "green","doc_view": "List","stats_filter": "[]"},
            {"label": "Kitchen Orders","link_to": "POS KOT","type": "DocType","color": "orange","doc_view": "List","stats_filter": "{\"kot_status\": [\"not in\", [\"Served\", \"Cancelled\"]]}"},
            {"label": "POS Next Settings","link_to": "POS Next Settings","type": "DocType","color": "violet","doc_view": "List","stats_filter": "[]"},
        ]
        
        # Filter shortcuts by existence
        valid_shortcuts = []
        for sc in shortcuts:
            if frappe.db.exists("DocType", sc["link_to"]):
                valid_shortcuts.append(sc)
        
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
        ws.content = json.dumps(content)
        ws.sequence_id = 10
        
        # Add links
        for l in valid_links:
            ws.append("links", l)
        
        # Add shortcuts
        for s in valid_shortcuts:
            ws.append("shortcuts", s)
        
        # Add roles
        for role in ["System Manager", "Sales Manager", "Sales User", "Accounts Manager"]:
            if frappe.db.exists("Role", role):
                ws.append("roles", {"role": role})
        
        ws.insert(ignore_permissions=True)
        print(f"Created FULL workspace: {ws.name} with {len(valid_links)} links, {len(valid_shortcuts)} shortcuts")
        
    except Exception as e:
        print(f"Full workspace creation failed: {e}")
        import traceback
        traceback.print_exc()
        # Fallback minimal
        try:
            if frappe.db.exists("Workspace", "POS Next"):
                frappe.db.delete("Workspace", "POS Next")
            ws = frappe.new_doc("Workspace")
            ws.name = "POS Next"
            ws.label = "POS Next"
            ws.title = "POS Next"
            ws.icon = "package"
            ws.module = "POS Next"
            ws.public = 1
            ws.is_hidden = 0
            ws.content = "[]"
            ws.append("roles", {"role": "System Manager"})
            ws.insert(ignore_permissions=True)
            print("Created FALLBACK minimal workspace")
        except Exception as e2:
            print(f"Fallback also failed: {e2}")

    frappe.db.commit()
    frappe.clear_cache()
    
    exists = frappe.db.exists("Workspace", "POS Next")
    print(f"Final check exists: {exists}")
    if exists:
        ws = frappe.get_doc("Workspace", "POS Next")
        print(f"WS: {ws.name} icon={ws.icon} public={ws.public} links={len(ws.links)}")
    
    return f"POS Next workspace fixed v4.4 - exists: {exists} - Links: {len(ws.links) if exists else 0} - Go to /app/pos-next Ctrl+Shift+R"

@frappe.whitelist()
def check_workspace():
    ws = frappe.get_all("Workspace", filters={"name":"POS Next"}, fields=["name","icon","public","module","is_hidden"])
    return ws

@frappe.whitelist()
def force_rebuild_workspace():
    return fix_workspace_now()
