import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { requestPasswordReset, signUp } from "@/lib/auth/actions";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("Auth server action boundaries", () => {
  it("never sends a signup role from user input", async () => {
    vi.stubEnv("SITE_URL", "https://example.invalid");
    auth.signUp.mockResolvedValue({ error: null });
    const form = new FormData();
    for (const [key, value] of Object.entries({
      email: "test@example.invalid",
      password: "a-long-password",
      confirmation: "a-long-password",
      displayName: "Student",
      role: "admin",
    }))
      form.set(key, value);
    const result = await signUp({}, form);
    expect(result.message).toContain("confirm");
    expect(auth.signUp.mock.calls[0][0].options.data).toEqual({
      display_name: "Student",
    });
  });
  it("uses a generic response for unknown recovery addresses", async () => {
    vi.stubEnv("SITE_URL", "https://example.invalid");
    auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 400 } });
    const form = new FormData();
    form.set("email", "unknown@example.invalid");
    expect((await requestPasswordReset({}, form)).message).toContain(
      "If an account exists",
    );
  });
  it("reports a provider outage without exposing its details", async () => {
    vi.stubEnv("SITE_URL", "https://example.invalid");
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { status: 503, message: "private provider details" },
    });
    const form = new FormData();
    form.set("email", "test@example.invalid");
    const result = await requestPasswordReset({}, form);
    expect(result.error).toContain("temporarily unavailable");
    expect(JSON.stringify(result)).not.toContain("private provider details");
  });
});
