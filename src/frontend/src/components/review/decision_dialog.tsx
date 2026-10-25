"use client";
import { useState } from "react";

export function DecisionDialog({
  busy,
  blocked,
  onDecision,
}: {
  busy: boolean;
  blocked: boolean;
  onDecision: (decision: "approved" | "rejected", reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <section>
      <h3 className="section-label">Record your decision</h3>
      <div className="decision-form">
        <label>
          Reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain the evidence behind your decision…"
            maxLength={4000}
            required
          />
        </label>
        <p className="small muted">
          Your name, the candidate version and this reason are saved in the
          review history.
        </p>
        <div className="inline-actions">
          <button
            disabled={busy || blocked || !reason.trim()}
            onClick={() => onDecision("approved", reason.trim())}
          >
            Approve candidate
          </button>
          <button
            className="danger"
            disabled={busy || !reason.trim()}
            onClick={() => onDecision("rejected", reason.trim())}
          >
            Reject candidate
          </button>
        </div>
      </div>
    </section>
  );
}
