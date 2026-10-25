"use client";
import { useActionState } from "react";
import Link from "next/link";
import {
  signIn,
  signUp,
  requestPasswordReset,
  updatePassword,
  type AuthState,
} from "@/lib/auth/actions";

const actions = {
  login: signIn,
  register: signUp,
  forgot: requestPasswordReset,
  reset: updatePassword,
};
const labels = {
  login: "Sign in",
  register: "Create account",
  forgot: "Send recovery link",
  reset: "Save new password",
};
export function AuthForm({ mode }: { mode: keyof typeof actions }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    actions[mode],
    {},
  );
  return (
    <form action={action} className="stack">
      {mode === "register" && (
        <label>
          Your name
          <input
            name="displayName"
            autoComplete="name"
            required
            maxLength={200}
          />
        </label>
      )}
      {mode !== "reset" && (
        <label>
          Email address
          <input name="email" type="email" autoComplete="email" required />
        </label>
      )}
      {mode !== "forgot" && (
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={mode === "login" ? 1 : 12}
            maxLength={128}
          />
        </label>
      )}
      {["register", "reset"].includes(mode) && (
        <>
          <p className="muted small">Use 12–128 characters.</p>
          <label>
            Confirm password
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
        </>
      )}
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="success">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Please wait…" : labels[mode]}
      </button>
      <div className="form-links">
        <Link href="/login">Sign in</Link>
        <Link href="/register">Create account</Link>
        <Link href="/forgot-password">Forgot password?</Link>
      </div>
    </form>
  );
}
