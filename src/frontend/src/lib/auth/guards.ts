import "server-only";
import { redirect } from "next/navigation";
import type { components } from "@/types/generated/api";
import { createClient } from "./server";
import { apiFetch } from "@/lib/api/client";

export async function getCurrentUser() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export async function requireAdmin() {
  if (!(await getCurrentUser())) redirect("/login");
  const profile = await apiFetch<components["schemas"]["UserProfile"]>("/me");
  if (!profile.is_active || profile.role !== "admin")
    redirect("/account?notice=review-access");
  return profile;
}
