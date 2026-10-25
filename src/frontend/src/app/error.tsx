"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="narrow">
      <section className="card">
        <h1>We couldn’t load this workspace</h1>
        <p>
          The service may be unavailable. Your saved decisions remain in the
          database.
        </p>
        <button onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
