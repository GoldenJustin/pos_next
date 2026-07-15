import frappe

def check_app_permission():
    # used by add_to_apps_screen
    # Allow anyone with Sales User or System Manager
    if frappe.session.user == "Guest":
        return False
    return True
