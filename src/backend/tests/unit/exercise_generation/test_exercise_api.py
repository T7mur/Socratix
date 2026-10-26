
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.exercises import JobServiceUnavailable
from app.api.v1.exercises import (
    router,
    get_authenticated_student_id,
    get_exercise_job_submitter,
)


STUDENT_ID = "550e8400-e29b-41d4-a716-446655440002"


def make_app(submitter, student_id=STUDENT_ID):
    app = FastAPI()
    app.include_router(router)

    app.dependency_overrides[
        get_authenticated_student_id
    ] = lambda: student_id

    app.dependency_overrides[
        get_exercise_job_submitter
    ] = lambda: submitter

    return app


def valid_brief():
    return {
        "contract_version": "1.0",
        "request_id": "550e8400-e29b-41d4-a716-446655440001",
        "student_id": STUDENT_ID,
        "course_id": "550e8400-e29b-41d4-a716-446655440003",
        "activity_type": "single_skill_exercise",
        "target_skill_ids": ["python.conditionals"],
        "outcome_ids": ["python.conditionals.transfer.v1"],
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "assessment_stage": "transfer",
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
        "generation_policy_version": "generation-v1",
    }


def test_generation_endpoint_returns_jobref_202():
    class MockSubmitter:
        async def submit_generation_job(
            self, *, brief, authenticated_student_id
        ):
            assert authenticated_student_id == STUDENT_ID
            assert brief["request_id"] == (
                "550e8400-e29b-41d4-a716-446655440001"
            )

            return {
                "contract_version": "1.0",
                "job_id": "550e8400-e29b-41d4-a716-446655440020",
                "status": "queued",
                "resource_type": "exercise",
            }

    with TestClient(make_app(MockSubmitter())) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=valid_brief(),
        )

    assert response.status_code == 202
    assert response.json()["status"] == "queued"
    assert set(response.json()) == {
        "contract_version",
        "job_id",
        "status",
        "resource_type",
    }


def test_student_identity_mismatch_returns_403():
    class MockSubmitter:
        async def submit_generation_job(self, **kwargs):
            raise AssertionError("Job submission must not occur")

    request = valid_brief()
    request["student_id"] = (
        "550e8400-e29b-41d4-a716-446655440099"
    )

    with TestClient(make_app(MockSubmitter())) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=request,
        )

    assert response.status_code == 403


def test_missing_student_id_returns_422():
    class MockSubmitter:
        async def submit_generation_job(self, **kwargs):
            raise AssertionError("Job submission must not occur")

    request = valid_brief()
    del request["student_id"]

    with TestClient(make_app(MockSubmitter())) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=request,
        )

    assert response.status_code == 422


def test_unconfigured_authentication_fails_closed():
    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=valid_brief(),
        )

    assert response.status_code == 503



def test_job_service_unavailable_returns_503():
    class UnavailableSubmitter:
        async def submit_generation_job(self, **kwargs):
            raise JobServiceUnavailable("Database unavailable")

    with TestClient(make_app(UnavailableSubmitter())) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=valid_brief(),
        )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Generation job service is unavailable"
    )


def test_duplicate_request_preserves_idempotency_inputs():
    class MockSubmitter:
        def __init__(self):
            self.received = []

        async def submit_generation_job(
            self, *, brief, authenticated_student_id
        ):
            key = (
                authenticated_student_id,
                brief["request_id"],
                brief["generation_policy_version"],
            )

            self.received.append(key)

            return {
                "contract_version": "1.0",
                "job_id": "550e8400-e29b-41d4-a716-446655440020",
                "status": "queued",
                "resource_type": "exercise",
            }

    submitter = MockSubmitter()

    with TestClient(make_app(submitter)) as client:
        first = client.post(
            "/api/v1/exercises/generation-jobs",
            json=valid_brief(),
        )

        second = client.post(
            "/api/v1/exercises/generation-jobs",
            json=valid_brief(),
        )

    assert first.status_code == 202
    assert second.status_code == 202

    assert first.json()["job_id"] == second.json()["job_id"]

    assert len(submitter.received) == 2
    assert submitter.received[0] == submitter.received[1]


def test_missing_request_id_returns_422():
    class MockSubmitter:
        async def submit_generation_job(self, **kwargs):
            raise AssertionError("Submitter must not be called")

    request = valid_brief()
    del request["request_id"]

    with TestClient(make_app(MockSubmitter())) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=request,
        )

    assert response.status_code == 422


def test_invalid_request_id_returns_422():
    class MockSubmitter:
        async def submit_generation_job(self, **kwargs):
            raise AssertionError("Submitter must not be called")

    request = valid_brief()
    request["request_id"] = "not-a-uuid"

    with TestClient(make_app(MockSubmitter())) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=request,
        )

    assert response.status_code == 422


def test_missing_generation_policy_returns_422():
    class MockSubmitter:
        async def submit_generation_job(self, **kwargs):
            raise AssertionError("Submitter must not be called")

    request = valid_brief()
    del request["generation_policy_version"]

    with TestClient(make_app(MockSubmitter())) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=request,
        )

    assert response.status_code == 422


def test_invalid_job_service_response_returns_503():
    class BadSubmitter:
        async def submit_generation_job(self, **kwargs):
            return {
                "contract_version": "1.0",
                "job_id": "not-a-uuid",
                "status": "completed",
                "resource_type": "exercise",
            }

    with TestClient(make_app(BadSubmitter())) as client:
        response = client.post(
            "/api/v1/exercises/generation-jobs",
            json=valid_brief(),
        )

    assert response.status_code == 503
    assert "invalid response" in response.json()["detail"]
