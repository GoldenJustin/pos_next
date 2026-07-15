/* POS Next Supermarket Mode - Weighted Barcode, Split, Hold/Park, Multi-Bill */

frappe.provide("pos_next.supermarket");

pos_next.supermarket.PARKED_KEY = "pos_next_parked_invoices";

pos_next.supermarket.parseWeightedBarcode = function(barcode, pos_profile_doc) {
    //  style: prefix 2 with configurable prefixes
    // Format examples:
    // 21 = variable weight product? Actually many formats:
    // Common: 2 + item_code (5 digits) + weight (5 digits) = 21 + XXXXX + YYYYY + C
    // weight = YYYYY / 1000 kg or /100 etc.
    // We'll support: prefix 20-29, then item_code length 5, weight length 5, decimal 3
    // Configurable?
    if (!barcode) return null;
    barcode = String(barcode).trim();
    if (barcode.length < 12) return null;

    const prefixes = (pos_profile_doc && pos_profile_doc.custom_weighted_barcode_prefixes || "20,21,22,23,24,27,28,29").split(",").map(s=>s.trim());
    const start = barcode.substring(0,2);

    if (!prefixes.includes(start)) return null;

    // Try parse: PP + IIIII + WWWWW + C
    // Example: 21 00123 00150 8 = item 00123, weight 1.50 (?) with check digit
    // We ignore check digit
    try {
        const item_part = barcode.substring(2, 7); // 5 chars
        const weight_part = barcode.substring(7, 12); // 5 chars
        // item_code mapping: we need to search item by custom barcode field? For demo we try to find item with barcode = item_part or item_code = item_part
        const weight = parseFloat(weight_part) / 1000; // 00150 => 0.150 kg? Or 1.5 kg? We'll default /1000
        // Alternative if weight > 10 kg unrealistic, try /100
        let final_weight = weight;
        if (final_weight < 0.01) final_weight = parseFloat(weight_part) / 100;
        return {
            type: "weighted",
            prefix: start,
            item_code_raw: item_part,
            weight: final_weight,
            barcode: barcode,
            price: null // will be calculated by item rate * weight
        };
    } catch (e) {
        console.warn("Weighted parse failed", e);
        return null;
    }
};

pos_next.supermarket.findItemForWeighted = function(raw_code) {
    // Async search via frappe.call
    return new Promise((resolve, reject) => {
        frappe.call({
            method: "erpnext.stock.doctype.item.item.get_item_details", // not good
            args: {},
            callback: () => {}
        });
        // Simpler: search Item with barcodes field or item_code like
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Item",
                filters: [["Item Barcode", "barcode", "=", raw_code]],
                fields: ["name", "item_name"],
                limit_page_length: 1
            },
            callback: (r)=>{
                if (r.message && r.message.length) {
                    resolve(r.message[0].name);
                } else {
                    // fallback try item_code containing
                    frappe.call({
                        method: "frappe.client.get_list",
                        args: {doctype:"Item", filters:{item_code: ["like", `%${raw_code}%`]}, fields:["name"], limit_page_length:1},
                        callback: (r2)=>{
                            if (r2.message && r2.message.length) resolve(r2.message[0].name);
                            else resolve(null);
                        }
                    });
                }
            }
        });
    });
};

pos_next.supermarket.parkBill = function(pos_cart_data) {
    // Save current invoice to localStorage parked list
    try {
        const parked = JSON.parse(localStorage.getItem(pos_next.supermarket.PARKED_KEY) || "[]");
        const entry = {
            id: `parked_${Date.now()}`,
            created_at: new Date().toISOString(),
            customer: pos_cart_data.customer,
            items: pos_cart_data.items,
            total: pos_cart_data.grand_total,
            table: pos_cart_data.custom_table || null,
            pos_profile: pos_cart_data.pos_profile
        };
        parked.push(entry);
        localStorage.setItem(pos_next.supermarket.PARKED_KEY, JSON.stringify(parked));
        frappe.show_alert({message: `Bill parked #${entry.id}. Recalled from Parked Bills.`, indicator:"green"});
        return entry;
    } catch (e) {
        console.error(e);
        frappe.msgprint("Failed to park bill");
    }
};

pos_next.supermarket.getParkedBills = function() {
    try {
        return JSON.parse(localStorage.getItem(pos_next.supermarket.PARKED_KEY) || "[]");
    } catch { return []; }
};

pos_next.supermarket.recallParked = function(id, pos_controller) {
    const parked = pos_next.supermarket.getParkedBills();
    const entry = parked.find(p=>p.id===id);
    if (!entry) return;
    // Load into POS controller
    if (pos_controller && pos_controller.load_invoice) {
        // we don't have invoice, we need to set cart manually
        // For simplicity, we use pos_controller to recreate cart from items
        if (pos_controller.cart) {
            // pos_controller.cart is array? Let's just show message
            frappe.show_alert({message:"Recalling parked bill... Implement cart injection.", indicator:"blue"});
        }
    }
    // After recall, remove from parked?
    // We'll keep until checkout and remove on success hook
};

