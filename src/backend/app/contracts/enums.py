from enum import Enum

DEFAULT_SELECTOR_WEIGHTS = {"planning": 0.40, "gap": 0.35, "retention": 0.25}


class ApprovalStatus(str, Enum):
    proposed = "proposed"
    under_review = "under_review"
    approved = "approved"
    rejected = "rejected"


class ActivityStatus(str, Enum):
    draft = "draft"
    verifying = "verifying"
    review_required = "review_required"
    verified = "verified"
    published = "published"
    rejected = "rejected"
    archived = "archived"


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    review_required = "review_required"


class AssessmentStage(str, Enum):
    recall = "recall"
    understanding = "understanding"
    transfer = "transfer"


class ActivityType(str, Enum):
    single_skill_exercise = "single_skill_exercise"
    multi_skill_exercise = "multi_skill_exercise"
    project = "project"


class ReviewStatus(str, Enum):
    not_required = "not_required"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ResourceType(str, Enum):
    skill = "skill"
    relation = "relation"
    outcome = "outcome"


class Role(str, Enum):
    student = "student"
    instructor = "instructor"
    admin = "admin"
