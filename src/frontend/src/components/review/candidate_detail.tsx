import type { HistoryItem, ReviewDetails } from "@/lib/api/reviews";
import { Provenance } from "./provenance";
import { DecisionDialog } from "./decision_dialog";
import { ReviewHistory } from "./review_history";

export function CandidateDetail({
  detail,
  history,
  busy,
  onDecision,
}: {
  detail: ReviewDetails;
  history: HistoryItem[];
  busy: boolean;
  onDecision: (decision: "approved" | "rejected", reason: string) => void;
}) {
  const pending = ["proposed", "under_review"].includes(detail.approval_status);
  return (
    <article className="card detail">
      <span className="badge">
        {detail.resource_type} · version {detail.resource_version}
      </span>
      <h2>{detail.title}</h2>
      <p className="muted small">
        {detail.resource_id} · {detail.approval_status.replaceAll("_", " ")}
      </p>
      <h3 className="section-label">Candidate specification</h3>
      <pre>{JSON.stringify(detail.payload, null, 2)}</pre>
      <Provenance source={detail.source} />
      <h3 className="section-label">Deterministic checks</h3>
      {detail.validation_errors.length ? (
        <ul className="error">
          {detail.validation_errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : (
        <p className="success">
          Source and graph checks pass. A human decision is still required.
        </p>
      )}
      {pending && (
        <DecisionDialog
          key={`${detail.resource_id}:${detail.resource_version}`}
          busy={busy}
          blocked={detail.validation_errors.length > 0}
          onDecision={onDecision}
        />
      )}
      <ReviewHistory items={history} />
    </article>
  );
}
