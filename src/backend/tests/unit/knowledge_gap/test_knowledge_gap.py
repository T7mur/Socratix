"""
test_knowledge_gap.py - Unit tests for Member D knowledge gap logic.
"""
from datetime import datetime, timedelta
from src.backend.app.modules.knowledge_gap.retention import calculate_next_review, evaluate_retention_due

def test_calculate_next_review_initial():
    base_date = datetime(2026, 1, 1, 12, 0, 0)
    # First review interval should be 2 days later
    next_date = calculate_next_review(base_date, review_count=0)
    assert next_date == datetime(2026, 1, 3, 12, 0, 0)

def test_evaluate_retention_due():
    past_date = datetime.utcnow() - timedelta(days=5)
    schedule = {"next_due_date": past_date}
    # Since the due date was 5 days ago, it should be due
    assert evaluate_retention_due(schedule) is True