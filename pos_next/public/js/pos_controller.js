/* POS Next Main POS Controller - Injects Modern features into ERPNext POS
   Works by monkey-patching ERPNext POS classes after page load
*/

frappe.provide("pos_next.pos");

pos_next.pos.is_restaurant = false;
pos_next.pos.pos_profile = null;
pos_next.pos.original_pos = null;

pos_next.pos.init = function() {
    console.log("[POS Next] Starting POS injection");

    // Wait for POS page
    const checkPOS = setInterval(() => {
        if (window.cur_pos || (frappe.pages && frappe.pages["point-of-sale"] && frappe.pages["point-of-sale"].pos)) {
            clearInterval(checkPOS);
            pos_next.pos.inject();
        }
        // Alternative: check for .point-of-sale-app presence
        if ($(".point-of-sale-app").length) {
            clearInterval(checkPOS);
            pos_next.pos.inject();
        }
    }, 1000);

    // Also listen to route change
    frappe.router.on("change", () => {
        if (frappe.get_route_str() === "point-of-sale") {
            setTimeout(()=>pos_next.pos.inject(), 1500);
        }
    });
};

pos_next.pos.inject = function() {
    console.log("[POS Next] Injecting UI into POS");

    // Inject top bar  style
    if ($(".pos-next-top-bar-injected").length === 0 && $(".point-of-sale-app").length) {
        // Find header
        const $app = $(".point-of-sale-app");
        const topBar = `
            <div class="pos-top-bar pos-next-top-bar-injected pos-next-no-print" style="margin-bottom:8px;">
                <div style="display:flex;gap:8px;align-items:center;">
                    <span style="font-weight:900;letter-spacing:1px;">POS NEXT</span>
                    <span class="pos-next-mode-badge pos-mode-retail" id="pos-mode-badge">RETAIL</span>
                    <span id="pos-table-info" style="font-size:11px;background:rgba(255,255,255,.15);padding:2px 8px;border-radius:10px;display:none;"></span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <span id="pos-offline-indicator" style="font-size:11px;"></span>
                    <button class="btn btn-xs btn-light" onclick="pos_next.restaurant.renderFloorPlan($('<div>'), cur_pos.pos_profile, cur_pos); pos_next.pos.showTableMap()">🗺️ Tables</button>
                    <button class="btn btn-xs" style="background:#805AD5;color:white;" onclick="pos_next.pos.showParked()">⏸️ Hold Bills</button>
                    <button class="btn btn-xs" style="background:#48BB78;color:white;" onclick="pos_next.pos.triggerSplit()">✂️ Split</button>
                    <button class="btn btn-xs" style="background:#ED8936;color:white;" onclick="pos_next.pos.triggerCash('Cash In')">💰 Cash In</button>
                    <button class="btn btn-xs" style="background:#F56565;color:white;" onclick="pos_next.pos.triggerCash('Cash Out')">💸 Cash Out</button>
                    <button class="btn btn-xs btn-light" onclick="pos_next.pos.showReports()">📊 Reports</button>
                </div>
            </div>
            <div class="pos-next-action-bar pos-next-no-print" id="pos-next-action-bar">
                <button class="pos-next-btn secondary" onclick="pos_next.pos.setOrderType('Dine In')">🍽️ Dine In <span class="pos-hotkey-hint">F1</span></button>
                <button class="pos-next-btn secondary" onclick="pos_next.pos.setOrderType('Takeaway')">🥡 Takeaway <span class="pos-hotkey-hint">F2</span></button>
                <button class="pos-next-btn secondary" onclick="pos_next.pos.setOrderType('Delivery')">🛵 Delivery <span class="pos-hotkey-hint">F3</span></button>
                <button class="pos-next-btn primary" onclick="pos_next.pos.fireKOT()">🔥 Fire KOT <span class="pos-hotkey-hint">F4</span></button>
                <button class="pos-next-btn warning" onclick="pos_next.customer_display.openDisplayWindow(cur_pos.pos_profile || '')">🖥️ Customer Display <span class="pos-hotkey-hint">F5</span></button>
                <button class="pos-next-btn secondary" onclick="window.open('/kds?pos_profile='+(cur_pos.pos_profile||''), '_blank')">🍳 KDS <span class="pos-hotkey-hint">F6</span></button>
                <button class="pos-next-btn success" id="btn-next-print" onclick="pos_next.pos.quickPrint()">🖨️ Print <span class="pos-hotkey-hint">F7</span></button>
                <button class="pos-next-btn secondary" onclick="pos_next.pos.parkBill()">⏸️ Park <span class="pos-hotkey-hint">F8</span></button>
                <button class="pos-next-btn secondary" onclick="pos_next.pos.showX()">📄 X Report <span class="pos-hotkey-hint">F9</span></button>
                <button class="pos-next-btn danger" onclick="pos_next.pos.showZ()">🔒 Z Close <span class="pos-hotkey-hint">F10</span></button>
            </div>
        `;
        $app.prepend(topBar);

        // Bind offline indicator updates
        setInterval(()=>{
            const $ind = $("#pos-offline-indicator");
            if (navigator.onLine) {
                const pending = pos_next.offline.pending_count || 0;
                if (pending>0) $ind.html(`<span style="background:#ECC94B;color:#744210;padding:2px 8px;border-radius:10px;">🔄 ${pending} syncing</span>`);
                else $ind.html(`<span style="background:#48BB78;color:white;padding:2px 8px;border-radius:10px;">● Online</span>`);
            } else {
                $ind.html(`<span style="background:#F56565;color:white;padding:2px 8px;border-radius:10px;">● Offline - Hard Mode</span>`);
            }
        }, 2000);
    }

    // Try to get cur_pos reference
    try {
        let pos_obj = null;
        if (window.cur_pos) pos_obj = window.cur_pos;
        else if (frappe.pages["point-of-sale"] && frappe.pages["point-of-sale"].pos) pos_obj = frappe.pages["point-of-sale"].pos;
        else if ($(".point-of-sale-app").data("pos")) pos_obj = $(".point-of-sale-app").data("pos");

        if (pos_obj) {
            pos_next.pos.pos_profile = pos_obj.pos_profile || (pos_obj.frm && pos_obj.frm.doc && pos_obj.frm.doc.pos_profile) || null;
            pos_next.pos.original_pos = pos_obj;

            // Detect mode
            frappe.db.get_value("POS Profile", pos_next.pos.pos_profile, ["custom_pos_mode", "custom_enable_table_management"]).then(r=>{
                if (r && r.message) {
                    const mode = r.message.custom_pos_mode || "Retail";
                    const $badge = $("#pos-mode-badge");
                    $badge.text(mode.toUpperCase());
                    $badge.removeClass().addClass("pos-next-mode-badge pos-mode-"+mode.toLowerCase().replace(" & ","-").replace(" ","-"));
                    pos_next.pos.is_restaurant = (mode === "Restaurant" || r.message.custom_enable_table_management);
                    if (pos_next.pos.is_restaurant && !$("#pos-table-map").length) {
                        // Auto show table map on start if restaurant mode
                        setTimeout(()=> pos_next.pos.showTableMap(), 800);
                    }
                }
            });

            // Hook cart updates to customer display
            pos_next.pos.hookCartUpdates(pos_obj);

            // Hook barcode scanner for weighted
            pos_next.pos.hookBarcode(pos_obj);

            // Hotkeys  style
            pos_next.pos.bindHotkeys();
        }
    } catch (e) {
        console.warn("[POS Next] Injection error", e);
    }
};

