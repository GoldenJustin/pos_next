import frappe

def get_context(context):
    context.no_cache = 1
    context.show_sidebar = False
    # pos_profile from query
    pos_profile = frappe.form_dict.get("pos_profile")
    context.pos_profile = pos_profile
    context.title = f"KDS - {pos_profile or 'Kitchen Display'}"
    return context
