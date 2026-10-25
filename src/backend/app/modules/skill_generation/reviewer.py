from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import ResourceType
from app.contracts.reviews import ReviewDecisionCreate
from app.core.errors import ConflictError, ForbiddenError, ValidationError
from app.db.models.curriculum import CatalogueRevision, ReviewDecision
from app.db.models.identity import User
from app.db.repositories.catalogue import CatalogueRepository, lock_catalogue


async def review_candidate(
    session: AsyncSession,
    reviewer_id: UUID,
    resource_type: ResourceType,
    resource_id: str,
    request: ReviewDecisionCreate,
) -> ReviewDecision:
    """Caller owns the transaction. Lock graph validation and approval together."""
    await lock_catalogue(session)
    reviewer = await session.scalar(
        select(User)
        .where(User.id == reviewer_id)
        .with_for_update(read=True)
        .execution_options(populate_existing=True)
    )
    if reviewer is None or not reviewer.is_active or reviewer.role != "admin":
        raise ForbiddenError("Active admin review permission required")
    repo = CatalogueRepository(session)
    row = await repo.get_review_candidate(
        resource_type.value, resource_id, request.resource_version, lock=True
    )
    latest = await session.scalar(
        select(func.max(CatalogueRevision.resource_version)).where(
            CatalogueRevision.resource_type == resource_type.value,
            CatalogueRevision.resource_id == resource_id,
        )
    )
    if latest != request.resource_version or row.approval_status not in {"proposed", "under_review"}:
        raise ConflictError("The candidate has already changed or been reviewed; refresh the queue")
    if request.decision == "approved":
        errors = await repo.validation_errors(row)
        if errors:
            raise ValidationError("; ".join(errors))
        await repo.apply_approved_revision(row)
    row.approval_status = request.decision
    decision = ReviewDecision(
        resource_type=resource_type.value,
        resource_id=resource_id,
        resource_version=request.resource_version,
        reviewer_id=reviewer_id,
        decision=request.decision,
        reason=request.reason.strip(),
        evidence_refs=[f"source:{row.source_id}"],
    )
    session.add(decision)
    await session.flush()
    if request.decision == "approved":
        await repo.publish_graph_snapshot(reviewer_id)
    return decision
