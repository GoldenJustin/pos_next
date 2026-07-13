app_name = "pos_next"
app_title = "POS Next - Odoo Like Super POS"
app_publisher = "POS Next Team"
app_description = "Super POS for ERPNext 15+ with Restaurant, KDS, KOT, Customer Display, Supermarket Split, Cash In/Out, Offline, Premium Receipts - Odoo taste"
app_email = "support@posnext.local"
app_license = "mit"
app_version = "2.0.0"

required_apps = ["erpnext"]

# Fixtures: export custom fields + receipt templates + role profiles maybe
fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [["module", "=", "POS Next"]]
    },
    {
        "doctype": "POS Receipt Template",
    },
    {"doctype": "Role", "filters": [["role_name", "in", ["Kitchen User", "POS Cashier Manager"]]]},
]

# Website routes
website_route_rules = [
    {"from_route": "/kds", "to_route": "kds"},
    {"from_route": "/customer-display", "to_route": "customer-display"},
]

# Includes
app_include_css = "/assets/pos_next/css/pos_next.bundle.css"
# We inject JS only on POS page via page_js to avoid overhead elsewhere
# app_include_js = "/assets/pos_next/js/pos_next.bundle.js"

page_js = {
    "point-of-sale": "public/js/pos_next.bundle.js"
}

# Desk
doctype_js = {
    "POS Profile": "public/js/pos_profile.js",
    "POS Invoice": "public/js/pos_invoice.js"
}

# Override for offline sync control
override_whitelisted_methods = {
    # we keep original but add ours
}

doc_events = {
    "POS Invoice": {
        "on_submit": "pos_next.api.pos.on_pos_invoice_submit",
        "before_submit": "pos_next.api.pos.before_pos_invoice_submit",
        "on_update": "pos_next.api.pos.on_pos_invoice_update"
    },
    "POS Opening Shift": {
        "after_insert": "pos_next.api.pos.after_opening_shift_insert"
    }
}

# After install
after_install = "pos_next.seed.setup_after_install"
after_migrate = "pos_next.seed.setup_after_install"

# Scheduler
scheduler_events = {
    "cron": {
        "0/5 * * * *": [
            "pos_next.api.kds.auto_close_old_kots"
        ]
    }
}

# Jinja for receipt
jenv = {
    "methods": [
        "pos_next.api.receipt.get_receipt_data"
    ]
}

# Boot info - inject config
extend_bootinfo = "pos_next.api.boot.bootinfo"
