from typing import Dict, Any

class KnowledgeGapScorer:
    def calculate_gap_priority(self, deficit: float, failures: int, assistance: float, confidence_gap: float) -> float:
        """Computes the heuristic gap priority score in [0, 1]."""
        d = max(0.0, min(1.0, deficit))
        f = min(1.0, failures / 5.0)
        h = max(0.0, min(1.0, assistance))
        c = max(0.0, min(1.0, confidence_gap))
        
        # Heuristic weights: 0.45*D + 0.25*F + 0.20*H + 0.10*C
        return round(0.45 * d + 0.25 * f + 0.20 * h + 0.10 * c, 4)