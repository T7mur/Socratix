export function Provenance({ source }: { source: Record<string, unknown> }) {
  return (
    <section>
      <h3 className="section-label">Source provenance</h3>
      <dl>
        {Object.entries(source).map(([key, value]) => (
          <div key={key}>
            <dt className="muted small">{key.replaceAll("_", " ")}</dt>
            <dd
              style={{
                margin: "0 0 10px",
                overflowWrap: "anywhere",
                fontSize: 13,
              }}
            >
              {String(value ?? "—")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
