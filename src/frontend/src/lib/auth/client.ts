import { createBrowserClient } from "@supabase/ssr";
import { authConfig } from "./config";

export function createClient() {
  const { url, key } = authConfig();
  return createBrowserClient(url, key);
}
