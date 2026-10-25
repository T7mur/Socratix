"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  getReviewCandidate,
  getReviewHistory,
  listReviewCandidates,
  submitReviewDecision,
  type HistoryItem,
  type ReviewDetails,
  type ReviewItem,
} from "@/lib/api/reviews";
import { CandidateDetail } from "./candidate_detail";

export function ApprovalQueue() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [detail, setDetail] = useState<ReviewDetails | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const selection = useRef(0);
  const request = useRef(0);

  async function load(next = "", append = false) {
    const generation = ++request.current;
    const result = await listReviewCandidates(type, status, next);
    if (generation !== request.current) return;
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setItems((previous) =>
      append ? [...previous, ...result.data.items] : result.data.items,
    );
    setCursor(result.data.next_cursor ?? null);
  }
  useEffect(() => {
    selection.current++;
    setDetail(null);
    setHistory([]);
    setError("");
    startTransition(async () => {
      await load();
    });
    return () => {
      request.current++;
      selection.current++;
    };
    // Filters deliberately replace the queue and cancel stale responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, status]);

  function select(item: ReviewItem) {
    const generation = ++selection.current;
    setDetail(null);
    setHistory([]);
    setError("");
    setMessage("");
    startTransition(async () => {
      const [candidate, decisions] = await Promise.all([
        getReviewCandidate(item),
        getReviewHistory(item),
      ]);
      if (generation !== selection.current) return;
      if (candidate.error !== undefined) {
        setError(candidate.error);
        return;
      }
      if (decisions.error !== undefined) {
        setError(decisions.error);
        return;
      }
      setDetail(candidate.data);
      setHistory(decisions.data.items);
    });
  }

  function decide(decision: "approved" | "rejected", reason: string) {
    if (!detail) return;
    const reviewed = detail;
    startTransition(async () => {
      setError("");
      const result = await submitReviewDecision(reviewed, decision, reason);
      if (result.error !== undefined) {
        setError(
          result.status === 409
            ? "This candidate changed while you were reviewing. Select it again to see the latest state."
            : result.error,
        );
        if (result.status === 409) {
          selection.current++;
          setDetail(null);
          await load();
        }
        return;
      }
      selection.current++;
      setDetail(null);
      setHistory([]);
      setMessage(`Decision saved: ${decision}.`);
      await load();
    });
  }
  return (
    <>
      <div aria-live="polite">
        {error && (
          <p className="error" role="alert">
            {error}{" "}
            <button
              className="secondary"
              onClick={() =>
                startTransition(async () => {
                  setError("");
                  await load();
                })
              }
            >
              Refresh queue
            </button>
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
      </div>
      <div className="review-grid" style={{ marginTop: 18 }}>
        <aside className="card queue">
          <h3>Review queue</h3>
          <p className="small muted">
            Inspect the source. Check the proposal. Record a reason.
          </p>
          <div className="filters">
            <label>
              Type
              <select
                aria-label="Candidate type"
                disabled={pending}
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">All types</option>
                <option value="skill">Skills</option>
                <option value="relation">Relationships</option>
                <option value="outcome">Outcomes</option>
              </select>
            </label>
            <label>
              Status
              <select
                aria-label="Candidate status"
                disabled={pending}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
          <p className="small muted">
            {pending ? "Loading…" : `${items.length} candidates loaded`}
          </p>
          <div className="queue-list">
            {items.map((item) => (
              <button
                className="queue-item"
                key={`${item.resource_type}:${item.resource_id}:${item.resource_version}`}
                aria-current={
                  detail?.resource_id === item.resource_id &&
                  detail?.resource_type === item.resource_type
                }
                disabled={pending}
                onClick={() => select(item)}
              >
                <span className="badge">{item.resource_type}</span>
                <strong>{item.title}</strong>
                <small>
                  {item.resource_id}
                  <br />
                  Version {item.resource_version} ·{" "}
                  {item.approval_status.replaceAll("_", " ")}
                </small>
              </button>
            ))}
          </div>
          {!items.length && !pending && (
            <p className="muted">No candidates match these filters.</p>
          )}
          {cursor && (
            <button
              className="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await load(cursor, true);
                })
              }
            >
              Load more
            </button>
          )}
        </aside>
        {detail ? (
          <CandidateDetail
            detail={detail}
            history={history}
            busy={pending}
            onDecision={decide}
          />
        ) : (
          <section className="card empty">
            <p className="eyebrow">HUMAN REVIEW</p>
            <h2>
              {pending
                ? "Loading candidate…"
                : "A considered decision starts here"}
            </h2>
            <p>
              Select a candidate to inspect its specification,
              <br />
              source provenance and review history.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
