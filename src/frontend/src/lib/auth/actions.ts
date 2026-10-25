"use server";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import { passwordError } from "./validation";

export type AuthState = { error?: string; message?: string };
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
function siteUrl() {
  const value = process.env.SITE_URL;
  if (!value) throw new Error("SITE_URL is not configured");
  return value.replace(/\/$/, "");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const password = text(form, "password");
  const validation = passwordError(password, text(form, "confirmation"));
  if (validation) return { error: validation };
  try {
    const client = await createClient();
    const { error } = await client.auth.signUp({
      email: text(form, "email").trim(),
      password,
      options: {
        emailRedirectTo: `${siteUrl()}/auth/callback?next=/account`,
        data: { display_name: text(form, "displayName").trim().slice(0, 200) },
      },
    });
    if (error)
      return {
        error:
          "Registration could not be completed. Please retry or use password recovery.",
      };
    return {
      message:
        "Check your email to confirm your account. If you already have an account, sign in or reset your password.",
    };
  } catch {
    return {
      error:
        "Authentication is unavailable or not configured. Please retry later.",
    };
  }
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword({
      email: text(form, "email").trim(),
      password: text(form, "password"),
    });
    if (error)
      return {
        error: "Unable to sign in. Check your details and confirm your email.",
      };
  } catch {
    return {
      error:
        "Authentication is unavailable or not configured. Please retry later.",
    };
  }
  redirect("/account");
}

export async function signOut() {
  const client = await createClient();
  await client.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function requestPasswordReset(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  try {
    const client = await createClient();
    const { error } = await client.auth.resetPasswordForEmail(
      text(form, "email").trim(),
      {
        redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
      },
    );
    if (error?.status === 429)
      return { error: "Too many recovery requests. Please wait and retry." };
    if (error?.status && error.status >= 500)
      return {
        error:
          "Password recovery is temporarily unavailable. Please retry later.",
      };
    return {
      message:
        "If an account exists for that email, a recovery link will arrive shortly. Check your inbox and spam folder.",
    };
  } catch {
    return {
      error:
        "Password recovery is temporarily unavailable. Please retry later.",
    };
  }
}

export async function updatePassword(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const password = text(form, "password");
  const validation = passwordError(password, text(form, "confirmation"));
  if (validation) return { error: validation };
  try {
    const client = await createClient();
    const { data } = await client.auth.getUser();
    if (!data.user)
      return {
        error: "This recovery session has expired. Request a new link.",
      };
    const { error } = await client.auth.updateUser({ password });
    if (error)
      return {
        error:
          "The password could not be updated. Request a fresh recovery link.",
      };
    await client.auth.signOut({ scope: "global" });
  } catch {
    return {
      error:
        "Password recovery is temporarily unavailable. Please retry later.",
    };
  }
  redirect("/login?notice=password-updated");
}
