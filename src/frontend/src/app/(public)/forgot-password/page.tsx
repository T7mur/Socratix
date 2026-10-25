import { AuthForm } from "@/components/auth/auth_form";
export default function ForgotPassword() {
  return (
    <main className="narrow">
      <section className="card">
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Forgot your password?</h1>
        <p className="muted">We’ll email a link to help you get back in.</p>
        <AuthForm mode="forgot" />
      </section>
    </main>
  );
}
