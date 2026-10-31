"""python server/test_planning_elm.py — planning ELM routes with a fake ELM client (no network, no key)."""
import json
import os
import sys

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
from planning_elm import make_router  # noqa: E402


class FakeElm:
    """Returns the queued replies in order; an Exception in the queue is raised (ELM down)."""
    def __init__(self):
        self.replies, self.calls = [], 0
        self.chat = self
        self.completions = self

    def create(self, **kw):
        self.calls += 1
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        msg = type("M", (), {"content": r if isinstance(r, str) else json.dumps(r)})
        return type("R", (), {"choices": [type("C", (), {"message": msg})]})


def check_token(authorization):
    if authorization != "Bearer t":
        raise HTTPException(status_code=401, detail="Not allowed")
    return "tester"


fake = FakeElm()
app = FastAPI()
app.include_router(make_router(fake, check_token))
c = TestClient(app)
H = {"Authorization": "Bearer t"}

E3_IN = {"path": "beginner", "full": True, "top_priority": "CS coursework", "due_milestones": [{"id": "m1", "name": "Lab 3"}],
         "concepts": ["recursion"], "tasks": [{"id": "t1", "text": "Revise lecture 5", "minutes": 45, "rule_specificity": "borderline"}], "other_tasks": []}
GOOD_E3 = {"tasks": [{"id": "t1", "finishable": "no", "scope_ok": True, "issue_code": "vague_outcome", "note": "How will you know you are done? Name a result.",
                      "task_type": "reading", "milestone_id": None, "course": None, "concept_ids": ["unsure"]}],
           "priority_covered": False, "covered_by": None, "rewrite": {"id": "t1", "text": "Revise lecture 5: redo the 3 worked examples"}}

# 1. no token → 401; unknown call → 404; bad input → 422 (nothing reaches ELM)
assert c.post("/api/planning/e3", json=E3_IN).status_code == 401
assert c.post("/api/planning/e9", json={}, headers=H).status_code == 404
assert c.post("/api/planning/e1", json={"text": "x" * 7000, "mode": "topics", "today": "2026-10-31"}, headers=H).status_code == 422
assert fake.calls == 0

# 2. valid reply → passed through
fake.replies = [GOOD_E3]
r = c.post("/api/planning/e3", json=E3_IN, headers=H).json()
assert r["tasks"][0]["finishable"] == "no" and r["rewrite"]["id"] == "t1", r

# 3. invalid JSON first, valid second → one retry
fake.replies = ["Sure! Here it is:", GOOD_E3]
assert "tasks" in c.post("/api/planning/e3", json=E3_IN, headers=H).json()

# 4. invalid twice → fallback
fake.replies = ["nope", "still nope"]
assert c.post("/api/planning/e3", json=E3_IN, headers=H).json() == {"fallback": True}

# 5. banned word in a note → rejected twice → fallback
bad = json.loads(json.dumps(GOOD_E3)); bad["tasks"][0]["note"] = "This is a bad task, write something with a clear end."
fake.replies = [bad, bad]
assert c.post("/api/planning/e3", json=E3_IN, headers=H).json() == {"fallback": True}

# 6. unknown task id / milestone id → rejected
odd = json.loads(json.dumps(GOOD_E3)); odd["tasks"][0]["milestone_id"] = "m-unknown"
fake.replies = [odd, odd]
assert c.post("/api/planning/e3", json=E3_IN, headers=H).json() == {"fallback": True}

# 7. competent path: the rewrite is removed
fake.replies = [GOOD_E3]
assert c.post("/api/planning/e3", json={**E3_IN, "path": "competent", "full": False}, headers=H).json()["rewrite"] is None

# 8. E4: a start outside the free slots is rejected
E4_IN = {"concept": "Recursion", "minutes_hint": 30, "free_slots": [{"start": "16:00", "end": "17:00"}]}
fake.replies = [{"text": "2 recursion exercises on lists", "start": "13:00", "minutes": 30}] * 2
assert c.post("/api/planning/e4", json=E4_IN, headers=H).json() == {"fallback": True}
fake.replies = [{"text": "2 recursion exercises on lists", "start": "16:10", "minutes": 30}]
assert c.post("/api/planning/e4", json=E4_IN, headers=H).json()["start"] == "16:10"

# 9. E5: a code block is rejected
E5_IN = {"question": "Is this too much?", "top_priority": "CW2", "free_minutes": 300, "tasks": []}
fake.replies = [{"answer": "```python\nprint(1)```"}] * 2
assert c.post("/api/planning/e5", json=E5_IN, headers=H).json() == {"fallback": True}

# 10. E6: over 60 minutes in total is rejected; a light plan passes
E6_IN = {"date": "2026-10-31", "now": "10:00", "free_slots": [{"start": "10:00", "end": "21:00"}], "next_milestones": [{"id": "m1", "name": "Cover by testing"}]}
fake.replies = [{"tasks": [{"text": "Matrices: 5 questions", "start": "11:00", "minutes": 30, "milestone_id": "m1"}, {"text": "Vectors: 5 questions", "start": "12:00", "minutes": 40, "milestone_id": "m1"}]}] * 2
assert c.post("/api/planning/e6", json=E6_IN, headers=H).json() == {"fallback": True}
fake.replies = [{"tasks": [{"text": "Matrices: 5 questions from memory", "start": "11:00", "minutes": 20, "milestone_id": "m1"}]}]
assert len(c.post("/api/planning/e6", json=E6_IN, headers=H).json()["tasks"]) == 1

# 11. ELM down → fallback at once (no retry)
before = fake.calls
fake.replies = [ConnectionError("down")]
assert c.post("/api/planning/e5", json=E5_IN, headers=H).json() == {"fallback": True} and fake.calls == before + 1

# 12. E1 deadlines need a real date; E2 is cached per deadline
fake.replies = [{"items": [{"course": "INF2", "item": "CW2", "kind": "assignment", "date": "2026-02-30"}]}] * 2
assert c.post("/api/planning/e1", json={"text": "cw2 due 30 feb", "mode": "deadlines", "today": "2026-10-31"}, headers=H).json() == {"fallback": True}
E2_IN = {"course": "LA1", "item": "Midterm", "kind": "exam", "due": "2026-11-12"}
fake.replies = [{"questions": ["Which topics came up most in past papers?", "When will you do a timed paper?"]}]
q1 = c.post("/api/planning/e2", json=E2_IN, headers=H).json()
q2 = c.post("/api/planning/e2", json=E2_IN, headers=H).json()
assert q1 == q2 and len(q1["questions"]) == 2

print("planning_elm: all checks passed")
