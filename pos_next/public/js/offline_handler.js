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
