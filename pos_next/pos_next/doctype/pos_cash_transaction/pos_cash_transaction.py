import frappe
from frappe.model.document import Document

class POSCashTransaction(Document):
    def validate(self):
        if self.amount <= 0:
            frappe.throw("Amount must be greater than zero")
        if not self.reason:
            frappe.throw("Reason is mandatory for cash movement")

    def on_submit(self):
        # Optionally update opening shift balance cache
        if self.pos_opening_shift:
            try:
                opening = frappe.get_doc("POS Opening Shift", self.pos_opening_shift)
                # We don't directly modify accounting, but we log
                frappe.msgprint(f"Cash {self.transaction_type} of {self.amount} recorded for shift {self.pos_opening_shift}")
            except Exception:
                pass
