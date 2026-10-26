
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import projects


STUDENT_ID = str(uuid4())


@pytest.fixture
def brief():
    return {
        "contract_version": "1.0",
        "request_id": str(uuid4()),
        "generation_policy_version": "v1",
        "activity_type": "project",
        "student_id": STUDENT_ID,
        "target_skill_ids": [
            "python.loops",
            "python.conditionals",
        ],
        "allowed_skill_ids": [
            "python.loops",
            "python.conditionals",
        ],
        "excluded_skill_ids": [],
    }


class FakeJobSubmitter:
    def __init__(self):
        self.calls = []

    async def submit_generation_job(
        self, *, brief, authenticated_student_id
    ):
        self.calls.append(
            (brief, authenticated_student_id)
        )
        return {
            "contract_version": "1.0",
            "job_id": str(uuid4()),
            "status": "queued",
            "resource_type": "project",
        }


@pytest.fixture
def api():
    app = FastAPI()
    app.include_router(projects.router)

    submitter = FakeJobSubmitter()

    app.dependency_overrides[
        projects.get_authenticated_student_id
    ] = lambda: STUDENT_ID

    app.dependency_overrides[
        projects.get_project_job_submitter
    ] = lambda: submitter

    return TestClient(app), submitter


def test_project_job_returns_202(api, brief):
    client, submitter = api

    response = client.post(
        "/api/v1/projects/generation-jobs",
        json=brief,
    )

    assert response.status_code == 202
    assert response.json()["status"] == "queued"
    assert response.json()["resource_type"] == "project"
    assert len(submitter.calls) == 1
    assert submitter.calls[0][1] == STUDENT_ID


def test_wrong_student_is_rejected(api, brief):
    client, submitter = api
    brief["student_id"] = str(uuid4())

    response = client.post(
        "/api/v1/projects/generation-jobs",
        json=brief,
    )

    assert response.status_code == 403
    assert submitter.calls == []


def test_wrong_activity_type_is_rejected(api, brief):
    client, submitter = api
    brief["activity_type"] = "single_skill_exercise"

    response = client.post(
        "/api/v1/projects/generation-jobs",
        json=brief,
    )

    assert response.status_code == 422
    assert submitter.calls == []


def test_invalid_request_id_is_rejected(api, brief):
    client, submitter = api
    brief["request_id"] = "not-a-uuid"

    response = client.post(
        "/api/v1/projects/generation-jobs",
        json=brief,
    )

    assert response.status_code == 422
    assert submitter.calls == []


def test_wrong_job_resource_type_is_rejected(
    api, brief, monkeypatch
):
    client, submitter = api

    async def wrong_result(
        *, brief, authenticated_student_id
    ):
        return {
            "contract_version": "1.0",
            "job_id": str(uuid4()),
            "status": "queued",
            "resource_type": "exercise",
        }

    monkeypatch.setattr(
        submitter,
        "submit_generation_job",
        wrong_result,
    )

    response = client.post(
        "/api/v1/projects/generation-jobs",
        json=brief,
    )

    assert response.status_code == 503


def test_missing_auth_integration_returns_503(brief):
    app = FastAPI()
    app.include_router(projects.router)
    client = TestClient(app)

    response = client.post(
        "/api/v1/projects/generation-jobs",
        json=brief,
    )

    assert response.status_code == 503
