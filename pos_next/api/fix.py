import frappe

@frappe.whitelist()
def fix_workspace_now():
    """Create POS Next workspace if missing and delete orphan checks"""
    # Delete existing broken workspace
    try:
        frappe.db.delete("Workspace", "POS Next")
        frappe.db.commit()
        print("Deleted old workspace POS Next")
    except Exception as e:
        print(f"Delete failed: {e}")

    # Re-sync workspaces from file
    try:
        from frappe.model.sync import sync_for
        sync_for("pos_next", force=True, reset_permissions=True)
        print("Synced workspaces for pos_next")
    except Exception as e:
        print(f"Sync failed: {e}")

    # Ensure module def exists
    try:
        if not frappe.db.exists("Module Def", "POS Next"):
            doc = frappe.new_doc("Module Def")
            doc.module_name = "POS Next"
            doc.app_name = "pos_next"
            doc.custom = 1
            doc.insert(ignore_permissions=True)
            print("Created Module Def POS Next")
    except Exception as e:
        print(f"Module Def failed: {e}")

    frappe.db.commit()
    return "POS Next workspace fixed - now go to /app/pos-next"

@frappe.whitelist()
def check_workspace():
    ws = frappe.get_all("Workspace", filters={"name":"POS Next"}, fields=["name","icon","public","module"])
    return ws
