import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

class POSKOT(Document):
    def before_insert(self):
        if not self.order_time:
            self.order_time = now_datetime()

    def on_update(self):
        # Publish realtime for KDS
        try:
            frappe.publish_realtime(
                "pos_next_kds_update",
                {"kot": self.name, "status": self.kot_status, "profile": self.pos_profile},
                room=f"pos_next_kds_{self.pos_profile}",
            )
        except Exception:
            pass

    def before_submit(self):
        pass
