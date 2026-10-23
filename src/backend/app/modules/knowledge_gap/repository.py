from typing import Dict, Any, Optional

class KnowledgeGapRepository:
    def __init__(self):
        self._estimates: Dict[str, Dict[str, Any]] = {}

    def save_estimate(self, student_id: str, skill_id: str, estimate: Dict[str, Any]) -> None:
        key = f"{student_id}:{skill_id}"
        self._estimates[key] = estimate

    def get_estimate(self, student_id: str, skill_id: str) -> Optional[Dict[str, Any]]:
        return self._estimates.get(f"{student_id}:{skill_id}")