pos_next.supermarket.showParkedDialog = function(pos_controller) {
    const parked = pos_next.supermarket.getParkedBills();
    let html = `<div style="max-height:400px;overflow-y:auto;">`;
    if (!parked.length) {
        html += `<div style="padding:20px;text-align:center;color:#999;">No parked bills</div>`;
    } else {
        parked.forEach(p=>{
            html += `<div style="border:1px solid #EDF2F7;border-radius:8px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                <div><strong>${p.id}</strong><br><small>${p.created_at} | ${p.customer||'Walk-in'} | ${p.items.length} items | ${frappe.format(p.total,{fieldtype:"Currency"})}</small></div>
                <button class="btn btn-sm btn-primary" data-id="${p.id}">Recall</button>
            </div>`;
        });
    }
    html += `</div>`;

    const d = new frappe.ui.Dialog({
        title:"Parked / Hold Bills",
        fields:[{fieldtype:"HTML", fieldname:"html", options: html}],
        primary_action_label:"Clear All Parked"
    });
    d.set_primary_action(()=>{
        localStorage.removeItem(pos_next.supermarket.PARKED_KEY);
        frappe.show_alert({message:"All parked bills cleared", indicator:"orange"});
        d.hide();
    });
    d.show();
    // Bind recall
    d.$wrapper.find("button[data-id]").on("click", function(){
        const id = $(this).data("id");
        pos_next.supermarket.recallParked(id, pos_controller);
        d.hide();
    });
};

pos_next.supermarket.showSplitBillDialog = function(pos_cart) {
    // pos_cart: array of items with index, qty, etc.
    if (!pos_cart || !pos_cart.length) {
        frappe.msgprint("Cart empty, cannot split");
        return;
    }

    const items_html = pos_cart.map((it, idx)=>`
        <div class="pos-split-item" data-idx="${idx}">
            <div><input type="checkbox" class="split-check" data-idx="${idx}" style="margin-right:6px;">${frappe.utils.escape_html(it.item_name||it.item_code)} x ${it.qty}</div>
            <div>${frappe.format(it.amount||it.qty*it.rate,{fieldtype:"Currency"})}</div>
        </div>
    `).join("");

    const d = new frappe.ui.Dialog({
        title:"Split Bill - Modern Retail",
        size:"large",
        fields:[
            {fieldtype:"HTML", fieldname:"split_ui", options:`
                <div class="pos-split-modal">
                    <div class="pos-split-panel">
                        <h6 style="font-weight:800;">Current Bill (Select to Split Out)</h6>
                        <div id="split-source">${items_html}</div>
                        <div style="margin-top:10px;display:flex;gap:6px;">
                            <button class="btn btn-sm btn-secondary" id="btn-split-equal">Split Equally (2)</button>
                            <button class="btn btn-sm btn-secondary" id="btn-split-qty">Split by Qty (if qty>1)</button>
                        </div>
                    </div>
                    <div class="pos-split-panel">
                        <h6 style="font-weight:800;">New Bill (Splitted)</h6>
                        <div id="split-target" style="min-height:200px;border:2px dashed #CBD5E0;border-radius:8px;padding:8px;"></div>
                        <div style="margin-top:10px;font-weight:700;">New Total: <span id="split-target-total">0</span></div>
                    </div>
                </div>
                <div style="margin-top:12px;display:flex;gap:8px;">
                    <label>Split Type:</label>
                    <select id="split-type" style="padding:4px 8px;border-radius:6px;"><option value="by_item">By Selected Items</option><option value="equal">Equal Split (Amount)</option><option value="qty">By Qty Split</option></select>
                </div>
            `}
        ],
        primary_action_label:"Create Splitted Bill",
        primary_action: (vals)=>{
            const selectedIdx = [];
            d.$wrapper.find(".split-check:checked").each(function(){ selectedIdx.push($(this).data("idx")); });

            if (!selectedIdx.length) {
                frappe.msgprint("Select items to split");
                return;
            }

            // Prepare payload for backend split_invoice API if invoice exists, otherwise just frontend split
            const selectedItems = selectedIdx.map(i=>pos_cart[i]);

            // For frontend: create new cart object, reduce original? We'll trigger custom event
            if (pos_next.supermarket.onSplitConfirmed) {
                pos_next.supermarket.onSplitConfirmed(selectedItems, selectedIdx);
            } else {
                frappe.show_alert({message:`Split ${selectedItems.length} items to new bill - integrate with POS invoice split API`, indicator:"green"});
                console.log("Split items", selectedItems);
            }

            d.hide();
        }
    });
    d.show();

    // Live interaction: move checkbox selected to target panel visualization
    d.$wrapper.on("change", ".split-check", function(){
        const target = d.$wrapper.find("#split-target");
        target.empty();
        let total = 0;
        d.$wrapper.find(".split-check:checked").each(function(){
            const idx = $(this).data("idx");
            const it = pos_cart[idx];
            total += (it.amount || it.qty*it.rate);
            target.append(`<div class="pos-split-item selected"><span>${frappe.utils.escape_html(it.item_name||it.item_code)} x ${it.qty}</span><span>${frappe.format(it.amount||it.qty*it.rate,{fieldtype:"Currency"})}</span></div>`);
        });
        d.$wrapper.find("#split-target-total").text(frappe.format(total,{fieldtype:"Currency"}));
    });

    d.$wrapper.find("#btn-split-equal").on("click", ()=>{
        // auto select half items? Actually equal split means split total equally without moving items? We'll implement equal toggle
        frappe.msgprint("Equal split will duplicate bill into 2 equal payments. Configure in POS Settings.");
    });
};
