import frappe
import json

@frappe.whitelist()
def fix_workspace_now():
    """Force create POS Next workspace via code - minimal to avoid link validation errors"""
    print("=== POS Next Workspace Fix v4.3 Started ===")
    
    # Ensure Module Def
    try:
        if not frappe.db.exists("Module Def", "POS Next"):
            doc = frappe.new_doc("Module Def")
            doc.module_name = "POS Next"
            doc.app_name = "pos_next"
            doc.custom = 1
            doc.insert(ignore_permissions=True)
            print("Created Module Def")
    except Exception as e:
        print(f"Module Def error: {e}")

    # Ensure Desktop Icon App type to prevent NoneType startswith
    try:
        app_title = "POS Next"
        if not frappe.db.exists("Desktop Icon", {"label": app_title, "icon_type": "App"}):
            icon_doc = frappe.new_doc("Desktop Icon")
            icon_doc.label = app_title
            icon_doc.icon_type = "App"
            icon_doc.app = "pos_next"
            icon_doc.icon = "octicon octicon-package"
            icon_doc.color = "blue"
            icon_doc.link = "/app/pos-next"
            icon_doc.standard = 1
            icon_doc.hidden = 0
            icon_doc.insert(ignore_permissions=True)
            print(f"Created Desktop Icon {app_title}")
        else:
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "link", "/app/pos-next")
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "icon", "octicon octicon-package")
            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "hidden", 0)
            print("Updated Desktop Icon")
    except Exception as e:
        print(f"Desktop Icon error: {e}")
        import traceback
        traceback.print_exc()

    # Delete broken workspace
    try:
        if frappe.db.exists("Workspace", "POS Next"):
            frappe.db.delete("Workspace", "POS Next")
            frappe.db.commit()
            print("Deleted old workspace")
    except Exception as e:
        print(f"Delete failed: {e}")

    # Try sync from file
    try:
        from frappe.model.sync import sync_for
        sync_for("pos_next", force=True, reset_permissions=True)
        print("sync_for executed")
    except Exception as e:
        print(f"sync_for failed: {e}")

    # Create minimal workspace via code if still missing
    try:
        if not frappe.db.exists("Workspace", "POS Next"):
            print("Creating minimal workspace via code...")
            # Minimal content - no links to avoid validation errors
            content = [
                {"id":"header1","type":"header","data":{"text":"POS Operations","col":12}},
                {"id":"para1","type":"paragraph","data":{"text":"Welcome to POS Next - Modern Retail & Restaurant POS. Use sidebar or search to access POS features.","col":12}},
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
            ws.content = json.dumps(content)
            ws.sequence_id = 10
            # No links, no shortcuts, no roles filtering to avoid validation
            # Add basic role
            ws.append("roles", {"role": "System Manager"})
            ws.insert(ignore_permissions=True)
            print(f"Created minimal workspace: {ws.name}")
        else:
            print("Workspace exists after sync")
            frappe.db.set_value("Workspace", "POS Next", "icon", "shopping-cart")
            frappe.db.set_value("Workspace", "POS Next", "public", 1)
            frappe.db.set_value("Workspace", "POS Next", "is_hidden", 0)
            frappe.db.set_value("Workspace", "POS Next", "module", "POS Next")
    except Exception as e:
        print(f"Minimal workspace creation failed: {e}")
        import traceback
        traceback.print_exc()
        # Last resort - raw SQL insert minimal
        try:
            frappe.db.sql("""
                INSERT INTO `tabWorkspace` (name, label, title, icon, module, public, is_hidden, hide_custom, for_user, content, owner, creation, modified, docstatus)
                VALUES ('POS Next', 'POS Next', 'POS Next', 'shopping-cart', 'POS Next', 1, 0, 0, '', '[]', 'Administrator', NOW(), NOW(), 0)
                ON DUPLICATE KEY UPDATE icon='shopping-cart', public=1, is_hidden=0, module='POS Next'
            """)
            frappe.db.commit()
            print("Created workspace via raw SQL")
        except Exception as e2:
            print(f"Raw SQL also failed: {e2}")

    frappe.db.commit()
    frappe.clear_cache()
    exists = frappe.db.exists("Workspace", "POS Next")
    print(f"Final exists: {exists}")
    if exists:
        try:
            ws = frappe.get_doc("Workspace", "POS Next")
            print(f"WS: {ws.name} icon={ws.icon} public={ws.public}")
        except Exception as e:
            print(f"Read ws failed: {e}")
    return f"POS Next workspace fixed - exists: {exists} - Go to /app/pos-next and Ctrl+Shift+R"

@frappe.whitelist()
def check_workspace():
    ws = frappe.get_all("Workspace", filters={"name":"POS Next"}, fields=["name","icon","public","module","is_hidden"])
    return ws

@frappe.whitelist()
def force_rebuild_workspace():
    return fix_workspace_now()
