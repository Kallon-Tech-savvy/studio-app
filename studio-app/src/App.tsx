import { useEffect, useState } from 'react'

type Gallery = {
  id: string
  title: string
  cover_path: string | null
  created_at: string
}

export default function App() {
  const [galleries, setGalleries] = useState<Gallery[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/galleries')
      .then((res) => res.json())
      .then((body) => {
        if (body.error) setError(body.error)
        else setGalleries(body.galleries)
      })
      .catch((err) => setError(String(err)))
  }, [])

  return (
    <main className="wiring-check">
      <h1>Studio</h1>
      <p>
        This page just proves the Worker → Supabase → Redis wiring works.
        It's not the real design — ask for the gallery UI as a follow-up.
      </p>

      {error && <p className="error">Error: {error}</p>}
      {!error && !galleries && <p>Loading galleries…</p>}
      {galleries?.length === 0 && <p>No public galleries yet — add one via the schema in supabase/schema.sql.</p>}
      {galleries && galleries.length > 0 && (
        <ul>
          {galleries.map((g) => (
            <li key={g.id}>{g.title}</li>
          ))}
        </ul>
      )}
    </main>
  )
}
