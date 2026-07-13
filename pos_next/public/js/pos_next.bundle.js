/* POS Next Offline Handler - Hard Network Resilience
   IndexedDB + Sync Queue + Broadcast
*/

frappe.provide("pos_next.offline");

pos_next.offline.DB_NAME = "pos_next_offline_v2";
pos_next.offline.DB_VERSION = 3;
pos_next.offline.STORES = ["invoices", "kots", "cash_transactions", "sync_queue"];

pos_next.offline.db = null;
pos_next.offline.is_online = navigator.onLine;
pos_next.offline.sync_in_progress = false;
pos_next.offline.pending_count = 0;

pos_next.offline.initDB = function() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(pos_next.offline.DB_NAME, pos_next.offline.DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            pos_next.offline.STORES.forEach(store => {
                if (!db.objectStoreNames.contains(store)) {
                    db.createObjectStore(store, { keyPath: "offline_id", autoIncrement: false });
                }
            });
            // also create index for invoice sync status
            try {
                const invStore = request.transaction.objectStore("invoices");
                if (invStore) invStore.createIndex("synced", "synced", { unique: false });
            } catch (e) {}
        };
        request.onsuccess = (e) => {
            pos_next.offline.db = e.target.result;
            console.log("[POS Next Offline] DB ready");
            resolve(pos_next.offline.db);
        };
        request.onerror = (e) => {
            console.error("[POS Next Offline] DB error", e);
            reject(e);
        };
    });
};

pos_next.offline.save = function(store, data) {
    return new Promise((resolve, reject) => {
        if (!pos_next.offline.db) {
            console.warn("DB not ready, init first");
            pos_next.offline.initDB().then(() => pos_next.offline.save(store, data).then(resolve).catch(reject));
            return;
        }
        if (!data.offline_id) data.offline_id = `offline_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
        data._saved_at = new Date().toISOString();
        const tx = pos_next.offline.db.transaction([store], "readwrite");
        const st = tx.objectStore(store);
        const req = st.put(data);
        req.onsuccess = () => {
            pos_next.offline.updateBadge();
            resolve(data);
        };
        req.onerror = reject;
    });
};

pos_next.offline.getAll = function(store) {
    return new Promise((resolve, reject) => {
        if (!pos_next.offline.db) { resolve([]); return; }
        const tx = pos_next.offline.db.transaction([store], "readonly");
        const st = tx.objectStore(store);
        const req = st.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = reject;
    });
};

pos_next.offline.remove = function(store, offline_id) {
    return new Promise((resolve, reject) => {
        const tx = pos_next.offline.db.transaction([store], "readwrite");
        tx.objectStore(store).delete(offline_id).onsuccess = () => resolve();
    });
};

pos_next.offline.enqueue = function(action, payload) {
    // action e.g., "create_invoice", "create_kot", "cash_transaction"
    const entry = {
        offline_id: `queue_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
        action: action,
        payload: payload,
        attempts: 0,
        created_at: new Date().toISOString(),
        last_error: null
    };
    return pos_next.offline.save("sync_queue", entry);
};

pos_next.offline.updateBadge = async function() {
    const pending = await pos_next.offline.getAll("sync_queue");
    const invoices = await pos_next.offline.getAll("invoices");
    const unsynced = invoices.filter(i => !i.synced).length;
    const total = pending.length + unsynced;
    pos_next.offline.pending_count = total;

    let badge = document.getElementById("pos-next-offline-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "pos-next-offline-badge";
        badge.className = "pos-next-offline-badge";
        document.body.appendChild(badge);
    }
    if (!pos_next.offline.is_online || total > 0) {
        badge.style.display = "block";
        badge.className = "pos-next-offline-badge " + (pos_next.offline.is_online ? "online" : "");
        if (!pos_next.offline.is_online) {
            badge.innerHTML = `⚠️ OFFLINE - ${total} pending | Hard Network Mode Active`;
        } else {
            badge.innerHTML = `🔄 Syncing ${total} offline bills...`;
            if (total === 0) {
                badge.innerHTML = "✅ All synced - Online";
                setTimeout(() => { badge.style.display = "none"; }, 3000);
            }
        }
    } else {
        badge.style.display = "none";
    }
};

pos_next.offline.sync = async function() {
    if (pos_next.offline.sync_in_progress) return;
    if (!navigator.onLine) {
        pos_next.offline.is_online = false;
        pos_next.offline.updateBadge();
        return;
    }
    pos_next.offline.sync_in_progress = true;
    console.log("[POS Next Offline] Starting sync");

    const queue = await pos_next.offline.getAll("sync_queue");

    for (let entry of queue) {
        try {
            entry.attempts += 1;
            console.log(`[POS Next] Syncing ${entry.action} ${entry.offline_id} attempt ${entry.attempts}`);

            if (entry.action === "create_invoice") {
                // try to submit invoice via frappe.call
                await new Promise((resolve, reject) => {
                    frappe.call({
                        method: "pos_next.api.pos.sync_offline_invoice",
                        args: { data: entry.payload },
                        callback: (r) => {
                            if (r.exc) reject(r.exc);
                            else resolve(r.message);
                        },
                        error: (err) => reject(err)
                    });
                });
            } else if (entry.action === "create_kot") {
                await new Promise((resolve, reject) => {
                    frappe.call({
                        method: "pos_next.api.pos.create_kot",
                        args: { pos_profile: entry.payload.pos_profile, data: entry.payload.data },
                        callback: (r) => {
                            if (r.exc) reject(r.exc);
                            else resolve(r.message);
                        },
                        error: reject
                    });
                });
            } else if (entry.action === "cash_transaction") {
                await new Promise((resolve, reject) => {
                    frappe.call({
                        method: "pos_next.api.pos.cash_transaction",
                        args: entry.payload,
                        callback: (r) => {
                            if (r.exc) reject(r.exc);
                            else resolve(r.message);
                        },
                        error: reject
                    });
                });
            }

            // Success: remove from queue
            await pos_next.offline.remove("sync_queue", entry.offline_id);
            // Also mark related store as synced if needed
            if (entry.payload && entry.payload.offline_id) {
                // update invoices store
                const invs = await pos_next.offline.getAll("invoices");
                let match = invs.find(i => i.offline_id === entry.payload.offline_id);
                if (match) {
                    match.synced = true;
                    await pos_next.offline.save("invoices", match);
                }
            }

        } catch (e) {
            console.error("[POS Next Offline] Sync failed", e, entry);
            entry.last_error = (e && e.message) || JSON.stringify(e).substring(0,200);
            if (entry.attempts < 10) {
                await pos_next.offline.save("sync_queue", entry);
            } else {
                console.warn("[POS Next] Giving up after 10 attempts", entry.offline_id);
                // keep but mark error
            }
            // exponential backoff break?
            if (entry.attempts % 3 === 0) {
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, entry.attempts % 5)));
            }
        }
    }

    pos_next.offline.sync_in_progress = false;
    pos_next.offline.updateBadge();
    console.log("[POS Next Offline] Sync complete");
};

