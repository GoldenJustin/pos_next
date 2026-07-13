import frappe

def get_context(context):
    context.no_cache = 1
    context.show_sidebar = False
    pos_profile = frappe.form_dict.get("pos_profile")
    context.pos_profile = pos_profile
    context.title = f"Customer Display - {pos_profile or ''}"
    # Fetch company logo etc.
    if pos_profile:
        try:
            profile = frappe.get_doc("POS Profile", pos_profile)
            context.company = profile.company
            context.company_doc = frappe.get_doc("Company", profile.company) if profile.company else {}
            context.ad_html = profile.get("custom_customer_display_ad") or ""
        except Exception:
            context.company = ""
            context.company_doc = {}
            context.ad_html = ""
    else:
        context.company = ""
        context.company_doc = {}
        context.ad_html = "<h3>Welcome to our Store!</h3><p>Thank you for shopping with us.</p>"
    return context
