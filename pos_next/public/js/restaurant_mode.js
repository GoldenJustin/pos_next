/* POS Next Restaurant Mode - Floors, Tables, KOT, Merge, Transfer */

frappe.provide("pos_next.restaurant");

pos_next.restaurant.selected_table = null;
pos_next.restaurant.floors = [];
pos_next.restaurant.tables = [];
pos_next.restaurant.current_floor = null;

pos_next.restaurant.loadTables = function(pos_profile, callback) {
    frappe.call({
        method: "pos_next.api.pos.get_tables",
        args: { pos_profile: pos_profile },
        callback: (r) => {
            if (r.message) {
                pos_next.restaurant.floors = r.message.floors;
                pos_next.restaurant.tables = r.message.tables;
                if (!pos_next.restaurant.current_floor && r.message.floors.length) {
                    pos_next.restaurant.current_floor = r.message.floors[0].name;
                }
                if (callback) callback(r.message);
            }
        }
    });
};

pos_next.restaurant.renderFloorPlan = function(wrapper, pos_profile, pos) {
    // wrapper = jQuery or HTMLElement
    pos_next.restaurant.loadTables(pos_profile, (data) => {
        const $wrapper = $(wrapper);
        $wrapper.empty();
        $wrapper.addClass("pos-table-map-wrapper");

        // Sidebar floors
        let floor_html = `<div class="pos-floor-sidebar"><h6 style="font-weight:800;margin-bottom:10px;">Floors</h6>`;
        data.floors.forEach(f => {
            const count = data.tables.filter(t => t.floor === f.name).length;
            floor_html += `<div class="pos-floor-item ${f.name===pos_next.restaurant.current_floor?'active':''}" data-floor="${f.name}" style="border-left:4px solid ${f.floor_color||'#5A67D8'}">
                <span>${frappe.utils.escape_html(f.floor_name)}</span><span class="badge" style="background:#EDF2F7;">${count}</span>
            </div>`;
        });
        floor_html += `<div style="margin-top:16px;">
            <button class="pos-next-btn secondary" style="width:100%;" onclick="pos_next.restaurant.openKDS('${pos_profile}')">🍳 Open KDS</button>
            <button class="pos-next-btn secondary" style="width:100%;margin-top:6px;" onclick="pos_next.customer_display.openDisplayWindow('${pos_profile}')">🖥️ Customer Display</button>
        </div></div>`;

        // Canvas tables filtered by current floor
        let tables = data.tables.filter(t => t.floor === pos_next.restaurant.current_floor);
        let canvas_html = `<div class="pos-table-canvas">`;
        if (!tables.length) {
            canvas_html += `<div style="padding:30px;color:#999;text-align:center;width:100%;">No tables in this floor. Create via POS Table doctype.</div>`;
        } else {
            tables.forEach(t => {
                const status = (t.status || "Available").toLowerCase();
                const shapeClass = t.shape === "Round" ? "round" : "";
                const total = t.invoice_data ? frappe.format(t.invoice_data.grand_total, {fieldtype:"Currency"}) : "";
                canvas_html += `
                <div class="pos-table-card ${status} ${shapeClass}" data-table="${t.name}" style="${t.color?`border-color:${t.color}`:''}" title="${t.table_name} - ${t.status}">
                    <div style="font-size:15px;">${frappe.utils.escape_html(t.table_name)}</div>
                    <div class="table-seats">${t.seats} seats</div>
                    ${total?`<div class="table-total">${total}</div>`:''}
                    ${t.status==="Occupied"?`<div style="font-size:10px;margin-top:4px;background:#FEB2B2;color:#742A2A;padding:2px 6px;border-radius:10px;">Occupied</div>`:''}
                </div>`;
            });
        }
        canvas_html += `</div>`;

        $wrapper.html(floor_html + canvas_html);

        // Bind floor click
        $wrapper.find(".pos-floor-item").on("click", function(){
            pos_next.restaurant.current_floor = $(this).data("floor");
            pos_next.restaurant.renderFloorPlan(wrapper, pos_profile, pos);
        });

        // Bind table click
        $wrapper.find(".pos-table-card").on("click", function(){
            const table_name = $(this).data("table");
            const table_obj = pos_next.restaurant.tables.find(t=>t.name===table_name);
            pos_next.restaurant.handleTableClick(table_obj, pos_profile, pos);
        });
    });
};