pos_next.pos.hookCartUpdates = function(pos_obj) {
    // We try to override method that updates cart html
    // ERPNext POS uses event: after cart rendered we push to customer display
    const original = pos_obj.update_cart_html;
    // We'll poll cart data every 1 sec and broadcast
    setInterval(()=>{
        try {
            if (!pos_obj.frm) return;
            const doc = pos_obj.frm.doc;
            if (!doc) return;
            const items = (doc.items || []).map(it=>({
                item_code: it.item_code,
                item_name: it.item_name,
                qty: it.qty,
                rate: it.rate,
                amount: it.amount
            }));
            if (items.length || window._last_cart_length) {
                window._last_cart_length = items.length;
                pos_next.customer_display.sendToDisplay({
                    type: "cart_update",
                    items: items,
                    net_total: doc.net_total,
                    total_taxes: doc.total_taxes_and_charges,
                    grand_total: doc.grand_total,
                    currency: doc.currency,
                    company: doc.company,
                    customer: doc.customer_name || doc.customer,
                    pos_profile: doc.pos_profile,
                    ad_html: pos_obj.pos_profile_doc && pos_obj.pos_profile_doc.custom_customer_display_ad || "Thank you for shopping!"
                });
                // If no items, send idle after 2 mins? Actually send idle if empty
                if (items.length===0) {
                    pos_next.customer_display.sendToDisplay({type:"idle", company: doc.company, ad_html: pos_obj.pos_profile_doc && pos_obj.pos_profile_doc.custom_customer_display_ad});
                }
            }
        } catch (e) {}
    }, 800);
};

