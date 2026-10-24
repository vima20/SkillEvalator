/** Shown when tip-resolved adoption mode disagrees with on-disk comparison.json. */
export function StaleComparisonJsonModeCallout({
  adoptionMode,
  comparisonJsonMode,
}: {
  adoptionMode: string;
  comparisonJsonMode: string;
}) {
  return (
    <div className="panel callout-warn" style={{ marginTop: "1rem" }}>
      <strong>Stale comparison.json mode on disk</strong>
      <p>
        Adoption mode is <code>{adoptionMode}</code> from tip legs; stored{" "}
        <code>comparison.json</code> mode is still{" "}
        <code>{comparisonJsonMode}</code>. Exports and UI gates use tip
        resolution (same as <code>MANIFEST</code> in pilot archive).
      </p>
    </div>
  );
}
