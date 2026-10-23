from typing import List, Dict, Any

class EvidenceService:
    def filter_valid_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filters assessment evidence to ensure only valid tasks are processed."""
        return [e for e in events if e.get("task_validity") == "valid"]