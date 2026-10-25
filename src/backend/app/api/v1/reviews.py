from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import ApprovalStatus, ResourceType
from app.contracts.reviews import (
    ReviewDecision,
    ReviewDecisionCreate,
    ReviewDetail,
    ReviewHistory,
    ReviewQueue,
)
from app.core.security import require_admin
from app.db.models.curriculum import CurriculumSource
from app.db.models.identity import User
from app.db.repositories.catalogue import CatalogueRepository, queue_item
from app.db.repositories.skill_imports import SkillImportRepository
from app.db.session import get_db_session, transaction
from app.modules.skill_generation.reviewer import review_candidate

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("", response_model=ReviewQueue)
async def list_reviews(
    resource_type: ResourceType | None = None,
    status: ApprovalStatus | None = None,
    limit: int = Query(25, ge=1, le=100),
    cursor: str | None = None,
    user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
):
    return await CatalogueRepository(session).list_review_candidates(
        resource_type, status.value if status else None, limit, cursor
    )


@router.get("/{resource_type}/{id}/history", response_model=ReviewHistory)
async def history(
    resource_type: ResourceType,
    id: str,
    user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
):
    return {"items": await CatalogueRepository(session).history(resource_type.value, id)}


@router.get("/{resource_type}/{id}", response_model=ReviewDetail)
async def detail(
    resource_type: ResourceType,
    id: str,
    resource_version: int = Query(..., ge=1),
    user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
):
    repo = CatalogueRepository(session)
    row = await repo.get_review_candidate(resource_type.value, id, resource_version)
    source = await session.get(CurriculumSource, row.source_id)
    evidence = await SkillImportRepository(session).evidence(resource_type.value, id, resource_version)
    if source.rights_status != "permitted":
        evidence = [{**item, "excerpt": None} for item in evidence]
    return {
        **queue_item(row),
        "payload": row.payload,
        "source": {
            "uri": source.uri,
            "section": source.section,
            "rights_status": source.rights_status,
            "source_kind": source.source_kind,
            "checksum": source.checksum,
        },
        "validation_errors": await repo.validation_errors(row),
        "evidence": evidence,
    }


@router.post("/{resource_type}/{id}", response_model=ReviewDecision)
async def decide(
    resource_type: ResourceType,
    id: str,
    body: ReviewDecisionCreate,
    user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
):
    async with transaction(session):
        return await review_candidate(session, user.id, resource_type, id, body)
