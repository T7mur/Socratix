from typing import List, Dict, Any

class HypothesisService:
    def generate_hypotheses(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Proposes gap hypotheses based on repeated failures."""
        if len(events) < 2:
            return []
        return [{
            "label": "Suspected conceptual gap from repeated attempts",
            "status": "suspected",
            "evidence_count": len(events)
        }]