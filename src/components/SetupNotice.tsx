// Shown instead of the app when the browser-side Supabase env vars
// aren't set — see the note in lib/supabase.ts for why this trips
// people up. Without this, main.tsx would import a module chain that
// throws while constructing the Supabase client, React would never
// mount, and the person would be left staring at a blank white page
// with nothing but a stack trace in the console to go on.
export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <main className="page" style={{ maxWidth: '640px' }}>
      <header className="site-header">
        <h1 className="wordmark">Proof</h1>
      </header>

      <div className="login-card">
        <h2 className="section-heading">Almost there</h2>
        <p className="section-sub">
          The app can't reach Supabase yet — the browser is missing{' '}
          {missing.length === 1 ? 'a value' : 'some values'} it needs to start.
        </p>

        <p className="status-note status-error" role="alert" style={{ marginTop: 'var(--space-4)' }}>
          Missing: {missing.join(', ')}
        </p>

        <div className="field-stack" style={{ marginTop: 'var(--space-5)' }}>
          <div className="field">
            <label>To fix this</label>
            <p className="field-hint" style={{ margin: 0 }}>
              1. Copy <code>.env.example</code> to <code>.env</code> in the project root, if you haven't already.
            </p>
            <p className="field-hint" style={{ margin: 0 }}>
              2. Fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from your
              Supabase project's <em>Settings → API</em> page.
            </p>
            <p className="field-hint" style={{ margin: 0 }}>
              3. Restart <code>npm run dev</code> — Vite only reads <code>.env</code> when it starts, not while it's running.
            </p>
          </div>

          <p className="field-hint">
            Heads up: this is separate from <code>.dev.vars</code>, which the backend Worker reads
            (<code>SUPABASE_URL</code> / <code>SUPABASE_ANON_KEY</code>, no <code>VITE_</code> prefix). Both files
            need the same project's URL and anon key, just under different variable names — it's easy to fill in
            one and miss the other.
          </p>
        </div>
      </div>
    </main>
  )
}
