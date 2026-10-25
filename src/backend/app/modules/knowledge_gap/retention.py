"""
retention.py - Spaced repetition scheduling for independent skill checks.
Owner: Member D (Personalisation)
"""

from datetime import datetime, timedelta

# Default spaced repetition intervals in days as specified in the rules
DEFAULT_INTERVALS = [2, 7, 21]

def calculate_next_review(last_success_date: datetime, review_count: int = 0) -> datetime:
    """
    Calculates the next due review date based on the number of successful reviews.
    Uses the heuristic intervals: 2 days, 7 days, 21 days, and defaults to 30 days thereafter.
    """
    if not last_success_date:
        last_success_date = datetime.utcnow()

    if review_count < len(DEFAULT_INTERVALS):
        days_to_add = DEFAULT_INTERVALS[review_count]
    else:
        # For subsequent reviews beyond the initial sequence, use a steady 30-day interval
        days_to_add = 30

    return last_success_date + timedelta(days=days_to_add)

def evaluate_retention_due(schedule_record: dict, current_time: datetime = None) -> bool:
    """
    Checks if a scheduled retention check is currently due or overdue.
    """
    if current_time is None:
        current_time = datetime.utcnow()
        
    due_date = schedule_record.get("next_due_date")
    if not due_date:
        return False
        
    return current_time >= due_date