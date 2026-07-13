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
