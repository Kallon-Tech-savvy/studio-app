import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { AuthedImage } from './AuthedImage'
import type {
  Album,
  Client,
  Gallery,
  Log,
  Photo,
  StaffMember,
  UploadQueueItem,
} from './types'
import { selectFinancialSummary } from './domain/finance'
import { getGalleryAccessState, GALLERY_ACCESS_LABELS, getPaymentStatus } from './domain/gallery'


// ── Beautiful SVG Icons ──────────────────────────────────────────
const DashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="7" height="9" x="3" y="3" rx="1"/>
    <rect width="7" height="5" x="14" y="3" rx="1"/>
    <rect width="7" height="9" x="14" y="12" rx="1"/>
    <rect width="7" height="5" x="3" y="16" rx="1"/>
  </svg>
)

const CameraIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
    <circle cx="12" cy="13" r="3"/>
  </svg>
)

const UsersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const ScrollIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
  </svg>
)

const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>
  </svg>
)

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

export function AdminPanel({ session, staff }: { session: Session; staff: StaffMember }) {
  const canManageStaff = Boolean(staff.permissions.manageStaff)
  const canManageGalleries = Boolean(staff.permissions.manageGalleries)
  const canUploadPhotos = Boolean(staff.permissions.uploadPhotos)
  const canViewFinances = Boolean(staff.permissions.viewFinances)

  // Navigation Tabs: dashboard | galleries | clients | logs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'galleries' | 'clients' | 'logs'>('dashboard')
  
  // Master States
  const [clients, setClients] = useState<Client[]>([])
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [logs, setLogs] = useState<Log[]>([])

  // Selected entities
  const [selectedGalleryId, setSelectedGalleryId] = useState('')
  const [selectedAlbumId, setSelectedAlbumId] = useState('')

  // Creation forms state
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '', notes: '', total_amount: 0, amount_paid: 0 })
  const [galleryForm, setGalleryForm] = useState({ title: '', description: '', is_public: false, client_id: '', downloads_enabled: true, selection_enabled: true, watermark_enabled: false, expiration_date: '', event_date: new Date().toISOString().substring(0, 10) })
  const [albumForm, setAlbumForm] = useState({ name: '', description: '' })

  // Editing gallery form state
  const [editGallery, setEditGallery] = useState<Partial<Gallery> | null>(null)
  
  // Upload and copy feedback states
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  // ── API Fetchers ────────────────────────────────────────────────
  const fetchHeaders = { Authorization: `Bearer ${session.access_token}` }

  async function loadClients() {
    const res = await fetch('/api/clients', { headers: fetchHeaders })
    if (res.ok) {
      const data = await res.json()
      setClients(data.clients ?? [])
    }
  }

  async function loadGalleries() {
    const res = await fetch('/api/studio/galleries', { headers: fetchHeaders })
    if (res.ok) {
      const data = await res.json()
      setGalleries(data.galleries ?? [])
    }
  }

  async function loadAlbums(galleryId: string) {
    if (!galleryId) {
      setAlbums([])
      return
    }
    const res = await fetch(`/api/galleries/${galleryId}/albums`, { headers: fetchHeaders })
    if (res.ok) {
      const data = await res.json()
      setAlbums(data.albums ?? [])
    }
  }

  async function loadPhotos(galleryId: string) {
    if (!galleryId) {
      setPhotos([])
      return
    }
    const res = await fetch(`/api/galleries/${galleryId}/photos`, { headers: fetchHeaders })
    if (res.ok) {
      const data = await res.json()
      setPhotos(data.photos ?? [])
    }
  }

  async function loadLogs() {
    const res = await fetch('/api/studio/logs', { headers: fetchHeaders })
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs ?? [])
    }
  }

  useEffect(() => {
    // Keep sensitive datasets out of the browser for staff who cannot view them.
    if (canViewFinances) loadClients()
    loadGalleries()
    if (canManageStaff) loadLogs()
  }, [canViewFinances, canManageStaff])

  useEffect(() => {
    loadAlbums(selectedGalleryId)
    loadPhotos(selectedGalleryId)
  }, [selectedGalleryId])

  useEffect(() => {
    const gallery = galleries.find(g => g.id === selectedGalleryId)
    if (gallery) {
      setEditGallery(gallery)
    } else {
      setEditGallery(null)
    }
  }, [selectedGalleryId, galleries])

  // ── Operations ──────────────────────────────────────────────────

  // Client actions
  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault()
    setStatus('Developing client profile…')
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(clientForm),
    })
    if (res.ok) {
      setStatus(`Client profile for "${clientForm.name}" created successfully.`)
      setClientForm({ name: '', email: '', phone: '', notes: '', total_amount: 0, amount_paid: 0 })
      await loadClients()
      await loadLogs()
    } else {
      const body = await res.json()
      setStatus(`Error: ${body.error}`)
    }
  }

  async function handleDeleteClient(clientId: string) {
    if (!confirm('Are you sure you want to permanently delete this client and unlink their shoots?')) return
    setStatus('Archiving client record…')
    const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE', headers: fetchHeaders })
    if (res.ok) {
      setStatus('Client profile permanently deleted.')
      await loadClients()
      await loadGalleries()
      await loadLogs()
    } else {
      setStatus('Failed to delete client.')
    }
  }

  // Gallery actions
  async function handleCreateGallery(e: React.FormEvent) {
    e.preventDefault()
    setStatus('Creating shooting roll…')
    const res = await fetch('/api/galleries', {
      method: 'POST',
      headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(galleryForm),
    })
    const body = await res.json()
    if (res.ok) {
      setStatus(`New roll created: "${galleryForm.title}"`)
      setGalleryForm({ title: '', description: '', is_public: false, client_id: '', downloads_enabled: true, selection_enabled: true, watermark_enabled: false, expiration_date: '', event_date: new Date().toISOString().substring(0, 10) })
      await loadGalleries()
      await loadLogs()
      setSelectedGalleryId(body.gallery.id)
    } else {
      setStatus(`Error: ${body.error}`)
    }
  }

  async function handleUpdateGallery(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedGalleryId || !editGallery) return
    setStatus('Saving gallery settings…')
    const res = await fetch(`/api/galleries/${selectedGalleryId}`, {
      method: 'PATCH',
      headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(editGallery),
    })
    if (res.ok) {
      setStatus('Gallery settings saved.')
      await loadGalleries()
      await loadLogs()
    } else {
      setStatus('Error updating gallery details.')
    }
  }

  async function handleDeleteGallery(galleryId: string) {
    if (!confirm('Are you sure you want to permanently delete this gallery and all of its storage photos? This cannot be undone.')) return
    setStatus('Deleting gallery…')
    const res = await fetch(`/api/galleries/${galleryId}`, { method: 'DELETE', headers: fetchHeaders })
    if (res.ok) {
      setStatus('Gallery and master objects deleted successfully.')
      setSelectedGalleryId('')
      await loadGalleries()
      await loadLogs()
    } else {
      setStatus('Failed to delete gallery.')
    }
  }

  // Revoke private link
  async function handleRevokeLink(galleryId: string) {
    if (!confirm('Revoke access? The link will immediately stop working for the client.')) return
    setStatus('Revoking private token…')
    const res = await fetch(`/api/galleries/${galleryId}/revoke`, { method: 'POST', headers: fetchHeaders })
    if (res.ok) {
      setStatus('Private link revoked. Gallery status is now DISABLED.')
      await loadGalleries()
      await loadLogs()
    }
  }

  // Regenerate link
  async function handleRegenerateLink(galleryId: string) {
    if (!confirm('Regenerate private link? All previous shared URLs will become invalid.')) return
    setStatus('Regenerating private token…')
    const res = await fetch(`/api/galleries/${galleryId}/regenerate`, { method: 'POST', headers: fetchHeaders })
    if (res.ok) {
      setStatus('Fresh private link generated completely.')
      await loadGalleries()
      await loadLogs()
    }
  }

  // Album actions
  async function handleCreateAlbum(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedGalleryId) return
    setStatus('Creating organized album…')
    const res = await fetch(`/api/galleries/${selectedGalleryId}/albums`, {
      method: 'POST',
      headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(albumForm),
    })
    if (res.ok) {
      setStatus(`Album "${albumForm.name}" added successfully.`)
      setAlbumForm({ name: '', description: '' })
      await loadAlbums(selectedGalleryId)
      await loadLogs()
    }
  }

  async function handleDeleteAlbum(albumId: string) {
    if (!confirm('Permanently delete this album grouping? (Photos inside will remain, but lose album tagging)')) return
    setStatus('Archiving album…')
    const res = await fetch(`/api/galleries/${selectedGalleryId}/albums/${albumId}`, { method: 'DELETE', headers: fetchHeaders })
    if (res.ok) {
      setStatus('Album deleted.')
      await loadAlbums(selectedGalleryId)
    }
  }

  // Photo actions
  async function handleUploadPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0 || !selectedGalleryId) return

    const queue = files.map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      filename: file.name,
      status: 'pending' as const,
    }))
    setUploadQueue(queue)
    let uploadedCount = 0

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const queueId = queue[i].id
        setStatus(`Developing frame ${i + 1} of ${files.length} — ${file.name}…`)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('album_id', selectedAlbumId || '')
        formData.append('sort_order', String(i))
        formData.append('size', String(file.size))

        const res = await fetch(`/api/galleries/${selectedGalleryId}/photos`, {
          method: 'POST',
          headers: fetchHeaders,
          body: formData,
        })

        if (!res.ok) {
          let message = 'Upload failed.'
          try {
            const body = await res.json()
            message = body.error || message
          } catch {
            // Keep the generic message when the API did not return JSON.
          }
          setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'failed' } : item))
          setStatus(`Stopped uploading at file "${file.name}": ${message}`)
          await loadPhotos(selectedGalleryId)
          await loadGalleries()
          return
        }

        uploadedCount++
        setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'success' } : item))
      }

      setStatus(`Succeeded! Loaded ${uploadedCount} high-res master frames.`)
      await loadPhotos(selectedGalleryId)
      await loadGalleries()
      await loadLogs()
    } catch (error) {
      setStatus(`Upload failed: ${error instanceof Error ? error.message : 'Network error.'}`)
    } finally {
      e.target.value = ''
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!confirm('Permanently delete this photographic master and all optimized previews? This cannot be undone.')) return
    setStatus('Deleting photo…')
    const res = await fetch(`/api/galleries/${selectedGalleryId}/photos/${photoId}`, {
      method: 'DELETE',
      headers: fetchHeaders
    })
    if (res.ok) {
      setStatus('Photo permanently removed from storage.')
      await loadPhotos(selectedGalleryId)
      await loadGalleries()
      await loadLogs()
    } else {
      setStatus('Failed to delete photo.')
    }
  }

  async function handleAssignPhotoAlbum(photoId: string, albumId: string) {
    const { error } = await supabase
      .from('photos')
      .update({ album_id: albumId || null })
      .eq('id', photoId)
    
    if (!error) {
      await loadPhotos(selectedGalleryId)
      setStatus('Photo album assignment updated.')
    } else {
      setStatus(`Failed to update album assignment: ${error.message}`)
    }
  }
  
  async function handleSendClientEmail(galleryId: string) {
    setStatus('Dispatching private gallery link via email…')
    try {
      const res = await fetch(`/api/galleries/${galleryId}/send-email`, {
        method: 'POST',
        headers: fetchHeaders,
      })
      const body = await res.json().catch(() => ({}))

      if (res.ok) {
        setStatus(body.message || 'Gallery link successfully sent to client.')
        await loadLogs()
      } else {
        setStatus(`Email error: ${body.error || 'Unable to send gallery email.'}`)
      }
    } catch (error) {
      setStatus(`Email error: ${error instanceof Error ? error.message : 'Network error.'}`)
    }
  }

  const handleCopyLink = async (token: string) => {
    const url = `${window.location.origin}/g/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedToken(token)
      setStatus('Private access link copied to clipboard.')
      setTimeout(() => setCopiedToken(null), 3000)
    } catch {
      setStatus(`Direct link: ${url}`)
    }
  }

  // ── Derived indexes ────────────────────────────────────────────
  // Build once after data loads. O(n) to build, O(1) per lookup.
  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  )

  // ── Financial summary (single pass) ───────────────────────────
  const { totalRevenue, totalReceived, totalOutstanding } = useMemo(
    () => selectFinancialSummary(clients),
    [clients],
  )

  return (
    <section className="darkroom" style={{ background: 'var(--cream-card)', padding: '24px', border: '1.5px solid var(--charcoal)', borderRadius: '12px' }}>
      {/* Darkroom Header Bar with User Info & Sign Out */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1.5px solid var(--charcoal)', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--olive)', letterSpacing: '1px', fontWeight: 600 }}>
            Darkroom Workspace
          </span>
          <h2 className="section-heading" style={{ margin: '2px 0 0 0', fontSize: '1.4rem' }}>
            Welcome back, {staff.name || staff.email.split('@')[0]}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '4px 12px',
            borderRadius: '16px',
            border: '1.5px solid var(--charcoal)',
            background: staff.role === 'owner' ? '#111' : 'var(--olive-pale)',
            color: staff.role === 'owner' ? '#FFF' : 'var(--charcoal)',
            letterSpacing: '0.5px'
          }}>
            {staff.role}
          </span>
          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ fontSize: '0.75rem', padding: '6px 14px', borderRadius: '20px' }} 
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Tab Navigation header */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--charcoal)', marginBottom: '24px', gap: '8px', flexWrap: 'wrap', paddingBottom: '12px' }}>
        <button 
          className={`btn ${activeTab === 'dashboard' ? '' : 'btn-secondary'}`} 
          style={{ borderRadius: '20px', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', border: '1.5px solid var(--charcoal)', fontSize: '0.8rem' }}
          onClick={() => { setActiveTab('dashboard'); setStatus(null); }}
        >
          <DashIcon /> Dashboard
        </button>
        <button 
          className={`btn ${activeTab === 'galleries' ? '' : 'btn-secondary'}`} 
          style={{ borderRadius: '20px', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', border: '1.5px solid var(--charcoal)', fontSize: '0.8rem' }}
          onClick={() => { setActiveTab('galleries'); setStatus(null); }}
        >
          <CameraIcon /> Galleries ({galleries.length})
        </button>
        {canViewFinances && (
          <button 
            className={`btn ${activeTab === 'clients' ? '' : 'btn-secondary'}`} 
            style={{ borderRadius: '20px', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', border: '1.5px solid var(--charcoal)', fontSize: '0.8rem' }}
            onClick={() => { setActiveTab('clients'); setStatus(null); }}
          >
            <UsersIcon /> Clients ({clients.length})
          </button>
        )}
        {canManageStaff && (
          <button 
            className={`btn ${activeTab === 'logs' ? '' : 'btn-secondary'}`} 
            style={{ borderRadius: '20px', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', border: '1.5px solid var(--charcoal)', fontSize: '0.8rem' }}
            onClick={() => { setActiveTab('logs'); setStatus(null); }}
          >
            <ScrollIcon /> Audit Logs
          </button>
        )}
      </div>

      {!canManageGalleries && !canUploadPhotos && (
        <p className="status-note" style={{ marginBottom: '20px' }}>
          Your account ({staff.role}) doesn't have gallery-management or upload permissions yet.
          Ask an owner to grant access — you can still browse what's here.
        </p>
      )}

      {/* ── A. DASHBOARD VIEW ────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div>
          <h3 className="section-heading" style={{ marginBottom: '20px' }}>Studio At-A-Glance</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <div style={{ background: '#FFF', border: '1.5px solid var(--charcoal)', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 var(--charcoal)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--olive)', textTransform: 'uppercase' }}>Active Shoot Galleries</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--charcoal)', marginTop: '4px' }}>
                {galleries.filter(g => g.status === 'PUBLISHED').length}
              </div>
            </div>
            <div style={{ background: '#FFF', border: '1.5px solid var(--charcoal)', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 var(--charcoal)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--olive)', textTransform: 'uppercase' }}>Total Managed Clients</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--charcoal)', marginTop: '4px' }}>
                {clients.length}
              </div>
            </div>
            <div style={{ background: '#FFF', border: '1.5px solid var(--charcoal)', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 var(--charcoal)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--olive)', textTransform: 'uppercase' }}>Revenue Booked</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--olive)', marginTop: '8px' }}>
                NLe {totalRevenue.toLocaleString()}
              </div>
            </div>
            <div style={{ background: '#FFF', border: '1.5px solid var(--charcoal)', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 var(--charcoal)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--olive)', textTransform: 'uppercase' }}>Outstanding Balances</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#B7311F', marginTop: '8px' }}>
                NLe {totalOutstanding.toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {/* Recent Shoots Quick List */}
            <div style={{ background: '#FFF', border: '1.5px solid var(--charcoal)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '8px' }}>Recent Deliveries</h4>
              <ul className="roll-status-list" style={{ margin: 0 }}>
                {galleries.slice(0, 5).map(g => (
                  <li key={g.id}>
                    <span className={`status-dot ${g.status === 'PUBLISHED' ? 'status-dot--published' : ''}`} />
                    <span style={{ fontWeight: 600 }}>{g.title}</span>
                    <span className="status-label" style={{ fontSize: '0.65rem' }}>{g.status}</span>
                  </li>
                ))}
              </ul>
              <button className="btn btn-secondary" style={{ marginTop: '16px', fontSize: '0.75rem', padding: '6px 12px' }} onClick={() => setActiveTab('galleries')}>
                Manage All Galleries
              </button>
            </div>

            {/* Recent Audit Logs stream */}
            <div style={{ background: '#FFF', border: '1.5px solid var(--charcoal)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '8px' }}>Recent Activity Audit Trail</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                {logs.slice(0, 8).map(l => (
                  <div key={l.id} style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', borderBottom: '1px dashed rgba(0,0,0,0.05)', paddingBottom: '4px' }}>
                    <div style={{ color: 'var(--olive)', fontWeight: 600 }}>[{l.action}]</div>
                    <div style={{ color: 'var(--charcoal-light)' }}>{l.details}</div>
                    <div style={{ color: '#888', fontSize: '0.65rem' }}>{new Date(l.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── B. GALLERIES VIEW ────────────────────────────────────────── */}
      {activeTab === 'galleries' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            
            {/* Create Shoot Gallery Form */}
            {canManageGalleries && (
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusIcon /> New Photographic Shoot
                </h3>
                <form onSubmit={handleCreateGallery} className="field-stack">
                  <div className="field">
                    <label>Shoot Title</label>
                    <input 
                      value={galleryForm.title} 
                      onChange={e => setGalleryForm({ ...galleryForm, title: e.target.value })} 
                      placeholder="e.g. Marie Kamara Engagement" 
                      required 
                    />
                  </div>
                  <div className="field">
                    <label>Description / Notes</label>
                    <input 
                      value={galleryForm.description} 
                      onChange={e => setGalleryForm({ ...galleryForm, description: e.target.value })} 
                      placeholder="Brief notes about styling or shoot" 
                    />
                  </div>
                  <div className="field">
                    <label>Assign Client Profile</label>
                    <select 
                      value={galleryForm.client_id} 
                      onChange={e => setGalleryForm({ ...galleryForm, client_id: e.target.value })}
                    >
                      <option value="">Do not assign client…</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Event Shoot Date</label>
                    <input 
                      type="date" 
                      value={galleryForm.event_date} 
                      onChange={e => setGalleryForm({ ...galleryForm, event_date: e.target.value })} 
                    />
                  </div>
                  <label className="checkbox-field">
                    <input 
                      type="checkbox" 
                      checked={galleryForm.is_public} 
                      onChange={e => setGalleryForm({ ...galleryForm, is_public: e.target.checked })} 
                    />
                    Publish to Lightbox immediately
                  </label>
                  <button type="submit" className="btn">Load Shooting Roll</button>
                </form>
              </div>
            )}

            {/* List and Selector for Galleries */}
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Shoot Roll Directory</h3>
              {galleries.length === 0 ? (
                <p className="empty-note">No galleries created yet.</p>
              ) : (
                <ul className="roll-status-list" style={{ margin: 0 }}>
                  {galleries.map(g => {
                    const linkedClient = clientById.get(g.client_id ?? '') ?? null
                    const balanceDue = linkedClient
                      ? Math.max(0, Number(linkedClient.total_amount) - Number(linkedClient.amount_paid))
                      : 0
                    const accessState = GALLERY_ACCESS_LABELS[getGalleryAccessState(g, linkedClient)]

                    return (
                      <li key={g.id} style={{ borderLeft: g.id === selectedGalleryId ? '4px solid var(--accent)' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span className={`status-dot ${g.status === 'PUBLISHED' ? 'status-dot--published' : ''}`} />
                          <span 
                            style={{ fontWeight: 600, cursor: 'pointer', flexGrow: 1, marginLeft: '8px' }}
                            onClick={() => setSelectedGalleryId(g.id)}
                          >
                            {g.title}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              className="btn-link" 
                              style={{ textDecoration: 'none' }}
                              onClick={() => handleCopyLink(g.access_token)}
                              title="Copy client link"
                              aria-label="Copy private client link"
                            >
                              {copiedToken === g.access_token ? <CheckIcon /> : <LinkIcon />}
                            </button>
                            {canManageGalleries && (
                              <button 
                                className="btn-link" 
                                style={{ color: '#B7311F', textDecoration: 'none' }}
                                onClick={() => handleDeleteGallery(g.id)}
                                title="Permanent delete"
                                aria-label={`Permanently delete gallery: ${g.title}`}
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--olive-light)', paddingLeft: '18px', gap: '8px', flexWrap: 'wrap' }}>
                          <span>Status: <strong>{g.status}</strong></span>
                          <span>{accessState}</span>
                          <span>Balance: <strong>NLe {balanceDue.toLocaleString()}</strong></span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#6a655f', paddingLeft: '18px' }}>
                          <span>{linkedClient ? linkedClient.name : 'No client attached'}</span>
                          <span>Shoot Date: {new Date(g.event_date).toLocaleDateString()}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

          </div>

          {/* Detailed Selected Gallery Management */}
          {selectedGalleryId && editGallery && (
            <div className="upload-block" style={{ marginTop: '24px' }}>
              <div style={{ borderBottom: '1.5px solid var(--charcoal)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Shoot Control Panel: "{editGallery.title}"</h4>
                {canManageGalleries && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => handleRegenerateLink(selectedGalleryId)}>
                      Reset Link Token
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', background: '#FCEBE8', color: '#B7311F' }} onClick={() => handleRevokeLink(selectedGalleryId)}>
                      Revoke Link
                    </button>
                  </div>
                )}
              </div>

              {/* Gallery Settings Forms — read-only preview for staff who can't manage galleries */}
              <fieldset disabled={!canManageGalleries} style={{ border: 'none', padding: 0, margin: 0 }}>
              <form onSubmit={handleUpdateGallery} className="gallery-settings-pane" style={{ background: '#FFF', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)' }}>
                <div className="gallery-settings-form">
                  <div className="field">
                    <label>Gallery Title</label>
                    <input 
                      value={editGallery.title || ''} 
                      onChange={e => setEditGallery({ ...editGallery, title: e.target.value })} 
                    />
                  </div>
                  <div className="field">
                    <label>Description</label>
                    <input 
                      value={editGallery.description || ''} 
                      onChange={e => setEditGallery({ ...editGallery, description: e.target.value })} 
                    />
                  </div>
                  <div className="field">
                    <label>Workflow Status</label>
                    <select 
                      value={editGallery.status || 'DRAFT'} 
                      onChange={e => setEditGallery({ ...editGallery, status: e.target.value })}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="PROCESSING">Processing</option>
                      <option value="READY">Ready</option>
                      <option value="PUBLISHED">Published (Client Access Active)</option>
                      <option value="DISABLED">Disabled (Private Link Revoked)</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Assign Client</label>
                    <select 
                      value={editGallery.client_id || ''} 
                      onChange={e => setEditGallery({ ...editGallery, client_id: e.target.value || null })}
                    >
                      <option value="">No Client…</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Watermark Settings</label>
                    <label className="checkbox-field" style={{ marginTop: '12px' }}>
                      <input 
                        type="checkbox" 
                        checked={editGallery.watermark_enabled ?? false} 
                        onChange={e => setEditGallery({ ...editGallery, watermark_enabled: e.target.checked })} 
                      />
                      Apply Watermark to Previews
                    </label>
                  </div>
                  <div className="field">
                    <label>Client Permissions</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                      <label className="checkbox-field">
                        <input 
                          type="checkbox" 
                          checked={editGallery.downloads_enabled ?? true} 
                          onChange={e => setEditGallery({ ...editGallery, downloads_enabled: e.target.checked })} 
                        />
                        Allow high-res downloads
                      </label>
                      <label className="checkbox-field">
                        <input 
                          type="checkbox" 
                          checked={editGallery.selection_enabled ?? true} 
                          onChange={e => setEditGallery({ ...editGallery, selection_enabled: e.target.checked })} 
                        />
                        Allow photo selection
                      </label>
                    </div>
                  </div>
                  
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button type="submit" className="btn" style={{ padding: '6px 20px', fontSize: '0.8rem' }}>Save Settings Changes</button>
                  </div>
                </div>
              </form>
              </fieldset>

              {/* Album organizing controls */}
              <div style={{ marginTop: '24px', background: 'var(--cream-matted)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>Manage Studio Albums</h4>
                {canManageGalleries && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  
                  {/* Create Album Form */}
                  <form onSubmit={handleCreateAlbum} className="field-stack" style={{ gap: '10px' }}>
                    <div className="field">
                      <label>Album Name</label>
                      <input 
                        value={albumForm.name} 
                        onChange={e => setAlbumForm({ ...albumForm, name: e.target.value })} 
                        placeholder="e.g. Ceremony Portraits" 
                        required 
                      />
                    </div>
                    <button type="submit" className="btn" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Create Album Group</button>
                  </form>

                  {/* Album list */}
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--olive)', textTransform: 'uppercase' }}>Existing Albums</label>
                    {albums.length === 0 ? (
                      <p className="empty-note" style={{ padding: '12px' }}>No albums created yet. Photos will load uncategorized.</p>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {albums.map(a => (
                          <li key={a.id} style={{ background: '#FFF', padding: '6px 12px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                            <span><strong>{a.name}</strong></span>
                            <button className="btn-link" type="button" style={{ color: '#B7311F', fontSize: '0.75rem' }} onClick={() => handleDeleteAlbum(a.id)}>Delete</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                )}
              </div>

              {/* photo batch upload queue */}
              {canUploadPhotos && (
              <div style={{ marginTop: '24px', background: '#FFF', padding: '20px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>Develop Master JPEGs</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
                  <div className="field">
                    <label>Target Album</label>
                    <select value={selectedAlbumId} onChange={e => setSelectedAlbumId(e.target.value)} style={{ padding: '6px 12px' }}>
                      <option value="">Default (No Album Grouping)</option>
                      {albums.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <label className="btn btn-secondary file-btn" style={{ padding: '8px 24px', margin: 0 }}>
                    Select & Load Photos
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      onChange={handleUploadPhotos} 
                      hidden 
                    />
                  </label>
                </div>

                {uploadQueue.length > 0 && (
                  <div style={{ background: 'var(--cream-matted)', padding: '12px', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    <strong>Upload Status Log:</strong>
                    <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '6px' }}>
                      {uploadQueue.map((q) => (
                        <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', color: q.status === 'success' ? 'var(--olive)' : q.status === 'failed' ? '#B7311F' : '#333' }}>
                          <span>{q.filename}</span>
                          <span><strong>{q.status}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Grid of uploaded frames with album management */}
              <div style={{ marginTop: '32px' }}>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Uploaded frames ({photos.length})</h4>
                <div className="frame-grid">
                  {photos.length === 0 && <p className="empty-note" style={{ gridColumn: '1 / -1' }}>No photographic masters loaded for this shoot roll.</p>}
                  {photos.map((p, idx) => (
                    <div className="frame" key={p.id}>
                      {canUploadPhotos && (
                        <div className="frame-actions-overlay">
                          <button className="frame-btn-icon frame-btn-icon--delete" type="button" onClick={() => handleDeletePhoto(p.id)}>
                            <TrashIcon />
                          </button>
                        </div>
                      )}
                      <div className="thumb-wrap">
                        <AuthedImage src={`/api/photos/${p.id}`} accessToken={session.access_token} alt="Shoot master" />
                      </div>
                      <div className="frame-number">
                        <span>No. {String(idx + 1).padStart(2, '0')}</span>
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <select 
                          style={{ width: '100%', fontSize: '0.7rem', padding: '4px' }}
                          value={p.album_id || ''}
                          disabled={!canUploadPhotos}
                          onChange={e => handleAssignPhotoAlbum(p.id, e.target.value)}
                        >
                          <option value="">No Album</option>
                          {albums.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* ── C. CLIENTS VIEW ─────────────────────────────────────────── */}
      {activeTab === 'clients' && canViewFinances && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            
            {/* Create Client Form */}
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Create Customer Profile</h3>
              <form onSubmit={handleCreateClient} className="field-stack">
                <div className="field">
                  <label>Full Client Name</label>
                  <input 
                    value={clientForm.name} 
                    onChange={e => setClientForm({ ...clientForm, name: e.target.value })} 
                    placeholder="e.g. Mohamed Kamara" 
                    required 
                  />
                </div>
                <div className="field">
                  <label>Client Email</label>
                  <input 
                    type="email" 
                    value={clientForm.email} 
                    onChange={e => setClientForm({ ...clientForm, email: e.target.value })} 
                    placeholder="name@example.com" 
                  />
                </div>
                <div className="field">
                  <label>Client Phone</label>
                  <input 
                    value={clientForm.phone} 
                    onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} 
                    placeholder="e.g. +232 XX XXXXXX" 
                  />
                </div>
                <div className="field">
                  <label>Operational Notes</label>
                  <input 
                    value={clientForm.notes} 
                    onChange={e => setClientForm({ ...clientForm, notes: e.target.value })} 
                    placeholder="e.g. Pre-paid deposit" 
                  />
                </div>
                <div className="field">
                  <label>Total Package Cost (NLe)</label>
                  <input 
                    type="number" 
                    value={clientForm.total_amount || ''} 
                    onChange={e => setClientForm({ ...clientForm, total_amount: Number(e.target.value) })} 
                    placeholder="e.g. 3500" 
                  />
                </div>
                <div className="field">
                  <label>Amount Already Paid (NLe)</label>
                  <input 
                    type="number" 
                    value={clientForm.amount_paid || ''} 
                    onChange={e => setClientForm({ ...clientForm, amount_paid: Number(e.target.value) })} 
                    placeholder="e.g. 2000" 
                  />
                </div>
                <button type="submit" className="btn">Build Client Record</button>
              </form>
            </div>

            {/* Clients Listing Directory */}
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Client Accounts</h3>
              {clients.length === 0 ? (
                <p className="empty-note">No customer profiles developed yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {clients.map(c => {
                    const outstanding = c.total_amount - c.amount_paid
                    const statusType = outstanding <= 0 ? 'PAID' : c.amount_paid > 0 ? 'PARTIAL' : 'UNPAID'
                    const linkedGalleries = galleries.filter((g) => g.client_id === c.id)
                    const galleryStateSummary = linkedGalleries.length
                      ? linkedGalleries.map((g) => g.status).join(', ')
                      : 'No linked gallery'
                    
                    return (
                      <div key={c.id} style={{ background: '#FFF', border: '1.5px solid var(--charcoal)', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 var(--charcoal)', position: 'relative' }}>
                        <button 
                          className="btn-link" 
                          type="button"
                          style={{ position: 'absolute', top: '16px', right: '16px', color: '#B7311F', textDecoration: 'none' }}
                          onClick={() => handleDeleteClient(c.id)}
                          title="Delete client account"
                        >
                          <TrashIcon />
                        </button>

                        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '8px' }}>{c.name}</h4>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--olive-light)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>Email: {c.email || 'None'}</span>
                          <span>Phone: {c.phone || 'None'}</span>
                          {c.notes && <span>Notes: {c.notes}</span>}
                        </div>

                        <div style={{ borderTop: '1px dashed rgba(0,0,0,0.1)', marginTop: '12px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: statusType === 'PAID' ? 'var(--olive-pale)' : statusType === 'PARTIAL' ? 'var(--accent-glow)' : '#FCEBE8', color: statusType === 'PAID' ? 'var(--olive)' : statusType === 'PARTIAL' ? 'var(--accent)' : '#B7311F' }}>
                            {statusType}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--charcoal-light)' }}>
                            Owed: <strong>NLe {outstanding.toLocaleString()}</strong> / NLe {c.total_amount.toLocaleString()}
                          </span>
                        </div>

                        <div style={{ marginTop: '10px', fontSize: '0.7rem', color: '#5d584d', fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <span>Linked shoots: <strong>{linkedGalleries.length}</strong></span>
                          <span>{galleryStateSummary}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── D. LOGS AUDIT TRAIL VIEW ────────────────────────────────── */}
      {activeTab === 'logs' && canManageStaff && (
        <div>
          <h3 className="section-heading" style={{ marginBottom: '16px' }}>Operational Security Audit Logs</h3>
          <div style={{ background: '#FFF', border: '1.5px solid var(--charcoal)', borderRadius: '8px', padding: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--charcoal)', fontFamily: 'var(--font-mono)', color: 'var(--olive)' }}>
                  <th style={{ padding: '8px' }}>Action</th>
                  <th style={{ padding: '8px' }}>Operational Details</th>
                  <th style={{ padding: '8px' }}>Executed At</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '24px', color: '#888' }}>Audit logs empty. Try performing gallery or client actions.</td>
                  </tr>
                ) : (
                  logs.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', fontFamily: 'var(--font-mono)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--olive)' }}>{l.action}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--charcoal-light)' }}>{l.details}</td>
                      <td style={{ padding: '10px 8px', color: '#888' }}>{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status && <p className="status-note" style={{ marginTop: '24px' }}>{status}</p>}
    </section>
  )
}