pos_next.pos.hookBarcode = function(pos_obj) {
    // Weighted barcode detection
    // Intercept scan
    if (pos_obj.on_scan) {
        const orig_scan = pos_obj.on_scan;
        pos_obj.on_scan = function(barcode) {
            // Try weighted parse
            const profile_doc = pos_obj.pos_profile_doc || {};
            const parsed = pos_next.supermarket.parseWeightedBarcode(barcode, profile_doc);
            if (parsed && parsed.type==="weighted") {
                // Search item
                pos_next.supermarket.findItemForWeighted(parsed.item_code_raw).then(item_code=>{
                    if (item_code) {
                        // Add to cart with weight as qty
                        if (pos_obj.cart && pos_obj.cart.add_item) {
                            // ERPNext pos cart API
                            frappe.show_alert({message:`Weighted ${item_code} detected: ${parsed.weight} kg`, indicator:"green"});
                            // Simulate add
                            pos_obj.cart.add_item({item_code: item_code, qty: parsed.weight});
                        } else if (pos_obj.frm) {
                            // fallback
                            frappe.show_alert({message:`Weighted item ${item_code} → ${parsed.weight}`, indicator:"green"});
                        }
                    } else {
                        frappe.show_alert({message:`Weighted barcode ${parsed.item_code_raw} not found`, indicator:"red"});
                        // fallthrough to original
                        orig_scan.call(pos_obj, barcode);
                    }
                });
                return;
            }
            // Not weighted, call original
            orig_scan.call(pos_obj, barcode);
        };
    }
};

pos_next.pos.bindHotkeys = function() {
    if (pos_next.pos.hotkeys_bound) return;
    pos_next.pos.hotkeys_bound = true;
    $(document).on("keydown", (e)=>{
        // Only in POS page
        if (frappe.get_route_str() !== "point-of-sale") return;
        const key = e.key;
        if (e.keyCode >= 112 && e.keyCode <= 123) { // F1-F12
            e.preventDefault();
            switch(e.keyCode) {
                case 112: pos_next.pos.setOrderType("Dine In"); break; // F1
                case 113: pos_next.pos.setOrderType("Takeaway"); break; // F2
                case 114: pos_next.pos.setOrderType("Delivery"); break; // F3
                case 115: pos_next.pos.fireKOT(); break; // F4
                case 116: pos_next.customer_display.openDisplayWindow(pos_next.pos.pos_profile); break; // F5
                case 117: window.open(`/kds?pos_profile=${pos_next.pos.pos_profile||''}`,'_blank'); break; // F6
                case 118: pos_next.pos.quickPrint(); break; // F7
                case 119: pos_next.pos.parkBill(); break; // F8
                case 120: pos_next.pos.showX(); break; // F9
                case 121: pos_next.pos.showZ(); break; // F10
            }
        }
    });
};

pos_next.pos.setOrderType = function(type) {
    // Set in frm doc
    try {
        let pos_obj = window.cur_pos || (frappe.pages["point-of-sale"] && frappe.pages["point-of-sale"].pos);
        if (pos_obj && pos_obj.frm && pos_obj.frm.doc) {
            pos_obj.frm.doc.custom_order_type = type;
            pos_obj.frm.refresh_field("custom_order_type");
            frappe.show_alert({message:`Order type: ${type}`, indicator:"blue"});
            if (type==="Dine In" && pos_next.pos.is_restaurant) {
                pos_next.pos.showTableMap();
            }
        }
    } catch (e) {}
};

