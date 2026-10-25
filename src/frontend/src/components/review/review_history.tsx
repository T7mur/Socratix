import type { HistoryItem } from "@/lib/api/reviews";

export function ReviewHistory({ items }: { items: HistoryItem[] }) {
  return (
    <section>
      <h3 className="section-label">Decision history</h3>
      {items.length ? (
        <ol className="history">
          {items.map((item) => (
            <li key={item.review_id}>
              <span className="badge">{item.decision}</span> · version{" "}
              {item.resource_version}
              <p>{item.reason}</p>
              <p className="small muted">
                {new Date(item.decided_at).toLocaleString()} ·{" "}
                {item.reviewer_id}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">
          No decisions have been recorded for this candidate.
        </p>
      )}
    </section>
  );
}
