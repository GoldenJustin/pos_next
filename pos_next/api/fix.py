import frappe
import json

def create_one_workspace(name, label, title, icon="shopping-cart", module="POS Next"):
    """Create a single workspace with minimal content, skip if exists"""
    try:
        if frappe.db.exists("Workspace", name):
            # Update to ensure public and icon
            try:
                frappe.db.set_value("Workspace", name, "icon", icon)
                frappe.db.set_value("Workspace", name, "public", 1)
                frappe.db.set_value("Workspace", name, "is_hidden", 0)
                frappe.db.set_value("Workspace", name, "module", module)
                frappe.db.commit()
            except:
                pass
            return name
        
        content = [
            {"id":"header1","type":"header","data":{"text":"POS Operations","col":12}},
            {"id":"para1","type":"paragraph","data":{"text":"Welcome to POS Next - Modern Retail & Restaurant POS. Use search (Ctrl+K) for POS Invoice, POS Profile, KDS at /kds, Customer Display at /customer-display","col":12}},
        ]
        
        ws = frappe.new_doc("Workspace")
        ws.name = name
        ws.label = label
        ws.title = title
        ws.icon = icon
        ws.module = module
        ws.public = 1
        ws.is_hidden = 0
        ws.hide_custom = 0
        ws.for_user = ""
        ws.content = json.dumps(content)
        ws.sequence_id = 10
        ws.append("roles", {"role": "System Manager"})
        # Add all roles to ensure visibility
        for role in ["Sales Manager", "Sales User", "Accounts Manager", "Administrator"]:
            if frappe.db.exists("Role", role):
                try:
                    ws.append("roles", {"role": role})
                except:
                    pass
        
        ws.insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"Created workspace: {name}")
        return name
    except Exception as e:
        print(f"Failed to create workspace {name}: {e}")
        import traceback
        traceback.print_exc()
        return None

@frappe.whitelist()
def fix_workspace_now():
    print("=== POS Next Workspace Fix v4.5 ===")
    
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

    # Ensure Desktop Icons for all apps to prevent NoneType
    try:
        for app in frappe.get_installed_apps():
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
                    # Use scrubbed name for link - try both underscore and hyphen, use underscore as primary
                    link_slug = frappe.scrub(app_title).replace("-", "_")
                    icon_doc.link = f"/app/{link_slug}"
                    icon_doc.standard = 1
                    icon_doc.hidden = 0
                    icon_doc.insert(ignore_permissions=True)
                    print(f"Created Desktop Icon for {app_title}")
                else:
                    # Ensure valid
                    try:
                        frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "icon", "octicon octicon-package")
                        frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "hidden", 0)
                        # Ensure link exists and starts with /app
                        link_val = frappe.db.get_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "link")
                        if not link_val or not str(link_val).startswith("/app"):
                            link_slug = frappe.scrub(app_title).replace("-", "_")
                            frappe.db.set_value("Desktop Icon", {"label": app_title, "icon_type": "App"}, "link", f"/app/{link_slug}")
                    except:
                        pass
            except Exception as e:
                print(f"App icon for {app} failed: {e}")
    except Exception as e:
        print(f"Ensure all icons failed: {e}")

    # Delete old broken workspaces
    for ws_name in ["POS Next", "pos-next", "pos_next", "pos_next - Modern", "POSNext"]:
        try:
            if frappe.db.exists("Workspace", ws_name):
                frappe.db.delete("Workspace", ws_name)
                print(f"Deleted old workspace: {ws_name}")
        except:
            pass
    frappe.db.commit()

    # Try sync first (may create from file)
    try:
        from frappe.model.sync import sync_for
        sync_for("pos_next", force=True, reset_permissions=True)
        print("sync_for executed")
    except Exception as e:
        print(f"sync_for failed: {e}")

    # Create workspaces for ALL possible slugs to guarantee route works
    created = []
    # Primary
    created.append(create_one_workspace("POS Next", "POS Next", "POS Next", "shopping-cart", "POS Next"))
    # Hyphen variant
    created.append(create_one_workspace("pos-next", "pos-next", "pos-next", "shopping-cart", "POS Next"))
    # Underscore variant
    created.append(create_one_workspace("pos_next", "pos_next", "pos_next", "shopping-cart", "POS Next"))
    
    frappe.db.commit()
    frappe.clear_cache()
    
    # List all workspaces
    all_ws = frappe.get_all("Workspace", filters={"module": "POS Next"}, fields=["name","icon","public","is_hidden"])
    print(f"All POS Next workspaces: {all_ws}")
    
    # Create a simple Page to test
    print("Try accessing via /app/pos_next and /app/pos-next after clear-cache")
    
    return f"Fixed workspaces: {created} - All: {all_ws} - Try /app/pos_next and /app/pos-next and /app/POS%20Next with Ctrl+Shift+R"

@frappe.whitelist()
def check_workspace():
    ws = frappe.get_all("Workspace", filters={"module": "POS Next"}, fields=["name","icon","public","module","is_hidden"])
    return ws

@frappe.whitelist()
def force_rebuild_workspace():
    return fix_workspace_now()
