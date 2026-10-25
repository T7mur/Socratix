# --- Member D: Knowledge Gap Identification Endpoints ---
from fastapi import APIRouter, Depends, HTTPException
from src.backend.app.modules.knowledge_gap.repository import get_student_skill_estimate, update_student_estimate

router = APIRouter()

@router.get("/students/{student_id}/knowledge-gaps", tags=["Knowledge Gaps"])
def get_knowledge_gaps(student_id: str):
    """
    Retrieves the current versioned SkillEstimate and active gap hypotheses for a student.
    """
    estimate = get_student_skill_estimate(student_id)
    if not estimate:
        return {"student_id": student_id, "status": "insufficient_evidence", "hypotheses": []}
    return estimate

@router.post("/students/{student_id}/knowledge-gaps/recalculate", tags=["Knowledge Gaps"])
def trigger_gap_recalculation(student_id: str):
    """
    Triggers a recomputation of student skill estimates and hypotheses based on verified events.
    """
    updated_estimate = update_student_estimate(student_id)
    return {"status": "success", "estimate": updated_estimate}