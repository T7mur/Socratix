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
      {!!detail.evidence?.length && (
        <section aria-label="Candidate evidence">
          <h3 className="section-label">Evidence for this proposal</h3>
          {detail.evidence.map((item) => (
            <div key={`${item.run_id}:${item.chunk_id}:${item.span_id}`}>
              <span className="badge">
                {item.evidence_kind === "ai_inferred" ? "AI inferred · requires human judgement" : "Direct source"}
              </span>
              <p>{item.section}{item.page ? ` · page ${item.page}` : ""}</p>
              {item.excerpt && <blockquote style={{ whiteSpace: "pre-wrap" }}>{item.excerpt}</blockquote>}
              <p>{item.rationale}</p>
              {!!item.review_flags?.length && <ul className="error">
                {item.review_flags.map((flag, index) => <li key={index}>{flag}</li>)}
              </ul>}
            </div>
          ))}
        </section>
      )}
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
