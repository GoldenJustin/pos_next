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
