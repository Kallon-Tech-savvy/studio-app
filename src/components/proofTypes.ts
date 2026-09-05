export interface ProofGalleryMeta {
  id: string
  title: string
  description: string | null
  welcomeMessage?: string | null
  status: string
  downloadsEnabled: boolean
  selectionEnabled: boolean
  watermarkEnabled: boolean
  totalAmount: number
  amountPaid: number
  locked: boolean
  lockedReason?: string
}

export interface ProofAlbum {
  id: string
  title: string
  description: string | null
  coverPhotoId: string | null
}

export interface ProofPhoto {
  id: string
  albumId: string | null
  filename: string
  locked: boolean
  lockedReason?: string
}
