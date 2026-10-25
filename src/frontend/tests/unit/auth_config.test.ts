import { afterEach, describe, expect, it, vi } from "vitest";
import { authConfig } from "@/lib/auth/config";

afterEach(() => vi.unstubAllEnvs());
describe("public auth configuration", () => {
  it("accepts an HTTPS Auth origin and publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(authConfig().url).toBe("https://example.supabase.co");
  });
  it.each(["postgresql://user:password@db.example/postgres", "https://user:password@example.com", "http://example.com"]) (
    "rejects unsafe browser URL %s without echoing it", (url) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
      expect(() => authConfig()).toThrow("HTTPS Supabase Auth origin");
    });
  it("rejects server secret keys", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_private");
    expect(() => authConfig()).toThrow("publishable key");
  });
});
