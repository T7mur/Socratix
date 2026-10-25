import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { requestPasswordReset, signIn, signOut, signUp } from "@/lib/auth/actions";
import { redirect } from "next/navigation";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("Auth server action boundaries", () => {
  const registration = () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ email: " test@example.invalid ",
      password: "a-long-password", confirmation: "a-long-password", displayName: " Student " }))
      form.set(key, value);
    return form;
  };
  it("submits signup with a confirmation callback and normalised profile text", async () => {
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    auth.signUp.mockResolvedValue({ error: null });
    expect((await signUp({}, registration())).message).toContain("Check your email");
    expect(auth.signUp).toHaveBeenCalledWith({ email: "test@example.invalid", password: "a-long-password",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=/account",
        data: { display_name: "Student" } } });
  });
  it("rejects invalid registration before contacting the provider", async () => {
    const form = registration();
    form.set("confirmation", "different-password");
    expect((await signUp({}, form)).error).toContain("match");
    expect(auth.signUp).not.toHaveBeenCalled();
  });
  it("does not expose signup provider errors", async () => {
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    auth.signUp.mockResolvedValue({ error: { message: "private provider details" } });
    expect(JSON.stringify(await signUp({}, registration()))).not.toContain("private provider");
    auth.signUp.mockRejectedValue(new Error("private exception"));
    expect((await signUp({}, registration())).error).toContain("unavailable");
  });
  it("signs in to the account and signs out of the current session", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await signIn({}, registration());
    expect(redirect).toHaveBeenCalledWith("/account");
    await signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).toHaveBeenCalledWith("/login");
  });
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
