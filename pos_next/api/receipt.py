import frappe
from frappe import _

@frappe.whitelist()
def get_receipt_data(pos_profile=None, invoice=None):
    doc = None
    if invoice:
        try:
            doc = frappe.get_doc("POS Invoice", invoice).as_dict()
        except:
            doc = None
    return {"doc": doc}

@frappe.whitelist()
def render_receipt(invoice, template=None):
    """Return rendered html for given invoice + template"""
    if not frappe.db.exists("POS Invoice", invoice):
        frappe.throw(_("Invoice not found"))

    pos_invoice = frappe.get_doc("POS Invoice", invoice)

    template_name = template
    if not template_name:
        pos_profile = pos_invoice.pos_profile
        template_name = frappe.db.get_value("POS Profile", pos_profile, "custom_receipt_template")

    if not template_name:
        template_name = frappe.db.get_value("POS Receipt Template", {"is_default": 1}, "name")

    if not template_name:
        # fallback minimal
        html = f"<div>Invoice {pos_invoice.name} - Grand Total {pos_invoice.grand_total}</div>"
        return html

    template_doc = frappe.get_doc("POS Receipt Template", template_name)

    context = {
        "doc": pos_invoice,
        "items": pos_invoice.items,
        "payments": pos_invoice.payments,
        "taxes": pos_invoice.taxes,
        "company": frappe.get_doc("Company", pos_invoice.company) if pos_invoice.company else {},
        "settings": frappe.get_single("POS Settings") if frappe.db.exists("DocType", "POS Settings") else {}
    }

    html = frappe.render_template(template_doc.template_html, context)
    css = template_doc.template_css or ""
    full = f"<style>{css}</style>{html}"
    return full
