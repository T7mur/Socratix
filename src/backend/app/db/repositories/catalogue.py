import base64
import json
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, text, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import ResourceType
from app.contracts.reviews import validate_candidate
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.db.models.curriculum import (
    CatalogueRevision,
    CurriculumSource,
    GraphMember,
    GraphVersion,
    LearningOutcome,
    ReviewDecision,
    Skill,
    SkillRelation,
)
from app.db.repositories.common import checksum
from app.modules.skill_generation.relation_validator import validate_acyclic, validate_endpoints_exist

CATALOGUE_LOCK = 73142001
MODELS = {
    "skill": (Skill, "skill_id"),
    "relation": (SkillRelation, "relation_id"),
    "outcome": (LearningOutcome, "outcome_id"),
}


async def lock_catalogue(session: AsyncSession) -> None:
    await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": CATALOGUE_LOCK})


def queue_item(row: CatalogueRevision) -> dict:
    return {
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "resource_version": row.resource_version,
        "approval_status": row.approval_status,
        "title": row.payload.get("name")
        or row.payload.get("observable_action")
        or f"{row.payload.get('from_skill_id')} {row.payload.get('relation')} {row.payload.get('to_skill_id')}",
        "created_at": row.created_at,
    }


class CatalogueRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_candidate_revision(
        self, resource_type: ResourceType, resource_id: str, payload: dict, source_id: UUID, created_by: UUID
    ) -> CatalogueRevision:
        try:
            data = validate_candidate(resource_type, resource_id, payload)
        except ValueError as exc:
            raise ValidationError("Candidate does not match its canonical schema") from exc
        if data["approval_status"] not in {"proposed", "under_review"}:
            raise ValidationError("Candidates must be proposed or under_review")
        await lock_catalogue(self.session)
        rows = (
            await self.session.scalars(
                select(CatalogueRevision).where(
                    CatalogueRevision.resource_type == resource_type.value,
                    CatalogueRevision.resource_id == resource_id,
                )
            )
        ).all()
        if any(row.approval_status in {"proposed", "under_review"} for row in rows):
            raise ConflictError("Resolve the pending revision before submitting another")
        revision = CatalogueRevision(
            resource_type=resource_type.value,
            resource_id=resource_id,
            resource_version=max((row.resource_version for row in rows), default=0) + 1,
            approval_status=data["approval_status"],
            payload=data,
            checksum=checksum(data),
            source_id=source_id,
            created_by=created_by,
        )
        self.session.add(revision)
        await self.session.flush()
        return revision

    async def list_review_candidates(
        self,
        resource_type: ResourceType | None = None,
        status: str | None = None,
        limit: int = 25,
        cursor: str | None = None,
    ) -> dict:
        if not 1 <= limit <= 100:
            raise ValidationError("Queue limit must be between 1 and 100")
        stmt = select(CatalogueRevision)
        if resource_type:
            stmt = stmt.where(CatalogueRevision.resource_type == resource_type.value)
        stmt = stmt.where(
            CatalogueRevision.approval_status.in_([status] if status else ["proposed", "under_review"])
        )
        if cursor:
            try:
                if len(cursor) > 2048:
                    raise ValueError()
                stamp, kind, key, version = json.loads(base64.urlsafe_b64decode(cursor.encode()))
                stamp = datetime.fromisoformat(stamp)
                if (
                    stamp.tzinfo is None
                    or kind not in MODELS
                    or not isinstance(key, str)
                    or not isinstance(version, int)
                ):
                    raise ValueError()
            except (ValueError, TypeError, UnicodeError) as exc:
                raise ValidationError("Invalid queue cursor") from exc
            stmt = stmt.where(
                tuple_(
                    CatalogueRevision.created_at,
                    CatalogueRevision.resource_type,
                    CatalogueRevision.resource_id,
                    CatalogueRevision.resource_version,
                )
                > (stamp, kind, key, version)
            )
        rows = (
            await self.session.scalars(
                stmt.order_by(
                    CatalogueRevision.created_at,
                    CatalogueRevision.resource_type,
                    CatalogueRevision.resource_id,
                    CatalogueRevision.resource_version,
                ).limit(limit + 1)
            )
        ).all()
        next_cursor = None
        if len(rows) > limit:
            last = rows[limit - 1]
            next_cursor = base64.urlsafe_b64encode(
                json.dumps(
                    [last.created_at.isoformat(), last.resource_type, last.resource_id, last.resource_version]
                ).encode()
            ).decode()
        return {"items": [queue_item(row) for row in rows[:limit]], "next_cursor": next_cursor}

    async def get_review_candidate(
        self, resource_type: str, resource_id: str, version: int, lock: bool = False
    ) -> CatalogueRevision:
        stmt = select(CatalogueRevision).where(
            CatalogueRevision.resource_type == resource_type,
            CatalogueRevision.resource_id == resource_id,
            CatalogueRevision.resource_version == version,
        )
        if lock:
            stmt = stmt.with_for_update()
        row = await self.session.scalar(stmt)
        if row is None:
            raise NotFoundError("Catalogue revision not found")
        return row

    async def validation_errors(self, revision: CatalogueRevision) -> list[str]:
        errors = []
        source = await self.session.get(CurriculumSource, revision.source_id)
        if source is None or source.rights_status != "permitted":
            errors.append("Source rights must be explicitly permitted before approval")
        data = revision.payload
        if revision.resource_type == "skill" and source and data["source_kind"] != source.source_kind:
            errors.append("Candidate source_kind must match its recorded provenance")
        if (
            revision.resource_type != "relation"
            and source
            and not any(ref["uri"] == source.uri for ref in data["source_refs"])
        ):
            errors.append("Source references must include the recorded provenance URI")
        approved_ids = set(
            (
                await self.session.scalars(select(Skill.skill_id).where(Skill.approval_status == "approved"))
            ).all()
        )
        if revision.resource_type == "outcome" and data["skill_id"] not in approved_ids:
            errors.append("The outcome's skill must be approved first")
        if revision.resource_type == "relation":
            try:
                validate_endpoints_exist(data["from_skill_id"], data["to_skill_id"], approved_ids)
                existing = (
                    await self.session.scalars(
                        select(SkillRelation).where(
                            SkillRelation.approval_status == "approved",
                            SkillRelation.relation_id != UUID(revision.resource_id),
                        )
                    )
                ).all()
                if any(
                    (row.from_skill_id, row.to_skill_id, row.relation)
                    == (data["from_skill_id"], data["to_skill_id"], data["relation"])
                    for row in existing
                ):
                    raise ValidationError("This approved relationship already exists")
                if data["relation"] in {"requires", "part_of"}:
                    validate_acyclic(
                        [
                            (row.from_skill_id, row.to_skill_id)
                            for row in existing
                            if row.relation == data["relation"]
                        ]
                        + [(data["from_skill_id"], data["to_skill_id"])]
                    )
            except ValidationError as exc:
                errors.append(str(exc))
        return errors

    async def apply_approved_revision(self, revision: CatalogueRevision) -> None:
        data = revision.payload
        cls, id_field = MODELS[revision.resource_type]
        key = UUID(revision.resource_id) if revision.resource_type == "relation" else revision.resource_id
        row = await self.session.get(cls, key)
        values = {key: value for key, value in data.items() if key in cls.__table__.c.keys()}
        values.update(approval_status="approved", resource_version=revision.resource_version)
        if revision.resource_type == "skill":
            values["source_id"] = revision.source_id
        if row is None:
            row = cls(**{id_field: key})
            self.session.add(row)
        for name, value in values.items():
            setattr(row, name, value)
        await self.session.flush()

    async def publish_graph_snapshot(self, reviewer_id: UUID) -> int:
        """Call under the catalogue transaction lock after an authorised approval."""
        members = []
        for kind, (cls, field) in MODELS.items():
            rows = (await self.session.scalars(select(cls).where(cls.approval_status == "approved"))).all()
            members.extend((kind, str(getattr(row, field)), row.resource_version) for row in rows)
        version = (await self.session.scalar(select(func.max(GraphVersion.graph_version))) or 0) + 1
        self.session.add(
            GraphVersion(graph_version=version, checksum=checksum(sorted(members)), published_by=reviewer_id)
        )
        await self.session.flush()
        self.session.add_all(
            [
                GraphMember(graph_version=version, resource_type=kind, resource_id=key, resource_version=rev)
                for kind, key, rev in members
            ]
        )
        return version

    async def list_approved_skills(self) -> list[dict]:
        graph = await self.get_graph_snapshot()
        return graph["skills"]

    async def get_graph_snapshot(self, version: int | None = None) -> dict:
        version = version or await self.session.scalar(select(func.max(GraphVersion.graph_version)))
        result = {
            "contract_version": "1.0",
            "graph_version": version,
            "skills": [],
            "relationships": [],
            "outcomes": [],
        }
        if version is None:
            return result
        if await self.session.get(GraphVersion, version) is None:
            raise NotFoundError("Graph version not found")
        rows = (
            await self.session.scalars(
                select(CatalogueRevision)
                .join(
                    GraphMember,
                    (GraphMember.resource_type == CatalogueRevision.resource_type)
                    & (GraphMember.resource_id == CatalogueRevision.resource_id)
                    & (GraphMember.resource_version == CatalogueRevision.resource_version),
                )
                .where(GraphMember.graph_version == version)
                .order_by(CatalogueRevision.resource_type, CatalogueRevision.resource_id)
            )
        ).all()
        for row in rows:
            group = {"skill": "skills", "relation": "relationships", "outcome": "outcomes"}[row.resource_type]
            result[group].append({**row.payload, "approval_status": "approved"})
        for skill in result["skills"]:
            skill["outcomes"] = [row for row in result["outcomes"] if row["skill_id"] == skill["skill_id"]]
        return result

    async def history(self, resource_type: str, resource_id: str) -> list[ReviewDecision]:
        return list(
            (
                await self.session.scalars(
                    select(ReviewDecision)
                    .where(
                        ReviewDecision.resource_type == resource_type,
                        ReviewDecision.resource_id == resource_id,
                    )
                    .order_by(ReviewDecision.decided_at)
                )
            ).all()
        )
