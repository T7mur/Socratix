import { ApprovalQueue } from "@/components/review/approval_queue";
import { signOut } from "@/lib/auth/actions";
export default function Review() {
  return (
    <main className="workspace">
      <div className="workspace-head">
        <div>
          <p className="eyebrow">CATALOGUE / ADMINISTRATION</p>
          <h1>Review with confidence.</h1>
          <p className="muted">
            Every approved skill begins with a source and a human decision.
          </p>
        </div>
        <form action={signOut}>
          <button className="secondary">Sign out</button>
        </form>
      </div>
      <ApprovalQueue />
    </main>
  );
}
