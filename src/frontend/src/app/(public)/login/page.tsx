import { AuthForm } from "@/components/auth/auth_form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <p className="eyebrow">THE NEXT STEP STARTS HERE</p>
        <h1>
          Learning built on
          <br />
          human judgement.
        </h1>
        <p>
          A considered space to review curriculum, verify its sources, and help
          students move forward independently.
        </p>
        <div className="intro-note">01 / Catalogue review</div>
      </section>
      <section className="card auth-card">
        <p className="eyebrow">WELCOME BACK</p>
        <h2>Sign in to Socratix</h2>
        <p className="muted">Use your email and password to continue.</p>
        {notice === "password-updated" && (
          <p role="status" className="success">
            Password updated. Sign in with your new password.
          </p>
        )}
        {notice === "expired-link" && (
          <p role="alert" className="error">
            This link is invalid or expired. Request a new confirmation or
            recovery email.
          </p>
        )}
        <AuthForm mode="login" />
      </section>
    </main>
  );
}
