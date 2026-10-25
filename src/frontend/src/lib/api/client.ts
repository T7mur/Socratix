import "server-only";
import { createClient } from "@/lib/auth/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const client = await createClient();
  const { data } = await client.auth.getSession();
  if (!data.session) throw new ApiError(401, "Please sign in again.");
  const base = process.env.API_BASE_URL;
  if (!base) throw new ApiError(503, "The application API is not configured.");
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });
  } catch {
    throw new ApiError(
      503,
      "The application API is unavailable. Please retry.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      typeof body.detail === "string"
        ? body.detail
        : "The request could not be completed.",
    );
  }
  return response.json() as Promise<T>;
}
