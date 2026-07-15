from frappe import _

def get_data():
    return [
        {
            "module_name": "POS Next",
            "label": _("POS Next"),
            "icon": "octicon octicon-package",
            "color": "blue",
            "type": "module",
            "link": "pos-next",
            "_doctype": "Workspace",
            "idx": 1,
        }
    ]
