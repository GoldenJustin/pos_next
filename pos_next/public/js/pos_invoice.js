frappe.ui.form.on('POS Invoice', {
    refresh: function(frm) {
        if (frm.doc.docstatus===1) {
            frm.add_custom_button("Print POS Next Receipt", () => {
                if (window.pos_next && pos_next.receipt) {
                    pos_next.receipt.showSelector(frm.doc.name, frm.doc.pos_profile);
                } else {
                    frappe.call({method:"pos_next.api.receipt.render_receipt", args:{invoice: frm.doc.name}, callback:(r)=>{
                        let w=window.open("","_blank","width=400,height=600");
                        w.document.write(r.message);
                    }});
                }
            }, "POS Next");
        }
        if (frm.doc.custom_table) {
            frm.dashboard.set_headline(`Table: ${frm.doc.custom_table} | Guests: ${frm.doc.custom_guest_count||1} | Type: ${frm.doc.custom_order_type||''}`);
        }
    }
});
