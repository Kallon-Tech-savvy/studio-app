import { useState, useMemo, useEffect, useRef } from 'react'

import {
  TrashIcon,
  EditIcon,
  CreditCardIcon,
  SearchIcon,
  CheckIcon,
  CloseIcon,
} from './icon'

import type {
  Client,
  Gallery,
  PaymentStatus,
} from '../types'

import {
  calculateClientBreakdown,
  filterClients,
  sortClients,
  formatCurrency,
  formatPercent,
  type ClientSortOption,
} from '../domain/finance'

interface ClientDirectoryProps {
  clients: Client[]
  galleriesByClientId: Map<string, Gallery[]>
  deletingId: string | null
  onDelete: (clientId: string) => void
  onUpdateClient?: (clientId: string, updates: Partial<Client>) => Promise<void>
  onRecordPayment?: (clientId: string, amount: number) => Promise<void>
}

export function ClientDirectory({
  clients,
  galleriesByClientId,
  deletingId,
  onDelete,
  onUpdateClient,
  onRecordPayment,
}: ClientDirectoryProps) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<ClientSortOption>('balance-desc')

  // Payment Recording Modal State
  const [payingClient, setPayingClient] = useState<Client | null>(null)
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('')
  const [isRecordingPayment, setIsRecordingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Edit Client Modal State
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    email: string
    phone: string
    notes: string
    total_amount: number
    amount_paid: number
  }>({
    name: '',
    email: '',
    phone: '',
    notes: '',
    total_amount: 0,
    amount_paid: 0,
  })
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    const activeModal = payingClient || editingClient || pendingDelete
    if (!activeModal) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const modal = modalRef.current
    const focusable = modal?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    )
    focusable?.[0]?.focus()

    function handleModalKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPayingClient(null)
        setEditingClient(null)
        setPendingDelete(null)
        return
      }

      if (event.key !== 'Tab' || !focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleModalKeydown)
    return () => {
      document.removeEventListener('keydown', handleModalKeydown)
      previouslyFocused?.focus()
    }
  }, [payingClient, editingClient, pendingDelete])

  // Filtered and sorted clients
  const processedClients = useMemo(() => {
    const filtered = filterClients(clients, statusFilter, searchQuery)
    return sortClients(filtered, sortBy)
  }, [clients, statusFilter, searchQuery, sortBy])

  // Status counts for filter chips
  const statusCounts = useMemo(() => {
    const counts = { ALL: clients.length, UNPAID: 0, PARTIAL: 0, PAID: 0, OVERPAID: 0, COMPLIMENTARY: 0 }
    for (const c of clients) {
      const breakdown = calculateClientBreakdown(c)
      counts[breakdown.status] = (counts[breakdown.status] || 0) + 1
    }
    return counts
  }, [clients])

  // Open Payment modal
  function openPaymentModal(client: Client) {
    const breakdown = calculateClientBreakdown(client)
    setPayingClient(client)
    setPaymentAmount(breakdown.outstandingBalance > 0 ? breakdown.outstandingBalance : '')
    setPaymentError(null)
  }

  // Submit Payment
  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!payingClient || !onRecordPayment) return

    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Please enter a valid positive payment amount.')
      return
    }

    setIsRecordingPayment(true)
    setPaymentError(null)

    try {
      await onRecordPayment(payingClient.id, amount)
      setPayingClient(null)
      setPaymentAmount('')
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Failed to record payment.')
    } finally {
      setIsRecordingPayment(false)
    }
  }

  // Open Edit modal
  function openEditModal(client: Client) {
    setEditingClient(client)
    setEditForm({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      notes: client.notes || '',
      total_amount: Number(client.total_amount ?? 0),
      amount_paid: Number(client.amount_paid ?? 0),
    })
    setEditError(null)
  }

  // Submit Edit
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingClient || !onUpdateClient) return

    if (!editForm.name.trim()) {
      setEditError('Client name is required.')
      return
    }

    if (editForm.amount_paid > editForm.total_amount) {
      setEditError('Amount paid cannot exceed total package cost.')
      return
    }

    setIsSavingEdit(true)
    setEditError(null)

    try {
      await onUpdateClient(editingClient.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        notes: editForm.notes.trim() || null,
        total_amount: Number(editForm.total_amount),
        amount_paid: Number(editForm.amount_paid),
      })
      setEditingClient(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update client.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  if (clients.length === 0) {
    return (
      <p className="empty-note">
        No clients yet — add your first one on the left.
      </p>
    )
  }

  return (
    <div className="client-directory-wrapper">
      {/* Search & Filter Toolbar */}
      <div className="client-toolbar">
        <div className="client-toolbar__search">
          <span className="client-toolbar__search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search by client name, email, or notes…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="client-search-input"
            aria-label="Search clients"
          />
          {searchQuery && (
            <button
              type="button"
              className="client-toolbar__clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="client-toolbar__controls">
          <div className="client-filter-pills" role="tablist" aria-label="Filter by payment status">
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'ALL' ? 'filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              All ({statusCounts.ALL})
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'UNPAID' ? 'filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('UNPAID')}
            >
              Unpaid ({statusCounts.UNPAID})
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'PARTIAL' ? 'filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('PARTIAL')}
            >
              Partial ({statusCounts.PARTIAL})
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'PAID' ? 'filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('PAID')}
            >
              Paid ({statusCounts.PAID})
            </button>
          </div>

          <div className="client-sort-select">
            <label htmlFor="client-sort" className="sr-only">Sort clients</label>
            <select
              id="client-sort"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as ClientSortOption)}
              className="admin-select-sm"
            >
              <option value="balance-desc">Highest Balance Owed</option>
              <option value="revenue-desc">Highest Package Cost</option>
              <option value="newest">Newest Added</option>
              <option value="name-asc">Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {processedClients.length === 0 ? (
        <div className="client-empty-filter">
          <p className="empty-note">
            No clients match the current filter or search query.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '8px', fontSize: '0.75rem', padding: '6px 14px' }}
            onClick={() => {
              setStatusFilter('ALL')
              setSearchQuery('')
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="client-directory">
          {processedClients.map(client => {
            const breakdown = calculateClientBreakdown(client)
            const galleries = galleriesByClientId.get(client.id) ?? []

            return (
              <article key={client.id} className="client-card">
                <div className="client-card__actions-top">
                  {onUpdateClient && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => openEditModal(client)}
                      title={`Edit ${client.name}`}
                      aria-label={`Edit ${client.name}`}
                    >
                      <EditIcon />
                    </button>
                  )}

                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                      onClick={() => setPendingDelete(client)}
                    disabled={deletingId === client.id}
                    title={`Delete ${client.name}`}
                    aria-label={`Delete ${client.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div className="client-card__header">
                  <h4>{client.name}</h4>
                  <span className={`payment-status payment-status--${breakdown.status.toLowerCase()}`}>
                    {breakdown.statusLabel}
                  </span>
                </div>

                <div className="client-card__details">
                  <span>Email: {client.email || 'None'}</span>
                  <span>Phone: {client.phone || 'None'}</span>
                  {client.notes && <span>Notes: {client.notes}</span>}
                </div>

                {/* Visual Payment Progress Bar */}
                <div className="client-card__progress-wrap">
                  <div className="client-card__progress-labels">
                    <span>Payment Progress</span>
                    <strong>{formatPercent(breakdown.progressPercent)}</strong>
                  </div>
                  <div
                    className="client-progress-bar"
                    role="progressbar"
                    aria-valuenow={breakdown.progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Payment progress for ${client.name}`}
                  >
                    <div
                      className={`client-progress-bar__fill client-progress-bar__fill--${breakdown.statusTone}`}
                      style={{ width: `${breakdown.progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="client-card__financials">
                  <div className="client-card__financial-numbers">
                    <span className="client-card__amount-paid">
                      Paid: <strong>{formatCurrency(breakdown.amountPaid)}</strong>
                    </span>
                    <span className="client-card__amount-total">
                      Total: <strong>{formatCurrency(breakdown.totalAmount)}</strong>
                    </span>
                  </div>

                  <div className="client-card__amount-due">
                    {breakdown.outstandingBalance > 0 ? (
                      <span className="balance-due">
                        Owed: <strong>{formatCurrency(breakdown.outstandingBalance)}</strong>
                      </span>
                    ) : breakdown.overpaidAmount > 0 ? (
                      <span className="balance-credit">
                        Credit: <strong>{formatCurrency(breakdown.overpaidAmount)}</strong>
                      </span>
                    ) : (
                      <span className="balance-settled">
                        <CheckIcon size={12} /> Settled
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Payment Action Button */}
                {onRecordPayment && breakdown.outstandingBalance > 0 && (
                  <div className="client-card__quick-pay">
                    <button
                      type="button"
                      className="admin-button admin-button--secondary quick-pay-btn"
                      onClick={() => openPaymentModal(client)}
                    >
                      <CreditCardIcon /> Record Payment ({formatCurrency(breakdown.outstandingBalance)} balance)
                    </button>
                  </div>
                )}

                <div className="client-card__footer">
                  <span>
                    Linked shoots: <strong>{galleries.length}</strong>
                  </span>
                  <span>
                    {galleries.length
                      ? galleries.map(gallery => gallery.title).join(', ')
                      : 'No linked shoot'}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* ── Record Payment Modal ── */}
      {payingClient && (
        <div
          ref={modalRef}
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-payment-title"
          onClick={() => setPayingClient(null)}
        >
          <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 id="record-payment-title">Record Payment</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setPayingClient(null)}
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <p className="admin-modal-subtitle">
              Client: <strong>{payingClient.name}</strong>
            </p>

            {(() => {
              const breakdown = calculateClientBreakdown(payingClient)
              return (
                <form onSubmit={handlePaymentSubmit} className="field-stack" style={{ marginTop: '16px' }}>
                  <div className="payment-summary-box">
                    <div className="payment-summary-row">
                      <span>Package Total:</span>
                      <strong>{formatCurrency(breakdown.totalAmount)}</strong>
                    </div>
                    <div className="payment-summary-row">
                      <span>Already Paid:</span>
                      <strong>{formatCurrency(breakdown.amountPaid)}</strong>
                    </div>
                    <div className="payment-summary-row payment-summary-row--highlight">
                      <span>Remaining Balance:</span>
                      <strong>{formatCurrency(breakdown.outstandingBalance)}</strong>
                    </div>
                  </div>

                  {/* Preset Amount Quick-Select */}
                  <div className="payment-presets">
                    <span className="field-hint" style={{ width: '100%', marginBottom: '4px' }}>Quick Select:</span>
                    {breakdown.outstandingBalance > 0 && (
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => setPaymentAmount(breakdown.outstandingBalance)}
                      >
                        Full Balance ({formatCurrency(breakdown.outstandingBalance)})
                      </button>
                    )}
                    {breakdown.deposit50Remaining > 0 && (
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => setPaymentAmount(breakdown.deposit50Remaining)}
                      >
                        50% Retainer ({formatCurrency(breakdown.deposit50Remaining)})
                      </button>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="payment-amount-input">Payment Amount (NLe)</label>
                    <input
                      id="payment-amount-input"
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="e.g. 5000"
                      autoFocus
                    />
                  </div>

                  {paymentError && (
                    <p className="status-note status-error" role="alert">
                      {paymentError}
                    </p>
                  )}

                  <div className="form-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="admin-button admin-button--secondary"
                      onClick={() => setPayingClient(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="admin-button admin-button--primary"
                      disabled={isRecordingPayment || !paymentAmount || Number(paymentAmount) <= 0}
                    >
                      {isRecordingPayment ? 'Recording…' : `Record ${paymentAmount ? formatCurrency(Number(paymentAmount)) : ''}`}
                    </button>
                  </div>
                </form>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Edit Client & Financials Modal ── */}
      {editingClient && (
        <div
          ref={modalRef}
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-client-title"
          onClick={() => setEditingClient(null)}
        >
          <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 id="edit-client-title">Edit Client & Financials</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setEditingClient(null)}
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="field-stack" style={{ marginTop: '16px' }}>
              <div className="field">
                <label htmlFor="edit-name">Full Name</label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-email">Email</label>
                <input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-phone">Phone</label>
                <input
                  id="edit-phone"
                  type="text"
                  value={editForm.phone}
                  onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-notes">Notes</label>
                <textarea
                  id="edit-notes"
                  rows={2}
                  value={editForm.notes}
                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label htmlFor="edit-total">Package Cost (NLe)</label>
                  <input
                    id="edit-total"
                    type="number"
                    min="0"
                    value={editForm.total_amount || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, total_amount: Number(e.target.value) }))}
                  />
                </div>

                <div className="field">
                  <label htmlFor="edit-paid">Amount Paid (NLe)</label>
                  <input
                    id="edit-paid"
                    type="number"
                    min="0"
                    value={editForm.amount_paid || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, amount_paid: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {editError && (
                <p className="status-note status-error" role="alert">
                  {editError}
                </p>
              )}

              <div className="form-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => setEditingClient(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-button admin-button--primary"
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          ref={modalRef}
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-client-title"
          onClick={() => setPendingDelete(null)}
        >
          <div className="admin-modal-content admin-modal-content--compact" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 id="delete-client-title">Remove client?</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setPendingDelete(null)}
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <p className="admin-modal-subtitle">
              This removes <strong>{pendingDelete.name}</strong> and unlinks their shoots. This cannot be undone.
            </p>
            <div className="form-actions">
              <button type="button" className="admin-button admin-button--secondary" onClick={() => setPendingDelete(null)}>
                Keep client
              </button>
              <button
                type="button"
                className="admin-button admin-button--danger"
                onClick={() => {
                  onDelete(pendingDelete.id)
                  setPendingDelete(null)
                }}
              >
                Remove client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}