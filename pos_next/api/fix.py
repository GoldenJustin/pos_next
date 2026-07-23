import frappe, json

@frappe.whitelist()
def fix_workspace_now():
    print("=== POS Next v5.1 Full Workspace Fix ===")
    
    # Ensure Module Def
    if not frappe.db.exists("Module Def", "POS Next"):
        doc = frappe.new_doc("Module Def")
        doc.module_name = "POS Next"
        doc.app_name = "pos_next"
        doc.custom = 1
        doc.insert(ignore_permissions=True)

    # Ensure Desktop Icon
    app_title = "POS Next"
    if not frappe.db.exists("Desktop Icon", {"label": app_title, "icon_type": "App"}):
        try:
            d = frappe.new_doc("Desktop Icon")
            d.label = app_title
            d.icon_type = "App"
            d.app = "pos_next"
            d.icon = "octicon octicon-package"
            d.color = "blue"
            d.link = "/app/pos_next"
            d.standard = 1
            d.hidden = 0
            d.insert(ignore_permissions=True)
        except:
            pass
    else:
        try:
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "link", "/app/pos_next")
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "icon", "octicon octicon-package")
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "hidden", 0)
        except:
            pass

    # Delete all old variants to avoid conflict
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
    except Exception as e:
        print(f"sync_for failed: {e}")

    # Force delete again after sync to ensure clean
    for ws_name in ["POS Next", "pos-next", "pos_next"]:
        try:
            if frappe.db.exists("Workspace", ws_name):
                frappe.db.delete("Workspace", ws_name)
        except:
            pass
    frappe.db.commit()

    # Create FULL workspace via code
    try:
        print("Creating FULL workspace POS Next...")
        
        # Full content with 8 cards as per file
        content = [
            {"id":"header_ops","type":"header","data":{"text":"<span class=\"h4\">POS Operations</span>","col":12}},
            {"id":"card_pos","type":"card","data":{"card_name":"Point of Sale","col":4}},
            {"id":"card_cash","type":"card","data":{"card_name":"Cash & Shifts","col":4}},
            {"id":"card_kitchen","type":"card","data":{"card_name":"Kitchen","col":4}},
            {"id":"header_master","type":"header","data":{"text":"<span class=\"h4\">Master Data & Configuration</span>","col":12}},
            {"id":"card_restaurant","type":"card","data":{"card_name":"Restaurant Setup","col":4}},
            {"id":"card_receipt","type":"card","data":{"card_name":"Receipt & Printing","col":4}},
            {"id":"card_settings","type":"card","data":{"card_name":"Settings & Tools","col":4}},
            {"id":"header_reports","type":"header","data":{"text":"<span class=\"h4\">Reports & Analytics</span>","col":12}},
            {"id":"card_sales","type":"card","data":{"card_name":"Sales Reports","col":6}},
            {"id":"card_ops","type":"card","data":{"card_name":"Operations Reports","col":6}},
        ]

        possible_links = [
            {"card_name": "Point of Sale","label": "Point of Sale","link_to": "point-of-sale","link_type": "Page","type": "Link"},
            {"card_name": "Point of Sale","label": "POS Invoices","link_to": "POS Invoice","link_type": "DocType","type": "Link"},
            {"card_name": "Point of Sale","label": "POS Profiles","link_to": "POS Profile","link_type": "DocType","type": "Link"},
            {"card_name": "Point of Sale","label": "POS Opening Shift","link_to": "POS Opening Shift","link_type": "DocType","type": "Link"},
            {"card_name": "Cash & Shifts","label": "Cash Transactions","link_to": "POS Cash Transaction","link_type": "DocType","type": "Link"},
            {"card_name": "Cash & Shifts","label": "POS Next Settings","link_to": "POS Next Settings","link_type": "DocType","type": "Link"},
            {"card_name": "Kitchen","label": "Kitchen Orders (KOT)","link_to": "POS KOT","link_type": "DocType","type": "Link"},
            {"card_name": "Restaurant Setup","label": "POS Floors","link_to": "POS Floor","link_type": "DocType","type": "Link"},
            {"card_name": "Restaurant Setup","label": "POS Tables","link_to": "POS Table","link_type": "DocType","type": "Link"},
            {"card_name": "Receipt & Printing","label": "Receipt Templates","link_to": "POS Receipt Template","link_type": "DocType","type": "Link"},
            {"card_name": "Sales Reports","label": "Sales Summary","link_to": "POS Sales Summary","link_type": "Report","is_query_report": 1,"type": "Link"},
            {"card_name": "Sales Reports","label": "Product Performance","link_to": "POS Product Performance","link_type": "Report","is_query_report": 1,"type": "Link"},
            {"card_name": "Sales Reports","label": "Hourly Sales","link_to": "POS Hourly Sales","link_type": "Report","is_query_report": 1,"type": "Link"},
            {"card_name": "Sales Reports","label": "Table Wise Sales","link_to": "POS Table Wise Sales","link_type": "Report","is_query_report": 1,"type": "Link"},
            {"card_name": "Operations Reports","label": "X Z Report","link_to": "POS X Z Report","link_type": "Report","is_query_report": 1,"type": "Link"},
            {"card_name": "Operations Reports","label": "Cashier Log","link_to": "POS Cashier Log","link_type": "Report","is_query_report": 1,"type": "Link"},
            {"card_name": "Operations Reports","label": "KOT Performance","link_to": "KOT Performance","link_type": "Report","is_query_report": 1,"type": "Link"},
        ]

        valid_links = []
        for link in possible_links:
            try:
                lt = link["link_type"]
                lto = link["link_to"]
                ok = False
                if lt == "DocType":
                    ok = frappe.db.exists("DocType", lto) is not None
                elif lt == "Report":
                    ok = frappe.db.exists("Report", lto) is not None
                elif lt == "Page":
                    ok = True
                else:
                    ok = True
                if ok:
                    valid_links.append(link)
                else:
                    print(f"SKIP link not found: {lto}")
            except Exception as e:
                print(f"Link check fail {link['link_to']}: {e}")

        # Only ONE workspace - POS Next
        ws = frappe.new_doc("Workspace")
        ws.name = "POS Next"
        ws.label = "POS Next"
        ws.title = "POS Next"
        ws.icon = "package"
        ws.module = "POS Next"
        ws.app = "pos_next"
        ws.public = 1
        ws.is_hidden = 0
        ws.hide_custom = 0
        ws.for_user = ""
        ws.content = json.dumps(content)
        ws.sequence_id = 10
        
        for l in valid_links:
            ws.append("links", l)
        
        # Shortcuts with icons
        shortcuts = [
            {"label": "POS Opening Shift","link_to": "POS Opening Shift","type": "DocType","color": "blue","doc_view": "List","stats_filter": "[]"},
            {"label": "POS Floor","link_to": "POS Floor","type": "DocType","color": "green","doc_view": "List","stats_filter": "[]"},
            {"label": "Kitchen Orders","link_to": "POS KOT","type": "DocType","color": "orange","doc_view": "List","stats_filter": "{\"kot_status\": [\"not in\", [\"Served\", \"Cancelled\"]]}"},
            {"label": "POS Next Settings","link_to": "POS Next Settings","type": "DocType","color": "violet","doc_view": "List","stats_filter": "[]"},
        ]
        for sc in shortcuts:
            if frappe.db.exists("DocType", sc["link_to"]):
                ws.append("shortcuts", sc)
        
        # Roles
        for role in ["System Manager", "Sales Manager", "Sales User"]:
            if frappe.db.exists("Role", role):
                ws.append("roles", {"role": role})
        
        ws.insert(ignore_permissions=True)
        print(f"Created workspace POS Next with {len(valid_links)} links")
        
    except Exception as e:
        print(f"Workspace create failed: {e}")
        import traceback
        traceback.print_exc()

    frappe.db.commit()
    frappe.clear_cache()
    
    all_ws = frappe.get_all("Workspace", filters={"module": "POS Next"}, fields=["name","icon","public","is_hidden","app"])
    print(f"All workspaces: {all_ws}")
    return f"Fixed v5.1 - workspaces {all_ws} - Go to /app/pos_next - Ctrl+Shift+R hard reload"

@frappe.whitelist()
def check_workspace():
    return frappe.get_all("Workspace", filters={"module": "POS Next"}, fields=["name","icon","public","is_hidden","app","module","content"])

@frappe.whitelist()
def force_rebuild_workspace():
    return fix_workspace_now()