pos_next.restaurant.handleTableClick = function(table, pos_profile, pos_controller) {
    // table object
    if (!table) return;
    const status = table.status;
    if (status === "Available") {
        // Create new invoice for this table
        pos_next.restaurant.selected_table = table.name;
        // If POS controller exists, set custom fields and start new invoice
        if (pos_controller && pos_controller.frm) {
            pos_controller.frm.doc.custom_table = table.name;
            pos_controller.frm.doc.custom_guest_count = 2;
            pos_controller.frm.doc.custom_order_type = "Dine In";
            // Trigger new cart? POS handles via creating new invoice in memory
            // Update table status to Occupied via api
            frappe.call({
                method: "pos_next.api.pos.update_table_status",
                args: { table: table.name, status: "Occupied" },
                callback: () => {
                    frappe.show_alert({message: `Table ${table.table_name} selected`, indicator:"green"});
                    // maybe switch back to POS view
                    if (pos_next.restaurant.onTableSelected) pos_next.restaurant.onTableSelected(table);
                }
            });
        } else {
            // Just set global for later
            frappe.show_alert({message: `Table ${table.table_name} selected - Start order`, indicator:"green"});
            if (pos_next.restaurant.onTableSelected) pos_next.restaurant.onTableSelected(table);
        }
    } else if (status === "Occupied") {
        // Show options: View Bill, Transfer, Merge, Print KOT, Close
        const d = new frappe.ui.Dialog({
            title: `Table ${table.table_name} - Occupied`,
            size: "small",
            fields: [
                {fieldtype:"HTML", fieldname:"info_html", options:`<div style="padding:10px;background:#FFF5F5;border-radius:8px;margin-bottom:10px;">Invoice: ${table.current_invoice||''}<br>Total: ${table.invoice_data?table.invoice_data.grand_total:''}</div>`},
            ],
            primary_action_label: "View / Continue Order",
            secondary_action_label: "Transfer Table"
        });
        d.set_primary_action(() => {
            // Load that invoice into POS
            if (pos_controller && table.current_invoice) {
                // ERPNext POS way: we can recall invoice by setting cart
                pos_controller.load_invoice && pos_controller.load_invoice(table.current_invoice);
                pos_next.restaurant.selected_table = table.name;
            }
            d.hide();
        });
        d.get_secondary_btn().on("click", () => {
            pos_next.restaurant.showTransferDialog(table);
            d.hide();
        });
        // Add extra buttons
        const $footer = d.$wrapper.find(".modal-footer");
        $footer.prepend(`<button class="btn btn-sm btn-warning" id="btn-merge-table">Merge</button> <button class="btn btn-sm btn-danger" id="btn-clear-table">Clear / Cancel</button>`);
        $footer.find("#btn-merge-table").on("click", ()=> { pos_next.restaurant.showMergeDialog(table); d.hide(); });
        $footer.find("#btn-clear-table").on("click", ()=> {
            frappe.confirm(`Clear table ${table.table_name}? This will free table but keep invoice draft.`, ()=>{
                frappe.call({method:"pos_next.api.pos.update_table_status", args:{table: table.name, status:"Available", invoice:""}, callback:()=>{d.hide(); frappe.show_alert({message:"Table cleared", indicator:"orange"});}});
            });
        });

        d.show();
    } else if (status === "Reserved") {
        frappe.confirm(`Table ${table.table_name} is Reserved. Occupy it?`, ()=>{
            frappe.call({method:"pos_next.api.pos.update_table_status", args:{table: table.name, status:"Occupied"}, callback:()=>{
                pos_next.restaurant.selected_table = table.name;
            }});
        });
    }
};

pos_next.restaurant.showTransferDialog = function(source_table) {
    const fields = [
        {label:"From Table", fieldname:"from_table", fieldtype:"Data", default:source_table.table_name, read_only:1},
        {label:"To Table (Available only)", fieldname:"to_table", fieldtype:"Link", options:"POS Table", reqd:1, get_query:()=>{return {filters:{status:"Available", pos_profile: source_table.pos_profile}};}}
    ];
    const d = new frappe.ui.Dialog({
        title:"Transfer Table",
        fields: fields,
        primary_action_label: "Transfer",
        primary_action: (vals)=>{
            // Move current_invoice to new table
            frappe.call({
                method: "pos_next.api.pos.update_table_status",
                args: {table: vals.to_table, status:"Occupied", invoice: source_table.current_invoice},
                callback: ()=>{
                    frappe.call({method:"pos_next.api.pos.update_table_status", args:{table: source_table.name, status:"Available", invoice:""}, callback:()=>{
                        frappe.show_alert({message:`Transferred ${source_table.table_name} → ${vals.to_table}`, indicator:"green"});
                        d.hide();
                    }});
                }
            });
        }
    });
    d.show();
};