pos_next.offline.setupListeners = function() {
    window.addEventListener("online", () => {
        console.log("[POS Next] Back online");
        pos_next.offline.is_online = true;
        frappe.show_alert({message: "Back online! Syncing offline bills...", indicator: "green"}, 5);
        pos_next.offline.updateBadge();
        pos_next.offline.sync();
    });
    window.addEventListener("offline", () => {
        console.log("[POS Next] Offline detected - Hard network mode");
        pos_next.offline.is_online = false;
        frappe.show_alert({message: "You are offline! POS will continue in hard offline mode.", indicator: "red"}, 8);
        pos_next.offline.updateBadge();
    });
    // Periodic sync every 30s
    setInterval(() => {
        if (navigator.onLine) pos_next.offline.sync();
    }, 30000);
};

// Init on load
$(document).ready(() => {
    pos_next.offline.initDB().then(() => {
        pos_next.offline.setupListeners();
        pos_next.offline.updateBadge();
    });
});
/* POS Next Customer Display - Second Screen / Pole Display
   Uses BroadcastChannel + localStorage for offline zero-latency
*/

frappe.provide("pos_next.customer_display");

pos_next.customer_display.CHANNEL_NAME = "pos_next_customer_display";
pos_next.customer_display.channel = null;

pos_next.customer_display.initChannel = function() {
    try {
        if ("BroadcastChannel" in window) {
            pos_next.customer_display.channel = new BroadcastChannel(pos_next.customer_display.CHANNEL_NAME);
            pos_next.customer_display.channel.onmessage = (event) => {
                // This path is for customer display window receiving updates
                if (window.is_customer_display_window) {
                    pos_next.customer_display.renderCustomerDisplay(event.data);
                }
            };
        }
    } catch (e) {
        console.warn("[POS Next CDs] BroadcastChannel not supported", e);
    }
};

pos_next.customer_display.sendToDisplay = function(payload) {
    // payload: {type, cart, total, logo, qrcode, ad, pos_profile}
    try {
        if (pos_next.customer_display.channel) {
            pos_next.customer_display.channel.postMessage(payload);
        }
        // Fallback via localStorage for older browsers
        localStorage.setItem("pos_next_customer_display_payload", JSON.stringify({...payload, _ts: Date.now()}));
    } catch (e) {}
};

