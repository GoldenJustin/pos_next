app_name = "pos_next"
app_title = "POS Next"
app_publisher = "POS Next Team"
app_description = "Modern, fast and complete POS for retail, wholesale, supermarket, pharmacy and restaurants - with table management, KDS, customer display, offline sync, advanced receipts and powerful reports."
app_email = "support@posnext.local"
app_license = "mit"
app_version = "4.1.0"
app_icon = "octicon octicon-package"
app_color = "blue"

required_apps = ["erpnext"]
fixtures = []

website_route_rules = [
    {"from_route": "/kds", "to_route": "kds"},
    {"from_route": "/customer-display", "to_route": "customer-display"},
]

app_include_css = "/assets/pos_next/css/pos_next.bundle.css"

page_js = {
    "point-of-sale": "public/js/pos_next.bundle.js"
}

doctype_js = {
    "POS Profile": "public/js/pos_profile.js",
    "POS Invoice": "public/js/pos_invoice.js"
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

after_install = "pos_next.seed.setup_after_install"
after_migrate = "pos_next.seed.setup_after_install"

scheduler_events = {
    "cron": {
        "0/5 * * * *": [
            "pos_next.api.kds.auto_close_old_kots"
        ]
    }
}

jenv = {
    "methods": [
        "pos_next.api.receipt.get_receipt_data"
    ]
}

extend_bootinfo = "pos_next.api.boot.bootinfo"