pos_next.restaurant.showMergeDialog = function(target_table) {
    // Merge multiple tables into one invoice
    const d = new frappe.ui.Dialog({
        title:`Merge into ${target_table.table_name}`,
        fields:[
            {label:"Select Tables to Merge (Occupied)", fieldname:"tables", fieldtype:"Table MultiSelect", options:"POS Table", reqd:1},
            {label:"Info", fieldname:"info", fieldtype:"HTML", options:"<div class='text-muted'>Merges all invoices items into target table's invoice. Original tables will be cleared.</div>"}
        ],
        primary_action_label:"Merge Now",
        primary_action: (vals)=>{
            frappe.show_alert({message:"Merge logic will combine invoices via split API. Implement in backend.", indicator:"orange"});
            // For demo: just clear selected tables
            d.hide();
        }
    });
    d.show();
};

pos_next.restaurant.openKDS = function(pos_profile) {
    window.open(`/kds?pos_profile=${encodeURIComponent(pos_profile)}`, "_blank");
};

pos_next.restaurant.fireKOT = async function(pos_profile, invoice_data, selected_items=null) {
    // invoice_data: POS Invoice doc or temporary object with items
    // selected_items: subset to fire (only new items)
    const items = selected_items || invoice_data.items || [];
    if (!items.length) {
        frappe.show_alert({message:"No items to fire", indicator:"orange"});
        return;
    }

    const payload = {
        pos_invoice: invoice_data.name || null,
        table: invoice_data.custom_table || pos_next.restaurant.selected_table,
        order_type: invoice_data.custom_order_type || "Dine In",
        guest_count: invoice_data.custom_guest_count || 1,
        customer: invoice_data.customer,
        remarks: (invoice_data.items && invoice_data.items[0] && invoice_data.items[0].custom_kot_notes) || "",
        items: items.map(it=>({
            item_code: it.item_code,
            qty: it.qty,
            kot_notes: it.custom_kot_notes || "",
            uom: it.uom
        })),
        offline_id: `kot_${Date.now()}`
    };

    // Save offline first
    if (pos_next.offline && pos_next.offline.db) {
        await pos_next.offline.save("kots", {...payload, synced:false, kot_status:"Sent to Kitchen"});
        await pos_next.offline.enqueue("create_kot", {pos_profile: pos_profile, data: payload});
    }

    if (navigator.onLine) {
        frappe.call({
            method: "pos_next.api.pos.create_kot",
            args: {pos_profile: pos_profile, data: payload},
            freeze:true,
            freeze_message:"Firing KOT to Kitchen...",
            callback: (r)=>{
                if (r.message) {
                    frappe.show_alert({message:`KOT ${r.message.name} sent to kitchen!`, indicator:"green"});
                    // Optionally mark items as fired
                    // Print KOT directly if needed
                    pos_next.restaurant.printKOT(r.message);
                    // Update offline as synced
                    pos_next.offline.save("kots", {...payload, offline_id: r.message.name, synced:true});
                }
            }
        });
    } else {
        frappe.show_alert({message:"Offline: KOT queued. Will fire when online. Marked in local queue.", indicator:"orange"}, 8);
    }
};

pos_next.restaurant.printKOT = function(kot) {
    // Build print HTML and open print window
    let html = `
        <div style="font-family:monospace;width:280px;padding:10px;">
            <div style="text-align:center;font-weight:900;font-size:16px;border-bottom:2px dashed #000;padding-bottom:6px;">KOT - ${kot.name}</div>
            <div style="font-size:13px;margin-top:6px;">Table: ${frappe.utils.escape_html(kot.table||'Takeaway')} | ${kot.order_type||''} | Guests: ${kot.guest_count||''}</div>
            <div style="font-size:11px;">Time: ${kot.order_time||new Date().toLocaleString()} | Prio: ${kot.priority||'Normal'}</div>
            <hr style="border-top:1px dashed #000;margin:8px 0;">
            <table style="width:100%;font-size:13px;">
                <thead><tr><th align="left">Item</th><th align="right">Qty</th></tr></thead>
                <tbody>
                ${(kot.items||[]).map(it=>`<tr><td>${frappe.utils.escape_html(it.item_name||it.item_code)}<br><small>${frappe.utils.escape_html(it.kot_notes||'')}</small></td><td align="right">${it.qty}</td></tr>`).join("")}
                </tbody>
            </table>
            <hr style="border-top:1px dashed #000;margin:8px 0;">
            <div style="font-size:11px;">Cashier: ${kot.cashier||''}</div>
            <div style="text-align:center;margin-top:8px;font-weight:700;">*** KITCHEN COPY ***</div>
        </div>
    `;
    let w = window.open("", "_blank", "width=320,height=600");
    if (w) {
        w.document.write(`<html><head><title>KOT ${kot.name}</title></head><body>${html}<script>window.print(); setTimeout(()=>window.close(), 500);<\/script></body></html>`);
        w.document.close();
    }
};
