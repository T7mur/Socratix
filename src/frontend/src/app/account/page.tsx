import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth/actions";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/types/generated/api";

export const dynamic = "force-dynamic";
export default async function Account() {
  if (!(await getCurrentUser())) redirect("/login");
  const profile = await apiFetch<components["schemas"]["UserProfile"]>("/me");
  return (
    <main className="narrow">
      <section className="card stack">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Welcome, {profile.display_name}</h1>
        <span className="badge">{profile.role}</span>
        {profile.role === "admin" ? (
          <Link className="button" href="/review">
            Open catalogue review →
          </Link>
        ) : (
          <p>
            Your student account is ready. Catalogue review is available to
            authorised administrators.
          </p>
        )}
        <form action={signOut}>
          <button className="secondary">Sign out</button>
        </form>
      </section>
    </main>
  );
}