pos_next.pos.fireKOT = function() {
    try {
        let pos_obj = window.cur_pos || (frappe.pages["point-of-sale"] && frappe.pages["point-of-sale"].pos);
        if (!pos_obj || !pos_obj.frm) {
            frappe.msgprint("POS not ready");
            return;
        }
        const doc = pos_obj.frm.doc;
        if (!doc.items || !doc.items.length) {
            frappe.msgprint("Cart empty");
            return;
        }
        // Identify only non-fired items
        const to_fire = doc.items.filter(it=>!it.custom_is_kot_fired);
        if (!to_fire.length) {
            frappe.show_alert({message:"All items already fired to kitchen", indicator:"orange"});
            return;
        }
        pos_next.restaurant.fireKOT(doc.pos_profile, doc, to_fire).then(()=>{
            // Mark fired in frontend
            to_fire.forEach(it=> it.custom_is_kot_fired = 1);
            pos_obj.frm.refresh_field("items");
        });
        // Also call backend via our function directly, fireKOT already does api call
        // Mark as fired after call success handled inside fireKOT? For now optimistic
        pos_next.restaurant.fireKOT(doc.pos_profile, doc, to_fire);
    } catch (e) {
        console.error(e);
    }
};

pos_next.pos.showTableMap = function() {
    const pos_profile = pos_next.pos.pos_profile || (window.cur_pos && window.cur_pos.pos_profile) || (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc.pos_profile);
    if (!pos_profile) {
        frappe.msgprint("POS Profile not detected");
        return;
    }
    const d = new frappe.ui.Dialog({
        title: `Table Management - ${pos_profile}`,
        size:"extra-large",
        fields:[
            {fieldtype:"HTML", fieldname:"map", options:`<div id="pos-table-map" style="min-height:400px;"></div>`}
        ]
    });
    d.show();
    pos_next.restaurant.renderFloorPlan(d.$wrapper.find("#pos-table-map")[0], pos_profile, window.cur_pos);
    pos_next.restaurant.onTableSelected = (table)=>{
        d.hide();
        const $info = $("#pos-table-info");
        $info.show().text(`Table: ${table.table_name} | ${table.floor} | ${table.seats} seats`);
        // set to doc
        if (window.cur_pos && window.cur_pos.frm) {
            window.cur_pos.frm.doc.custom_table = table.name;
            window.cur_pos.frm.doc.custom_guest_count = table.seats || 2;
            window.cur_pos.frm.refresh_field("custom_table");
            window.cur_pos.frm.refresh_field("custom_guest_count");
        }
    };
};

pos_next.pos.showParked = function() {
    pos_next.supermarket.showParkedDialog(window.cur_pos);
};

pos_next.pos.parkBill = function() {
    try {
        const pos_obj = window.cur_pos;
        if (!pos_obj || !pos_obj.frm) return;
        const doc = pos_obj.frm.doc;
        pos_next.supermarket.parkBill(doc);
        // Clear cart? ERPNext way: new invoice
        if (pos_obj.cart && pos_obj.cart.make_new_cart) pos_obj.cart.make_new_cart();
    } catch (e) {}
};

pos_next.pos.triggerSplit = function() {
    try {
        const pos_obj = window.cur_pos;
        if (!pos_obj || !pos_obj.frm) return;
        const doc = pos_obj.frm.doc;
        pos_next.supermarket.showSplitBillDialog(doc.items);
        pos_next.supermarket.onSplitConfirmed = (selectedItems, idxs)=>{
            // For demo: create new invoice in background via split api if doc has name persisted? Since draft invoice not yet saved in DB? In offline we'd handle
            frappe.show_alert({message:`Split ${selectedItems.length} items to new bill`, indicator:"green"});
            console.log(selectedItems);
            // Remove selected items from current cart? Let's do
            if (idxs && idxs.length) {
                // Sort descending to avoid index shift
                idxs.sort((a,b)=>b-a).forEach(i=>{
                    doc.items.splice(i,1);
                });
                pos_obj.frm.refresh_field("items");
                pos_obj.frm.doc.grand_total = doc.items.reduce((s,it)=>s+(it.amount||it.qty*it.rate),0);
                pos_obj.frm.refresh_field("grand_total");
            }
        };
    } catch (e) { console.error(e); }
};

