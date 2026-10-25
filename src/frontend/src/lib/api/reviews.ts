"use server";
import type { components } from "@/types/generated/api";
import { apiFetch, ApiError } from "./client";

export type ReviewItem = components["schemas"]["ReviewQueueItem"];
export type ReviewDetails = components["schemas"]["ReviewDetail"];
export type HistoryItem = components["schemas"]["ReviewHistoryItem"];
export type Result<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: string; status: number };
async function result<T>(request: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await request() };
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "The request failed. Please retry.",
      status: error instanceof ApiError ? error.status : 503,
    };
  }
}

export async function listReviewCandidates(
  type = "",
  status = "",
  cursor = "",
) {
  const query = new URLSearchParams({ limit: "25" });
  if (type) query.set("resource_type", type);
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  return result(() =>
    apiFetch<components["schemas"]["ReviewQueue"]>(`/reviews?${query}`),
  );
}

export async function getReviewCandidate(item: ReviewItem) {
  return result(() =>
    apiFetch<ReviewDetails>(
      `/reviews/${item.resource_type}/${encodeURIComponent(item.resource_id)}?resource_version=${item.resource_version}`,
    ),
  );
}

export async function getReviewHistory(item: ReviewItem) {
  return result(() =>
    apiFetch<components["schemas"]["ReviewHistory"]>(
      `/reviews/${item.resource_type}/${encodeURIComponent(item.resource_id)}/history`,
    ),
  );
}

export async function submitReviewDecision(
  item: ReviewItem,
  decision: "approved" | "rejected",
  reason: string,
) {
  return result(() =>
    apiFetch<components["schemas"]["ReviewDecision"]>(
      `/reviews/${item.resource_type}/${encodeURIComponent(item.resource_id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          contract_version: "1.0",
          resource_version: item.resource_version,
          decision,
          reason,
        }),
      },
    ),
  );
}
