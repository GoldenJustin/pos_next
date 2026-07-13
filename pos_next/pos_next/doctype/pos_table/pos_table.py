import frappe
from frappe.model.document import Document

class POSTable(Document):
    def validate(self):
        if self.floor:
            floor_profile = frappe.db.get_value("POS Floor", self.floor, "pos_profile")
            if floor_profile and not self.pos_profile:
                self.pos_profile = floor_profile
