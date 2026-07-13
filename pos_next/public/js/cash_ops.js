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
