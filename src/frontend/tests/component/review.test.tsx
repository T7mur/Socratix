import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DecisionDialog } from "@/components/review/decision_dialog";
import { CandidateDetail } from "@/components/review/candidate_detail";
import type { ReviewDetails } from "@/lib/api/reviews";

describe("review safeguards", () => {
  it("requires a reason and blocks approval when deterministic checks fail", () => {
    const decide = vi.fn();
    render(<DecisionDialog busy={false} blocked={true} onDecision={decide} />);
    expect(
      screen.getByRole("button", { name: "Approve candidate" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reject candidate" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Missing provenance" },
    });
    expect(
      screen.getByRole("button", { name: "Approve candidate" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reject candidate" }));
    expect(decide).toHaveBeenCalledWith("rejected", "Missing provenance");
  });
  it("renders candidate text without interpreting HTML", () => {
    const detail = {
      resource_type: "skill",
      resource_id: "python.test",
      resource_version: 1,
      approval_status: "proposed",
      title: "<script>evil()</script>",
      created_at: "2026-10-25T12:00:00Z",
      payload: { skill_id: "python.test" },
      source: { uri: "https://example.invalid" },
      validation_errors: [],
    } as unknown as ReviewDetails;
    const view = render(
      <CandidateDetail
        detail={detail}
        history={[]}
        busy={false}
        onDecision={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "<script>evil()</script>" }),
    ).toBeInTheDocument();
    expect(view.container.querySelector("script")).toBeNull();
  });
});