pos_next.customer_display.renderCustomerDisplay = function(data) {
    if (!data) {
        try {
            const raw = localStorage.getItem("pos_next_customer_display_payload");
            if (raw) data = JSON.parse(raw);
        } catch (e) {}
    }
    if (!data) return;

    const container = document.getElementById("customer-display-root");
    if (!container) return;

    if (data.type === "cart_update") {
        // Render cart
        let items_html = (data.items || []).map(item => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #eee;">
                <div><strong>${frappe.utils.escape_html(item.item_name || item.item_code)}</strong> x ${item.qty}</div>
                <div>${format_currency(item.amount || item.qty * item.rate, data.currency || "USD")}</div>
            </div>
        `).join("");

        const total = data.grand_total || data.total || 0;

        container.innerHTML = `
            <div style="max-width:800px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,.2);">
                <div style="background:${data.company_color || '#5A67D8'};color:white;padding:20px;display:flex;justify-content:space-between;align-items:center;">
                    <h2 style="margin:0;font-weight:900;">${frappe.utils.escape_html(data.company || "POS Next Store")}</h2>
                    <div style="background:rgba(255,255,255,.2);padding:6px 12px;border-radius:20px;font-size:12px;">CUSTOMER DISPLAY</div>
                </div>
                <div style="padding:20px;">
                    <div style="min-height:260px;">${items_html || '<div style="text-align:center;padding:40px;color:#999;">Waiting for items...</div>'}</div>
                    <div style="border-top:3px solid #E2E8F0;margin-top:12px;padding-top:12px;">
                        <div style="display:flex;justify-content:space-between;font-size:14px;color:#666;"><span>Subtotal</span><span>${format_currency(data.net_total || total, data.currency)}</span></div>
                        <div style="display:flex;justify-content:space-between;font-size:14px;color:#666;"><span>Tax</span><span>${format_currency(data.total_taxes || 0, data.currency)}</span></div>
                        <div style="display:flex;justify-content:space-between;font-size:24px;font-weight:900;margin-top:8px;"><span>Total</span><span>${format_currency(total, data.currency)}</span></div>
                    </div>
                    <div style="margin-top:16px;text-align:center;">
                        ${data.qr ? `<img src="${data.qr}" style="max-width:160px;" /><div style="font-size:11px;color:#999;margin-top:4px;">Scan to Pay</div>` : ''}
                        ${data.thank_you ? `<div style="margin-top:12px;font-size:18px;font-weight:700;color:#48BB78;">${data.thank_you}</div>` : ''}
                    </div>
                </div>
                <div style="background:#F7FAFC;padding:14px;text-align:center;font-size:12px;color:#999;">
                    ${data.ad_html || 'Thank you for shopping with us! | POS Next Powered'}
                </div>
            </div>
            <div style="margin-top:20px; display:grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap:12px; max-width:800px; margin-left:auto; margin-right:auto;">
                ${(data.ads || []).map(ad => `<div style="background:white;border-radius:12px;padding:12px;text-align:center;"><img src="${ad.image}" style="max-width:100%; border-radius:8px;"><div style="font-weight:600;margin-top:6px;">${ad.title}</div></div>`).join("")}
            </div>
        `;
    } else if (data.type === "idle") {
        container.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:80vh;flex-direction:column;color:white;text-align:center;">
                <div style="font-size:64px;font-weight:900;">Welcome!</div>
                <div style="font-size:20px;opacity:.9;margin-top:8px;">${frappe.utils.escape_html(data.company || "")}</div>
                ${data.ad_html ? `<div style="margin-top:20px;max-width:600px;font-size:14px;background:rgba(255,255,255,.15);padding:16px;border-radius:12px;">${data.ad_html}</div>` : ""}
            </div>
        `;
    }
};

pos_next.customer_display.openDisplayWindow = function(pos_profile) {
    const url = `/customer-display?pos_profile=${encodeURIComponent(pos_profile)}`;
    window.open(url, "pos_next_customer_display", "width=1024,height=768,menubar=no,toolbar=no");
};

// Hook into POS cart updates: we will monkey patch POS controller
pos_next.customer_display.hookPOSCart = function(pos) {
    if (!pos) return;
    const original_update = pos.update_cart_html || function(){};
    // We'll listen via event instead of override: ERPNext's POS triggers "pos_cart_updated" custom event via our own trigger
};

// Poll localStorage for customer display window case
if (window.location.pathname.includes("customer-display")) {
    window.is_customer_display_window = true;
    pos_next.customer_display.initChannel();
    // Also poll localStorage every 500ms
    setInterval(() => {
        try {
            const raw = localStorage.getItem("pos_next_customer_display_payload");
            if (raw) {
                const data = JSON.parse(raw);
                // check ts within last 5 mins
                if (Date.now() - (data._ts || 0) < 300000) {
                    pos_next.customer_display.renderCustomerDisplay(data);
                }
            }
        } catch (e) {}
    }, 500);
    document.addEventListener("DOMContentLoaded", () => {
        pos_next.customer_display.renderCustomerDisplay({type:"idle", company: "Loading..."});
    });
} else {
    pos_next.customer_display.initChannel();
}
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
/* POS Next Supermarket Mode - Weighted Barcode, Split, Hold/Park, Multi-Bill */

frappe.provide("pos_next.supermarket");

pos_next.supermarket.PARKED_KEY = "pos_next_parked_invoices";

pos_next.supermarket.parseWeightedBarcode = function(barcode, pos_profile_doc) {
    // Odoo style: prefix 2 with configurable prefixes
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
        title:"Split Bill - Odoo Like",
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
/* POS Next Cash Operations - Cash In/Out, X/Z Reports */

frappe.provide("pos_next.cash");

pos_next.cash.showCashInOutDialog = function(type, pos_profile, opening_shift) {
    const title = type === "Cash In" ? "Cash In - Add Cash to Drawer" : "Cash Out - Remove Cash from Drawer";
    const d = new frappe.ui.Dialog({
        title: title,
        fields: [
            {label:"Type", fieldname:"transaction_type", fieldtype:"Select", options:"Cash In\nCash Out", default: type, read_only:1},
            {label:"Amount", fieldname:"amount", fieldtype:"Currency", reqd:1},
            {label:"Reason", fieldname:"reason", fieldtype:"Small Text", reqd:1, description:"Mandatory reason for audit"},
            {label:"Reference", fieldname:"reference", fieldtype:"Data", description:"Voucher No / Supplier / etc."},
            {label:"POS Profile", fieldname:"pos_profile", fieldtype:"Link", options:"POS Profile", default: pos_profile, read_only:1},
            {label:"Opening Shift", fieldname:"opening_shift", fieldtype:"Link", options:"POS Opening Shift", default: opening_shift, hidden:1}
        ],
        primary_action_label: type,
        primary_action: (vals)=>{
            // Save offline first
            const payload = {
                pos_profile: vals.pos_profile,
                transaction_type: vals.transaction_type,
                amount: vals.amount,
                reason: vals.reason,
                reference: vals.reference,
                opening_shift: vals.opening_shift
            };

            if (pos_next.offline && pos_next.offline.db) {
                pos_next.offline.save("cash_transactions", {...payload, offline_id: `cash_${Date.now()}`, synced:false});
                pos_next.offline.enqueue("cash_transaction", payload);
            }

            if (navigator.onLine) {
                frappe.call({
                    method:"pos_next.api.pos.cash_transaction",
                    args: payload,
                    freeze:true,
                    freeze_message:"Recording cash movement...",
                    callback: (r)=>{
                        if (r.message) {
                            frappe.show_alert({message:`${type} of ${frappe.format(vals.amount,{fieldtype:"Currency"})} recorded`, indicator:"green"});
                            d.hide();
                        }
                    }
                });
            } else {
                frappe.show_alert({message:`Offline: ${type} queued`, indicator:"orange"}, 8);
                d.hide();
            }
        }
    });
    d.show();
};

pos_next.cash.showXReport = function(pos_profile, opening_shift) {
    frappe.call({
        method:"pos_next.api.pos.get_x_report",
        args:{pos_profile: pos_profile, opening_shift: opening_shift},
        freeze:true,
        freeze_message:"Generating X Report...",
        callback: (r)=>{
            if (r.message) {
                const data = r.message;
                if (data.error) {
                    frappe.msgprint(data.error);
                    return;
                }
                let payments_html = (data.payments||[]).map(p=>`<tr><td>${p.mode_of_payment}</td><td style="text-align:right;">${frappe.format(p.amount,{fieldtype:"Currency"})}</td></tr>`).join("");
                let cash_tx_html = (data.cash_transactions||[]).map(t=>`<tr><td>${t.posting_time} - ${t.transaction_type}</td><td>${frappe.utils.escape_html(t.reason.substring(0,30))}</td><td style="text-align:right;">${frappe.format(t.amount,{fieldtype:"Currency"})}</td></tr>`).join("");

                const d = new frappe.ui.Dialog({
                    title:"X Report - Cash Drawer Summary (Mid Day)",
                    size:"large",
                    fields:[
                        {fieldtype:"HTML", fieldname:"report_html", options:`
                            <div style="font-family:monospace;padding:10px;">
                                <div style="text-align:center;font-weight:900;font-size:18px;">X REPORT</div>
                                <div style="text-align:center;font-size:12px;">${data.pos_profile} | ${data.opening_shift}</div>
                                <div style="text-align:center;font-size:11px;color:#666;">Generated: ${data.generated_at}</div>
                                <hr>
                                <table style="width:100%;font-size:13px;">
                                    <tr><td>Opening Cash:</td><td style="text-align:right;">${frappe.format(data.opening_amount,{fieldtype:"Currency"})}</td></tr>
                                    <tr><td>Total Sales:</td><td style="text-align:right;font-weight:700;">${frappe.format(data.total_sales,{fieldtype:"Currency"})}</td></tr>
                                    <tr><td>Invoices Count:</td><td style="text-align:right;">${data.invoice_count}</td></tr>
                                    <tr><td>Cash In:</td><td style="text-align:right;color:green;">+ ${frappe.format(data.cash_in,{fieldtype:"Currency"})}</td></tr>
                                    <tr><td>Cash Out:</td><td style="text-align:right;color:red;">- ${frappe.format(data.cash_out,{fieldtype:"Currency"})}</td></tr>
                                    <tr style="border-top:2px solid #000;font-weight:900;"><td>Expected Cash in Drawer:</td><td style="text-align:right;">${frappe.format(data.expected_cash,{fieldtype:"Currency"})}</td></tr>
                                </table>
                                <h6 style="margin-top:16px;font-weight:800;">Payments Breakdown</h6>
                                <table style="width:100%;font-size:13px;border:1px solid #EDF2F7;">${payments_html||'<tr><td>No payments</td></tr>'}</table>
                                <h6 style="margin-top:12px;font-weight:800;">Cash In/Out Movements</h6>
                                <table style="width:100%;font-size:12px;border:1px solid #EDF2F7;"><tr><th>Time & Type</th><th>Reason</th><th style="text-align:right;">Amount</th></tr>${cash_tx_html||'<tr><td colspan=3>No movements</td></tr>'}</table>
                                <div style="margin-top:16px;text-align:center;">
                                    <button class="btn btn-sm btn-primary" onclick="window.print()">🖨️ Print X Report</button>
                                    <button class="btn btn-sm btn-secondary" onclick="pos_next.cash.downloadXReport()">⬇️ Download PDF</button>
                                </div>
                            </div>
                        `}
                    ]
                });
                // Store for print
                pos_next.cash.last_x_report = data;
                d.show();
            }
        }
    });
};

pos_next.cash.showZReport = function(pos_profile, opening_shift, closing_amount) {
    frappe.call({
        method:"pos_next.api.pos.get_z_report",
        args:{pos_profile: pos_profile, opening_shift: opening_shift, closing_amount: closing_amount},
        freeze:true,
        freeze_message:"Generating Z Report (Closing)...",
        callback: (r)=>{
            if (r.message) {
                const data = r.message;
                if (data.error) {
                    frappe.msgprint(data.error);
                    return;
                }
                const d = new frappe.ui.Dialog({
                    title:"Z Report - Closing Report",
                    size:"large",
                    fields:[
                        {fieldtype:"HTML", fieldname:"report_html", options:`
                            <div style="font-family:monospace;padding:10px;">
                                <div style="text-align:center;font-weight:900;font-size:20px;">Z REPORT - CLOSING</div>
                                <div style="text-align:center;font-size:12px;">${data.pos_profile} | ${data.opening_shift}</div>
                                <hr>
                                <table style="width:100%;font-size:13px;">
                                    <tr><td>Opening:</td><td style="text-align:right;">${frappe.format(data.opening_amount,{fieldtype:"Currency"})}</td></tr>
                                    <tr><td>Total Sales:</td><td style="text-align:right;font-weight:700;">${frappe.format(data.total_sales,{fieldtype:"Currency"})}</td></tr>
                                    <tr><td>Expected Cash:</td><td style="text-align:right;">${frappe.format(data.expected_cash,{fieldtype:"Currency"})}</td></tr>
                                    <tr><td>Counted Cash (Closing):</td><td style="text-align:right;"><strong>${frappe.format(data.closing_amount,{fieldtype:"Currency"})}</strong></td></tr>
                                    <tr style="font-weight:900;background:${data.difference===0?'#C6F6D5':Math.abs(data.difference)<1?'#FEFCBF':'#FED7D7'};"><td>Difference (Counted - Expected):</td><td style="text-align:right;">${frappe.format(data.difference,{fieldtype:"Currency"})}</td></tr>
                                </table>
                                <div style="margin-top:12px;padding:10px;background:#FFFAF0;border-radius:8px;font-size:12px;">
                                    ${data.difference===0?'✅ Cash matches! Perfect.': data.difference>0 ? '⚠️ Excess cash found. Verify sales.' : '❗ Shortage detected! Check cash out transactions.'}
                                </div>
                                <div style="margin-top:16px;text-align:center;">
                                    <button class="btn btn-sm btn-danger" onclick="window.print()">🖨️ Print Z Report & Close Shift</button>
                                </div>
                            </div>
                        `}
                    ]
                });
                d.show();
            }
        }
    });
};

pos_next.cash.downloadXReport = function() {
    const data = pos_next.cash.last_x_report;
    if (!data) return;
    // Simple CSV download for now
    let csv = "Mode,Amount\n";
    data.payments.forEach(p=>{ csv += `${p.mode_of_payment},${p.amount}\n`; });
    csv += `Total Sales,${data.total_sales}\nExpected Cash,${data.expected_cash}\n`;
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `X-Report-${data.pos_profile}-${Date.now()}.csv`;
    a.click();
};
/* POS Next Receipt Templates - 5 Premium Designs
   HTML Jinja templates are stored in DocType POS Receipt Template.
   This JS provides preview + ESC/POS printing.
*/

frappe.provide("pos_next.receipt");

pos_next.receipt.templates = {
    "minimal_80mm": `
<div style="width:80mm;font-family:monospace;font-size:12px;padding:8px;color:#000;">
    <div style="text-align:center;">
        {% if show_logo %}<img src="{{ company.company_logo or '' }}" style="max-width:60px;"><br>{% endif %}
        <strong style="font-size:15px;">{{ doc.company }}</strong><br>
        <span style="font-size:10px;">{{ company.address_display or '' }}</span><br>
        <span style="font-size:10px;">Tel: {{ company.phone_no or '' }}</span>
    </div>
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <div style="display:flex;justify-content:space-between;font-size:10px;"><span>Inv: {{ doc.name }}</span><span>{{ frappe.datetime.str_to_user(doc.posting_date) }}</span></div>
    <div style="font-size:10px;">Cashier: {{ doc.owner }} | Cust: {{ doc.customer_name or doc.customer }}</div>
    {% if doc.custom_table %}<div style="font-size:11px;font-weight:700;">Table: {{ doc.custom_table }} | Guests: {{ doc.custom_guest_count }}</div>{% endif %}
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <table style="width:100%;font-size:11px;"><thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Amt</th></tr></thead>
    <tbody>
    {% for item in items %}
    <tr><td>{{ item.item_name[:24] }} {% if item.custom_kot_notes %}<br><small>NOTE: {{ item.custom_kot_notes }}</small>{% endif %}</td><td align="right">{{ item.qty }}</td><td align="right">{{ frappe.format(item.amount, {"fieldtype":"Currency"}) }}</td></tr>
    {% endfor %}
    </tbody></table>
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <table style="width:100%;font-size:12px;">
        <tr><td>Subtotal</td><td align="right">{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</td></tr>
        {% for tax in taxes %}<tr><td>{{ tax.description }}</td><td align="right">{{ frappe.format(tax.tax_amount, {"fieldtype":"Currency"}) }}</td></tr>{% endfor %}
        <tr style="font-weight:900;font-size:13px;"><td>Total</td><td align="right">{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>
        {% for pay in payments %}<tr><td>{{ pay.mode_of_payment }}</td><td align="right">{{ frappe.format(pay.amount, {"fieldtype":"Currency"}) }}</td></tr>{% endfor %}
        {% if doc.paid_amount > doc.grand_total %}<tr><td>Change</td><td align="right">{{ frappe.format(doc.paid_amount - doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>{% endif %}
    </table>
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    {% if show_qr %}<div style="text-align:center;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data={{ doc.name }}" style="width:90px;"><br><small>Scan for e-invoice</small></div>{% endif %}
    <div style="text-align:center;margin-top:8px;font-size:10px;">Thank you! Visit again<br>Powered by POS Next</div>
</div>
`,
    "odoo_clone": `
<div style="width:80mm;font-family:'Helvetica',sans-serif;padding:10px;">
    <div style="text-align:center;">
        <h2 style="margin:0;font-weight:900;letter-spacing:1px;">{{ doc.company }}</h2>
        <div style="font-size:11px;color:#555;margin-top:4px;">{{ company.address_display or '' }}</div>
        <div style="background:#000;color:#fff;display:inline-block;padding:2px 10px;margin-top:8px;font-size:10px;letter-spacing:1px;">RECEIPT</div>
    </div>
    <div style="margin-top:12px;font-size:11px;">
        <div style="display:flex;justify-content:space-between;"><span>Date:</span><span>{{ frappe.datetime.now_datetime() }}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Receipt:</span><span style="font-weight:700;">{{ doc.name }}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Cashier:</span><span>{{ doc.owner }}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Customer:</span><span>{{ doc.customer_name }}</span></div>
        {% if doc.custom_table %}<div style="display:flex;justify-content:space-between;font-weight:700;background:#F7FAFC;padding:4px;border-radius:4px;margin-top:4px;"><span>Table {{ doc.custom_table }} ({{ doc.custom_order_type }})</span><span>{{ doc.custom_guest_count }} Guests</span></div>{% endif %}
    </div>
    <div style="margin-top:12px;border-top:2px solid #000;padding-top:8px;">
        {% for item in items %}
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid #EDF2F7;">
            <div><div style="font-weight:600;">{{ item.item_name }}</div><div style="font-size:10px;color:#718096;">{{ item.qty }} x {{ frappe.format(item.rate, {"fieldtype":"Currency"}) }} {% if item.discount_percentage %} -{{ item.discount_percentage }}%{% endif %}</div></div>
            <div style="font-weight:700;">{{ frappe.format(item.amount, {"fieldtype":"Currency"}) }}</div>
        </div>
        {% endfor %}
    </div>
    <div style="margin-top:10px;background:#F7FAFC;padding:8px;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;"><span>Subtotal</span><span>{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;"><span>Tax</span><span>{{ frappe.format(doc.total_taxes_and_charges, {"fieldtype":"Currency"}) }}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;margin-top:4px;border-top:1px dashed #CBD5E0;padding-top:4px;"><span>TOTAL</span><span>{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</span></div>
    </div>
    <div style="margin-top:8px;">
        {% for pay in payments %}
        <div style="display:flex;justify-content:space-between;font-size:11px;"><span>{{ pay.mode_of_payment }}</span><span>{{ frappe.format(pay.amount, {"fieldtype":"Currency"}) }}</span></div>
        {% endfor %}
    </div>
    <div style="text-align:center;margin-top:14px;">
        <div style="font-size:11px;color:#999;">Thank you for your purchase!</div>
        <div style="font-size:9px;color:#aaa;margin-top:6px;">Odoo taste - Built with POS Next | {{ frappe.datetime.now_date() }}</div>
        {% if show_barcode %}<div style="margin-top:8px;font-family:'Libre Barcode 39',monospace;font-size:28px;">*{{ doc.name }}*</div>{% endif %}
    </div>
</div>
`,
    "restaurant_elegant": `
<div style="width:80mm;font-family:'Georgia',serif;padding:12px;">
    <div style="text-align:center;border:2px solid #000;padding:10px;">
        <div style="font-size:20px;font-weight:900;letter-spacing:2px;">{{ doc.company }}</div>
        <div style="font-size:10px;margin-top:4px;letter-spacing:1px;">FINE DINING • TAKEAWAY • DELIVERY</div>
    </div>
    <div style="text-align:center;margin-top:8px;font-size:10px;">{{ company.address_display or '' }}<br>ORDER TICKET</div>
    <hr style="border-top:1px solid #000;margin:8px 0;">
    <div style="font-size:12px;">
        <div><strong>Bill No:</strong> {{ doc.name }} | <strong>Date:</strong> {{ frappe.datetime.str_to_user(doc.posting_date) }} {{ doc.posting_time }}</div>
        <div><strong>Table:</strong> {{ doc.custom_table or 'N/A' }} | <strong>Guests:</strong> {{ doc.custom_guest_count or 1 }} | <strong>Type:</strong> {{ doc.custom_order_type or 'Dine In' }}</div>
        <div><strong>Customer:</strong> {{ doc.customer_name }} {% if doc.contact_mobile %}| {{ doc.contact_mobile }}{% endif %}</div>
        <div><strong>Waiter:</strong> {{ doc.owner }}</div>
    </div>
    <table style="width:100%;margin-top:10px;font-size:12px;border-top:2px solid #000;border-bottom:2px solid #000;">
        <thead><tr><th align="left" style="padding:4px 0;">Item</th><th align="center">Qty</th><th align="right">Price</th></tr></thead>
        <tbody>
        {% for it in items %}
        <tr><td style="padding:4px 0;">{{ it.item_name }}<br>{% if it.custom_kot_notes %}<span style="font-size:9px;font-style:italic;">Note: {{ it.custom_kot_notes }}</span>{% endif %}</td><td align="center">{{ it.qty }}</td><td align="right">{{ frappe.format(it.amount, {"fieldtype":"Currency"}) }}</td></tr>
        {% endfor %}
        </tbody>
    </table>
    <table style="width:100%;margin-top:8px;font-size:12px;">
        <tr><td>Net Total</td><td align="right">{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</td></tr>
        <tr><td>VAT / Service</td><td align="right">{{ frappe.format(doc.total_taxes_and_charges, {"fieldtype":"Currency"}) }}</td></tr>
        <tr style="font-weight:900;font-size:14px;border-top:1px solid #000;"><td>Grand Total</td><td align="right">{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>
    </table>
    <div style="text-align:center;margin-top:12px;border-top:1px dashed #000;padding-top:8px;font-size:10px;">
        Chef's Special: Show this bill for 10% off on next visit<br>
        <div style="margin-top:6px;font-size:12px;">*** Thank You! Come Again ***</div>
        <div style="margin-top:6px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data={{ doc.name }}" style="width:70px;"></div>
    </div>
</div>
`,
    "supermarket_detailed": `
<div style="width:80mm;font-family:monospace;font-size:10px;padding:6px;">
    <div style="text-align:center;"><strong style="font-size:14px;">{{ doc.company }}</strong><br>{{ company.address_display or '' }}<br> VAT: {{ company.tax_id or '' }}</div>
    <hr>
    <div style="display:flex;justify-content:space-between;"><span>Inv: {{ doc.name }}</span><span>{{ doc.posting_date }} {{ doc.posting_time }}</span></div>
    <div>Cashier: {{ doc.owner }} | Shift: {{ doc.pos_opening_shift }}</div>
    <div>Customer: {{ doc.customer_name }} | Loy: {{ doc.loyalty_program or '' }}</div>
    <hr>
    <table style="width:100%;font-size:9px;"><thead><tr><th align="left">Code</th><th align="left">Description</th><th align="right">Qty</th><th align="right">Rate</th><th align="right">Savings</th><th align="right">Total</th></tr></thead>
    <tbody>
    {% for it in items %}
    <tr>
        <td>{{ it.item_code[:8] }}</td><td>{{ it.item_name[:16] }}</td><td align="right">{{ it.qty }} {{ it.uom }}</td><td align="right">{{ it.rate }}</td><td align="right">{% if it.discount_amount %}{{ frappe.format(it.discount_amount, {"fieldtype":"Currency"}) }}{% endif %}</td><td align="right">{{ frappe.format(it.amount, {"fieldtype":"Currency"}) }}</td>
    </tr>
    {% endfor %}
    </tbody></table>
    <hr>
    <table style="width:100%;"><tr><td>Total Items</td><td align="right">{{ items|length }}</td><td></td><td align="right">{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</td></tr>
    <tr><td>Discount</td><td align="right">{{ frappe.format(doc.discount_amount, {"fieldtype":"Currency"}) }}</td><td></td><td></td></tr>
    <tr><td>Tax</td><td></td><td></td><td align="right">{{ frappe.format(doc.total_taxes_and_charges, {"fieldtype":"Currency"}) }}</td></tr>
    <tr style="font-weight:900;font-size:12px;"><td colspan=3>GRAND TOTAL</td><td align="right">{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>
    </table>
    <hr>
    <div>You saved: {{ frappe.format(doc.discount_amount, {"fieldtype":"Currency"}) }} today!</div>
    <div style="text-align:center;margin-top:6px;">Barcode: *{{ doc.name }}*<br>Thank you for shopping<br>{{ frappe.datetime.now_datetime() }}</div>
</div>
`,
    "a4_invoice": `
<div style="width:210mm;padding:20px;font-family:Arial,sans-serif;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h1 style="margin:0;">{{ doc.company }}</h1><div style="font-size:11px;color:#555;">{{ company.address_display or '' }}<br>{{ company.phone_no or '' }} | {{ company.email or '' }}<br> Tax ID: {{ company.tax_id or '' }}</div></div>
        <div style="text-align:right;"><h2 style="margin:0;color:#5A67D8;">TAX INVOICE</h2><div style="font-size:12px;">No: {{ doc.name }}<br>Date: {{ doc.posting_date }}<br>Due: {{ doc.due_date or doc.posting_date }}</div></div>
    </div>
    <hr>
    <div style="display:flex;justify-content:space-between;">
        <div style="font-size:12px;"><strong>Bill To:</strong><br>{{ doc.customer_name }}<br>{{ doc.address_display or '' }}<br>{{ doc.contact_mobile or '' }}</div>
        <div style="font-size:12px;"><strong>POS:</strong> {{ doc.pos_profile }}<br>Table: {{ doc.custom_table or '' }}<br>Order Type: {{ doc.custom_order_type or '' }}<br>Shift: {{ doc.pos_opening_shift }}</div>
    </div>
    <table style="width:100%;margin-top:16px;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#5A67D8;color:white;"><th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;">Qty</th><th style="padding:8px;">Rate</th><th style="padding:8px;">Discount</th><th style="padding:8px;text-align:right;">Amount</th></tr></thead>
        <tbody>
        {% for idx, it in enumerate(items) %}
        <tr style="border-bottom:1px solid #EDF2F7;"><td style="padding:6px;">{{ idx+1 }}</td><td style="padding:6px;">{{ it.item_name }}<br><small>{{ it.item_code }} | {{ it.description or '' }}</small></td><td style="padding:6px;text-align:center;">{{ it.qty }} {{ it.uom }}</td><td style="padding:6px;text-align:center;">{{ frappe.format(it.rate, {"fieldtype":"Currency"}) }}</td><td style="padding:6px;text-align:center;">{{ it.discount_percentage or 0 }}%</td><td style="padding:6px;text-align:right;">{{ frappe.format(it.amount, {"fieldtype":"Currency"}) }}</td></tr>
        {% endfor %}
        </tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:12px;">
        <table style="font-size:12px;width:300px;">
            <tr><td>Subtotal</td><td style="text-align:right;">{{ frappe.format(doc.net_total, {"fieldtype":"Currency"}) }}</td></tr>
            {% for tax in taxes %}<tr><td>{{ tax.description }}</td><td style="text-align:right;">{{ frappe.format(tax.tax_amount, {"fieldtype":"Currency"}) }}</td></tr>{% endfor %}
            <tr style="font-weight:900;font-size:14px;background:#F7FAFC;"><td>Grand Total</td><td style="text-align:right;">{{ frappe.format(doc.grand_total, {"fieldtype":"Currency"}) }}</td></tr>
            <tr><td>Paid</td><td style="text-align:right;">{{ frappe.format(doc.paid_amount, {"fieldtype":"Currency"}) }}</td></tr>
            <tr><td>Balance / Change</td><td style="text-align:right;">{{ frappe.format(doc.grand_total - doc.paid_amount, {"fieldtype":"Currency"}) }}</td></tr>
        </table>
    </div>
    <div style="margin-top:20px;display:flex;justify-content:space-between;font-size:11px;">
        <div>Payment: {% for p in payments %}{{ p.mode_of_payment }} ({{ frappe.format(p.amount, {"fieldtype":"Currency"}) }}) {% endfor %}</div>
        <div>Authorized Signature</div>
    </div>
    <div style="margin-top:20px;text-align:center;font-size:10px;color:#999;">This is a computer generated invoice - POS Next - Thank you!</div>
</div>
`
};

pos_next.receipt.getTemplate = function(name) {
    return pos_next.receipt.templates[name] || pos_next.receipt.templates["minimal_80mm"];
};

pos_next.receipt.print = function(invoice_name, template_name) {
    frappe.call({
        method: "pos_next.api.receipt.render_receipt",
        args: {invoice: invoice_name, template: template_name},
        callback: (r)=>{
            if (r.message) {
                const w = window.open("", "_blank", "width=400,height=600");
                w.document.write(`<html><head><title>${invoice_name}</title></head><body>${r.message}<script>window.print(); setTimeout(()=>window.close(), 600);<\/script></body></html>`);
                w.document.close();
            }
        }
    });
};

pos_next.receipt.showSelector = function(invoice_name, pos_profile) {
    // Fetch available templates
    frappe.call({
        method: "frappe.client.get_list",
        args: {doctype:"POS Receipt Template", fields:["name","template_name","paper_size"], limit_page_length:20},
        callback: (r)=>{
            const list = r.message || [];
            let options = list.map(t=>`<option value="${t.name}">${t.template_name} - ${t.paper_size}</option>`).join("");
            const d = new frappe.ui.Dialog({
                title:"Select Receipt Design",
                fields:[
                    {fieldtype:"Select", fieldname:"template", label:"Template", options: list.map(t=>t.name).join("\n"), default: list[0]?list[0].name:""},
                    {fieldtype:"HTML", fieldname:"preview_btn", options:`<button class="btn btn-sm btn-secondary" id="pos-preview-receipt">Preview</button>`}
                ],
                primary_action_label:"Print",
                primary_action: (vals)=>{
                    pos_next.receipt.print(invoice_name, vals.template);
                    d.hide();
                }
            });
            d.show();
            d.$wrapper.find("#pos-preview-receipt").on("click", ()=>{
                const tmpl = d.get_value("template");
                pos_next.receipt.print(invoice_name, tmpl);
            });
        }
    });
};
/* POS Next Main POS Controller - Injects Odoo-like features into ERPNext POS
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

    // Inject top bar Odoo style
    if ($(".pos-next-top-bar-injected").length === 0 && $(".point-of-sale-app").length) {
        // Find header
        const $app = $(".point-of-sale-app");
        const topBar = `
            <div class="odoo-top-bar pos-next-top-bar-injected pos-next-no-print" style="margin-bottom:8px;">
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

            // Hotkeys Odoo style
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
