import { AuthForm } from "@/components/auth/auth_form";
import { getCurrentUser } from "@/lib/auth/guards";
import Link from "next/link";
export default async function ResetPassword() {
  const user = await getCurrentUser();
  return (
    <main className="narrow">
      <section className="card">
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Choose a new password</h1>
        {user ? (
          <AuthForm mode="reset" />
        ) : (
          <p>
            This recovery session is missing or expired.{" "}
            <Link href="/forgot-password">Request a new recovery link.</Link>
          </p>
        )}
      </section>
    </main>
  );
}
