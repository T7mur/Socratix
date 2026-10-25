export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("Supabase authentication is not configured");
  try {
    const origin = new URL(url);
    if (origin.protocol !== "https:" || origin.username || origin.password ||
        origin.search || origin.hash || origin.pathname !== "/") throw new Error();
    let publicKey = key.startsWith("sb_publishable_");
    if (!publicKey && key.split(".").length === 3) {
      const payload = key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
      publicKey = JSON.parse(atob(payload)).role === "anon";
    }
    if (!publicKey) throw new Error();
  } catch {
    throw new Error("Configure the HTTPS Supabase Auth origin and a publishable key");
  }
  return { url, key };
}
