from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.activities import ProjectSpec, TaskSpec
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.db.base import utcnow
from app.db.models.activities import (
    Activity,
    ActivityOutcome,
    ActivitySkill,
    GradingArtifact,
    MilestoneDependency,
    Project,
    ProjectMilestone,
)
from app.db.models.curriculum import GraphMember
from app.db.repositories.common import checksum, require_course_membership, validate_public_payload


class ActivityRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_activity_version(
        self,
        *,
        student_id: UUID,
        course_id: UUID,
        spec: dict,
        graph_version: int,
        generation_policy_version: str,
    ) -> Activity:
        validate_public_payload(spec)
        try:
            parsed = (ProjectSpec if "project_id" in spec else TaskSpec).model_validate(spec)
        except ValueError as exc:
            raise ValidationError("Invalid canonical activity specification") from exc
        if parsed.verification_status.value != "draft":
            raise ValidationError("New specifications must start as draft")
        await require_course_membership(self.session, student_id, course_id)
        project = isinstance(parsed, ProjectSpec)
        key, version = (
            (parsed.project_id, parsed.project_version) if project else (parsed.task_id, parsed.task_version)
        )
        if await self.session.get(Activity, (key, version)):
            raise ConflictError("Activity version already exists")
        if version > 1 and await self.session.get(Activity, (key, version - 1)) is None:
            raise ConflictError("Previous version must exist")
        previous = await self.session.get(Activity, (key, version - 1)) if version > 1 else None
        if previous and (previous.student_id != student_id or previous.course_id != course_id):
            raise ForbiddenError("Activity versions must retain their owner and course")
        outcomes = parsed.engineering_outcome_ids if project else parsed.outcome_ids
        members = (
            await self.session.scalars(select(GraphMember).where(GraphMember.graph_version == graph_version))
        ).all()
        allowed = {(row.resource_type, row.resource_id) for row in members}
        if any(("skill", item) not in allowed for item in parsed.target_skill_ids) or any(
            ("outcome", item) not in allowed for item in outcomes
        ):
            raise ValidationError("Activity skills and outcomes must belong to the approved graph snapshot")
        row = Activity(
            id=key,
            version=version,
            student_id=student_id,
            course_id=course_id,
            activity_type="project" if project else parsed.activity_type,
            status="draft",
            human_review_status=parsed.human_review_status.value,
            student_safe_spec=parsed.model_dump(mode="json"),
            spec_checksum=checksum(parsed.model_dump(mode="json")),
            generation_policy_version=generation_policy_version,
            graph_version=graph_version,
        )
        self.session.add(row)
        await self.session.flush()
        self.session.add_all(
            [
                ActivitySkill(activity_id=key, activity_version=version, skill_id=skill)
                for skill in parsed.target_skill_ids
            ]
        )
        self.session.add_all(
            [
                ActivityOutcome(
                    activity_id=key,
                    activity_version=version,
                    outcome_id=outcome,
                    outcome_role="engineering" if project else "target",
                )
                for outcome in outcomes
            ]
        )
        if project:
            self.session.add(
                Project(
                    project_id=key, project_version=version, project_policy_version=generation_policy_version
                )
            )
            await self.session.flush()
            for index, milestone in enumerate(parsed.milestones, 1):
                self.session.add(
                    ProjectMilestone(
                        project_id=key,
                        project_version=version,
                        milestone_id=milestone.milestone_id,
                        title=milestone.title,
                        assessment_method=milestone.assessment_method,
                        requirements=milestone.requirement_ids,
                        public_rubric=milestone.public_rubric,
                        sequence=index,
                    )
                )
            await self.session.flush()
            self.session.add_all(
                [
                    MilestoneDependency(
                        project_id=key,
                        project_version=version,
                        milestone_id=item.milestone_id,
                        depends_on_milestone_id=parent,
                    )
                    for item in parsed.milestones
                    for parent in item.depends_on
                ]
            )
        await self.session.flush()
        return row

    async def transition(self, activity_id: UUID, version: int, target: str) -> None:
        """Trusted generator/reviewer boundary. Publication needs independently persisted QA evidence."""
        row = await self.session.scalar(
            select(Activity).where(Activity.id == activity_id, Activity.version == version).with_for_update()
        )
        if row is None:
            raise NotFoundError("Activity not found")
        allowed = {
            "draft": {"verifying", "rejected"},
            "verifying": {"verified", "review_required", "rejected"},
            "review_required": {"verified", "rejected"},
            "verified": {"published", "archived"},
            "published": {"archived"},
        }
        if target not in allowed.get(row.status, set()):
            raise ConflictError("Invalid activity transition")
        if target in {"verified", "published"} and not await self.session.scalar(
            select(GradingArtifact.artifact_id)
            .where(GradingArtifact.activity_id == activity_id, GradingArtifact.activity_version == version)
            .limit(1)
        ):
            raise ValidationError("Persisted private verification artifacts required")
        if target == "published" and row.human_review_status not in {"approved", "not_required"}:
            raise ConflictError("Human review gate not satisfied")
        if target == "verifying":
            row.frozen_at = utcnow()
        if target == "published":
            row.published_at = utcnow()
        row.status = target
        await self.session.flush()

    async def get_student_safe_activity(self, student_id: UUID, activity_id: UUID, version: int) -> dict:
        row = await self.session.scalar(
            select(Activity).where(
                Activity.id == activity_id,
                Activity.version == version,
                Activity.student_id == student_id,
                Activity.status == "published",
            )
        )
        if row is None:
            raise NotFoundError("Published activity not found")
        await require_course_membership(self.session, student_id, row.course_id)
        result = {
            **row.student_safe_spec,
            "verification_status": row.status,
            "human_review_status": row.human_review_status,
        }
        validate_public_payload(result)
        return result

    async def get_private_grading_artifact(self, artifact_id: UUID, version: int) -> GradingArtifact:
        """Trusted orchestrator connection only; API DB role has no access to this table."""
        row = await self.session.get(GradingArtifact, (artifact_id, version))
        if row is None:
            raise NotFoundError("Private artifact not found")
        return row
