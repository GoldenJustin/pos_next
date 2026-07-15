from frappe import _

def get_data():
    # Return empty list to avoid legacy desktop icon creation errors in v16
    # Workspace handles desk navigation now
    return []
