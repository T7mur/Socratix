import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: state.createServerClient }));
vi.mock("@/lib/auth/config", () => ({ authConfig: () => ({ url: "https://example.supabase.co", key: "public-test" }) }));
vi.mock("next/server", () => ({ NextResponse: { next: () => ({
  cookies: { set: vi.fn() }, headers: new Headers(),
}) } }));
import { updateSession } from "@/lib/auth/session";
import type { NextRequest } from "next/server";

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test"); });
describe("session refresh", () => {
  it("carries refreshed cookies to the request and response and disables caching", async () => {
    const cookies = { getAll: vi.fn(() => [{ name: "existing", value: "old" }]), set: vi.fn() };
    state.createServerClient.mockImplementation((_url, _key, options) => ({ auth: {
      getClaims: async () => { expect(options.cookies.getAll()).toEqual([{ name: "existing", value: "old" }]);
        options.cookies.setAll([{ name: "session", value: "refreshed", options: { httpOnly: true } }]); },
    } }));
    const response = await updateSession({ cookies } as unknown as NextRequest);
    expect(cookies.set).toHaveBeenCalledWith("session", "refreshed");
    expect(response.cookies.set).toHaveBeenCalledWith("session", "refreshed", { httpOnly: true });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
