import frappe

def bootinfo(bootinfo):
    try:
        # expose pos_next settings to frontend
        bootinfo["pos_next"] = {
            "receipt_templates": frappe.get_all("POS Receipt Template", fields=["name", "template_name", "paper_size"]),
            "floors": frappe.get_all("POS Floor", fields=["name", "floor_name", "pos_profile"]),
        }
    except Exception:
        bootinfo["pos_next"] = {}
    return bootinfo
