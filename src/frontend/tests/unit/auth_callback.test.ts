import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/server", () => ({ NextResponse: { redirect: (url: URL) => ({ destination: url.toString() }) } }));
import { GET } from "@/app/auth/callback/route";

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("SITE_URL", "http://localhost:3000"); });
describe("confirmation callback", () => {
  it("exchanges the code and uses only an allowed destination", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(new Request("http://localhost:3000/auth/callback?code=test-code&next=https://evil.invalid"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("test-code");
    expect(response).toEqual({ destination: "http://localhost:3000/account" });
  });
  it.each([null, "expired"]) ("handles a missing or expired code %s", async (code) => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    const response = await GET(new Request(`http://localhost:3000/auth/callback${code ? `?code=${code}` : ""}`));
    expect(response).toEqual({ destination: "http://localhost:3000/login?notice=expired-link" });
  });
  it("handles a provider exception without exposing the callback code", async () => {
    auth.exchangeCodeForSession.mockRejectedValue(new Error("private provider body"));
    expect(await GET(new Request("http://localhost:3000/auth/callback?code=private-code")))
      .toEqual({ destination: "http://localhost:3000/login?notice=expired-link" });
  });
});
