frappe.ui.form.on('POS Profile', {
    refresh: function(frm) {
        if (frm.doc.custom_enable_pos_next) {
            frm.dashboard.add_comment("POS Next Super POS Enabled - Odoo-like features active", "blue", true);
        }
        frm.add_custom_button("Open KDS", () => {
            window.open(`/kds?pos_profile=${frm.doc.name}`, "_blank");
        }, "POS Next");
        frm.add_custom_button("Customer Display", () => {
            window.open(`/customer-display?pos_profile=${frm.doc.name}`, "_blank");
        }, "POS Next");
        frm.add_custom_button("Seed Demo Data (Floor/Tables)", () => {
            frappe.call({method:"pos_next.seed.seed_demo_for_profile", args:{pos_profile: frm.doc.name}, freeze:true, callback:(r)=>{frappe.msgprint("Demo floor & tables created");}});
        }, "POS Next");
    }
});
