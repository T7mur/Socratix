import { AuthForm } from "@/components/auth/auth_form";
export default function Register() {
  return (
    <main className="narrow">
      <section className="card">
        <p className="eyebrow">JOIN SOCRATIX</p>
        <h1>Create your account</h1>
        <p className="muted">
          New accounts begin as students. Reviewer access is assigned
          separately.
        </p>
        <AuthForm mode="register" />
      </section>
    </main>
  );
}