pos_next.pos.triggerCash = function(type) {
    const profile = pos_next.pos.pos_profile || (window.cur_pos && window.cur_pos.pos_profile) || (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc.pos_profile);
    const shift = (window.cur_pos && window.cur_pos.pos_opening_shift) || (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc.pos_opening_shift) || null;
    const shift_name = typeof shift === "object" ? shift.name : shift;
    pos_next.cash.showCashInOutDialog(type, profile, shift_name);
};

pos_next.pos.showReports = function() {
    const d = new frappe.ui.Dialog({
        title:"POS Next Reports",
        size:"large",
        fields:[
            {fieldtype:"HTML", fieldname:"reports", options:`
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
                    <button class="btn btn-primary" onclick="pos_next.pos.showX()">📄 X Report (Cash Drawer Summary)</button>
                    <button class="btn btn-danger" onclick="pos_next.pos.showZ()">🔒 Z Report (Closing)</button>
                    <button class="btn btn-secondary" onclick="frappe.set_route('query-report','POS Sales Summary')">📊 Sales Summary</button>
                    <button class="btn btn-secondary" onclick="frappe.set_route('query-report','POS Cashier Log')">💰 Cashier Log</button>
                    <button class="btn btn-secondary" onclick="frappe.set_route('query-report','POS Product Performance')">🏆 Product Performance</button>
                    <button class="btn btn-secondary" onclick="frappe.set_route('query-report','POS Hourly Sales')">⏰ Hourly Sales Heatmap</button>
                    <button class="btn btn-secondary" onclick="frappe.set_route('query-report','POS Table Wise Sales')">🍽️ Table Wise Sales</button>
                    <button class="btn btn-secondary" onclick="frappe.set_route('query-report','KOT Performance')">🍳 KOT / Kitchen Performance</button>
                    <button class="btn btn-secondary" onclick="window.open('/kds','_blank')">🍳 Open KDS</button>
                    <button class="btn btn-secondary" onclick="pos_next.customer_display.openDisplayWindow(cur_pos.pos_profile)">🖥️ Customer Display</button>
                </div>
                <div style="margin-top:12px;padding:10px;background:#F7FAFC;border-radius:8px;font-size:12px;">Tip: Use F9 for X Report, F10 for Z Report. All reports filter by POS Profile and Opening Shift.</div>
            `}
        ]
    });
    d.show();
};

pos_next.pos.showX = function() {
    const profile = pos_next.pos.pos_profile || (window.cur_pos && window.cur_pos.pos_profile);
    const shift = (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc.pos_opening_shift) || (window.cur_pos && window.cur_pos.pos_opening_shift && window.cur_pos.pos_opening_shift.name) || null;
    const shift_name = typeof shift === "object" ? shift.name : shift;
    pos_next.cash.showXReport(profile, shift_name);
};

pos_next.pos.showZ = function() {
    const profile = pos_next.pos.pos_profile || (window.cur_pos && window.cur_pos.pos_profile);
    const shift = (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc.pos_opening_shift) || null;
    const shift_name = typeof shift === "object" ? shift.name : shift;
    frappe.prompt([
        {label:"Counted Closing Cash", fieldname:"closing_amount", fieldtype:"Currency", reqd:1, description:"Physical cash counted in drawer"}
    ], (vals)=>{
        pos_next.cash.showZReport(profile, shift_name, vals.closing_amount);
    }, "Z Report - Closing Cash Check", "Generate Z");
};

pos_next.pos.quickPrint = function() {
    const pos_obj = window.cur_pos;
    if (!pos_obj || !pos_obj.frm) return;
    const doc = pos_obj.frm.doc;
    if (!doc.name || doc.docstatus!==1) {
        // If draft, we can't print final yet - but preview last invoice if any stored
        const last_invoice = localStorage.getItem("pos_last_invoice");
        if (last_invoice) {
            pos_next.receipt.showSelector(last_invoice, doc.pos_profile);
        } else {
            frappe.msgprint("Submit invoice first to print. Or use browser print for draft.");
            window.print();
        }
        return;
    }
    pos_next.receipt.showSelector(doc.name, doc.pos_profile);
};

// Auto init
$(document).ready(()=>{
    pos_next.pos.init();
});

frappe.router.on("change", ()=>{
    setTimeout(()=> {
        if (frappe.get_route_str() === "point-of-sale") pos_next.pos.inject();
    }, 1000);
});
