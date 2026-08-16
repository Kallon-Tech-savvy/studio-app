// ── Shared domain types ───────────────────────────────────────────
// This is the single authoritative source for types that are used
// across more than one file. Do not redeclare these locally.

// ── Staff ─────────────────────────────────────────────────────────

export type StaffRole = 'owner' | 'admin' | 'photographer' | 'assistant'

export type StaffPermissionSet = {
  manageGalleries: boolean
  uploadPhotos: boolean
  manageStaff: boolean
  viewFinances: boolean
}

export type StaffMember = {
  email: string
  name: string
  role: StaffRole
  permissions: StaffPermissionSet
}

// ── Gallery ───────────────────────────────────────────────────────

/** Finite vocabulary of gallery workflow states. Never use `string` for this. */
export type GalleryStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'READY'
  | 'PUBLISHED'
  | 'DISABLED'
  | 'ARCHIVED'

export type Gallery = {
  id: string
  title: string
  description: string | null
  is_public: boolean
  status: GalleryStatus
  downloads_enabled: boolean
  selection_enabled: boolean
  watermark_enabled: boolean
  access_token: string
  client_id: string | null
  event_date: string
  expiration_date: string | null
  created_at: string
}

// ── Client ────────────────────────────────────────────────────────

export type Client = {
  id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  total_amount: number
  amount_paid: number
  created_at: string
}

// ── Album ─────────────────────────────────────────────────────────

export type Album = {
  id: string
  gallery_id: string
  name: string
  description: string | null
  cover_photo_id: string | null
  sort_order: number
}

// ── Photo ─────────────────────────────────────────────────────────

export type Photo = {
  id: string
  gallery_id: string
  album_id: string | null
  r2_key: string
  taken_at: string | null
  sort_order: number
  size: number | null
  mime_type: string | null
}

// ── Log ───────────────────────────────────────────────────────────

export type Log = {
  id: string
  action: string
  details: string
  created_at: string
}

// ── Upload queue ──────────────────────────────────────────────────

export type UploadStatus = 'pending' | 'success' | 'failed'

export type UploadQueueItem = {
  id: string
  filename: string
  status: UploadStatus
}

// ── Payment ───────────────────────────────────────────────────────

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID'

// ── Gallery access ────────────────────────────────────────────────

export type GalleryAccessState =
  | 'draft-only'
  | 'link-revoked'
  | 'payment-locked'
  | 'ready-for-delivery'
  | 'in-progress'
