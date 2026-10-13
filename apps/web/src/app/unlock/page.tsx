/**
 * Unlock landing when WEB_AUTH_TOKEN is set and the session cookie is missing.
 * AuthGate in the root layout owns the form; this page only redirects after unlock.
 */
export default function UnlockPage() {
  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      <p className="eyebrow">Access</p>
      <h1>Unlock required</h1>
      <p className="hint">
        Enter the access token above (or in the unlock form) to open
        SkillEvalator. Protected pages do not render until the session cookie is
        set.
      </p>
    </div>
  );
}
