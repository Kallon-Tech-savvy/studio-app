/**
 * Pure financial domain functions.
 *
 * No React dependency. No DOM dependency. No network dependency.
 * All functions are deterministic and independently testable.
 */

import type { Client, PaymentStatus } from '../types'

// ── Types ─────────────────────────────────────────────────────────

export type FinancialTone = 'positive' | 'warning' | 'danger' | 'muted'

export type ClientPaymentBreakdown = {
  totalAmount: number
  amountPaid: number
  outstandingBalance: number
  overpaidAmount: number
  progressPercent: number
  status: PaymentStatus
  statusLabel: string
  statusTone: FinancialTone
  isFullyPaid: boolean
  hasDeposit: boolean
  deposit50Amount: number
  deposit50Remaining: number
}

export type FinancialSummary = {
  totalRevenue: number
  totalReceived: number
  totalOutstanding: number
  totalOverpaid: number
  collectionRate: number // 0 to 100 percentage
  averageClientValue: number
  averagePayment: number
  totalClients: number
  paidCount: number
  partialCount: number
  unpaidCount: number
  overpaidCount: number
  complimentaryCount: number
}

export type ClientSortOption =
  | 'balance-desc'
  | 'balance-asc'
  | 'revenue-desc'
  | 'revenue-asc'
  | 'name-asc'
  | 'name-desc'
  | 'newest'
  | 'oldest'

// ── Formatting ────────────────────────────────────────────────────

/**
 * Formats a numeric value as a currency string with thousands separators.
 * Defaults to 'NLe' (Sierra Leone New Leone).
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency = 'NLe',
  options: { includeDecimals?: boolean } = {},
): string {
  const numeric = Number(amount ?? 0)
  if (!Number.isFinite(numeric)) return `${currency} 0`

  const formatted = options.includeDecimals
    ? numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(numeric).toLocaleString('en-US')

  return `${currency} ${formatted}`
}

/**
 * Formats a percentage value (e.g. 85.4%).
 */
export function formatPercent(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '0%'
  const clamped = Math.max(0, Math.min(100, value))
  return `${clamped.toFixed(decimals)}%`
}

// ── Per-client ────────────────────────────────────────────────────

/** Returns the outstanding balance for a client. Always >= 0. */
export function calculateBalance(client: Pick<Client, 'total_amount' | 'amount_paid'>): number {
  const total = Number(client.total_amount ?? 0)
  const paid = Number(client.amount_paid ?? 0)
  return Math.max(0, total - paid)
}

/** Returns any overpayment amount for a client. Always >= 0. */
export function calculateOverpayment(client: Pick<Client, 'total_amount' | 'amount_paid'>): number {
  const total = Number(client.total_amount ?? 0)
  const paid = Number(client.amount_paid ?? 0)
  return Math.max(0, paid - total)
}

/**
 * Returns the payment progress percentage (0 - 100).
 * Handles zero-package clients gracefully.
 */
export function calculatePaymentProgress(
  client: Pick<Client, 'total_amount' | 'amount_paid'>,
): number {
  const total = Number(client.total_amount ?? 0)
  const paid = Number(client.amount_paid ?? 0)

  if (total <= 0) {
    return paid > 0 ? 100 : 100
  }

  const ratio = (paid / total) * 100
  return Math.max(0, Math.min(100, Math.round(ratio)))
}

/** Returns the payment status label for a client. */
export function getPaymentStatus(
  client: Pick<Client, 'total_amount' | 'amount_paid'>,
): PaymentStatus {
  const total = Number(client.total_amount ?? 0)
  const paid = Number(client.amount_paid ?? 0)

  if (total === 0 && paid === 0) return 'COMPLIMENTARY'
  if (paid > total && total > 0) return 'OVERPAID'
  if (paid >= total) return 'PAID'
  if (paid > 0) return 'PARTIAL'
  return 'UNPAID'
}

/** Returns a human-friendly string for the payment status. */
export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'PAID':
      return 'Fully Paid'
    case 'PARTIAL':
      return 'Partially Paid'
    case 'UNPAID':
      return 'Unpaid'
    case 'OVERPAID':
      return 'Credit / Overpaid'
    case 'COMPLIMENTARY':
      return 'Complimentary'
  }
}

/** Returns the UI tone for badge / pill rendering. */
export function getPaymentStatusTone(status: PaymentStatus): FinancialTone {
  switch (status) {
    case 'PAID':
      return 'positive'
    case 'PARTIAL':
      return 'warning'
    case 'UNPAID':
      return 'danger'
    case 'OVERPAID':
      return 'positive'
    case 'COMPLIMENTARY':
      return 'muted'
  }
}

/**
 * Detailed breakdown of a client's financial position for quick actions,
 * invoices, retainers, and progress display.
 */
export function calculateClientBreakdown(
  client: Pick<Client, 'total_amount' | 'amount_paid'>,
): ClientPaymentBreakdown {
  const total = Number(client.total_amount ?? 0)
  const paid = Number(client.amount_paid ?? 0)
  const outstanding = Math.max(0, total - paid)
  const overpaid = Math.max(0, paid - total)
  const status = getPaymentStatus(client)
  const progress = calculatePaymentProgress(client)
  const deposit50 = Math.round(total * 0.5)
  const deposit50Remaining = Math.max(0, deposit50 - paid)

  return {
    totalAmount: total,
    amountPaid: paid,
    outstandingBalance: outstanding,
    overpaidAmount: overpaid,
    progressPercent: progress,
    status,
    statusLabel: getPaymentStatusLabel(status),
    statusTone: getPaymentStatusTone(status),
    isFullyPaid: outstanding === 0,
    hasDeposit: paid >= deposit50 && deposit50 > 0,
    deposit50Amount: deposit50,
    deposit50Remaining,
  }
}

// ── Aggregate ─────────────────────────────────────────────────────

/**
 * Computes studio-wide financial aggregates in a single pass.
 */
export function selectFinancialSummary(clients: Client[]): FinancialSummary {
  let totalRevenue = 0
  let totalReceived = 0
  let totalOverpaid = 0
  let paidCount = 0
  let partialCount = 0
  let unpaidCount = 0
  let overpaidCount = 0
  let complimentaryCount = 0

  for (const c of clients) {
    const total = Number(c.total_amount ?? 0)
    const paid = Number(c.amount_paid ?? 0)

    totalRevenue += total
    totalReceived += paid

    if (paid > total) {
      totalOverpaid += paid - total
    }

    const status = getPaymentStatus(c)
    switch (status) {
      case 'PAID':
        paidCount++
        break
      case 'PARTIAL':
        partialCount++
        break
      case 'UNPAID':
        unpaidCount++
        break
      case 'OVERPAID':
        overpaidCount++
        break
      case 'COMPLIMENTARY':
        complimentaryCount++
        break
    }
  }

  const totalClients = clients.length
  const totalOutstanding = Math.max(0, totalRevenue - (totalReceived - totalOverpaid))
  const collectionRate = totalRevenue > 0 ? Math.min(100, Math.round((totalReceived / totalRevenue) * 100)) : 0
  const payingClientsCount = clients.filter(c => Number(c.total_amount ?? 0) > 0).length
  const clientsWithPaymentsCount = clients.filter(c => Number(c.amount_paid ?? 0) > 0).length

  const averageClientValue = payingClientsCount > 0 ? Math.round(totalRevenue / payingClientsCount) : 0
  const averagePayment = clientsWithPaymentsCount > 0 ? Math.round(totalReceived / clientsWithPaymentsCount) : 0

  return {
    totalRevenue,
    totalReceived,
    totalOutstanding,
    totalOverpaid,
    collectionRate,
    averageClientValue,
    averagePayment,
    totalClients,
    paidCount,
    partialCount,
    unpaidCount,
    overpaidCount,
    complimentaryCount,
  }
}

// ── Filtering & Sorting ───────────────────────────────────────────

/**
 * Filters and searches clients by status, name, email, or notes.
 */
export function filterClients(
  clients: Client[],
  filter: 'ALL' | PaymentStatus,
  searchQuery = '',
): Client[] {
  const query = searchQuery.trim().toLowerCase()

  return clients.filter(client => {
    // Status filter
    if (filter !== 'ALL') {
      const status = getPaymentStatus(client)
      if (status !== filter) return false
    }

    // Search query filter
    if (query) {
      const name = (client.name || '').toLowerCase()
      const email = (client.email || '').toLowerCase()
      const phone = (client.phone || '').toLowerCase()
      const notes = (client.notes || '').toLowerCase()

      const matches =
        name.includes(query) ||
        email.includes(query) ||
        phone.includes(query) ||
        notes.includes(query)

      if (!matches) return false
    }

    return true
  })
}

/**
 * Sorts client list by financial priority, recency, or alphabetical order.
 */
export function sortClients(clients: Client[], sortBy: ClientSortOption): Client[] {
  const copy = [...clients]

  switch (sortBy) {
    case 'balance-desc':
      return copy.sort((a, b) => calculateBalance(b) - calculateBalance(a))
    case 'balance-asc':
      return copy.sort((a, b) => calculateBalance(a) - calculateBalance(b))
    case 'revenue-desc':
      return copy.sort((a, b) => Number(b.total_amount ?? 0) - Number(a.total_amount ?? 0))
    case 'revenue-asc':
      return copy.sort((a, b) => Number(a.total_amount ?? 0) - Number(b.total_amount ?? 0))
    case 'name-asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'name-desc':
      return copy.sort((a, b) => b.name.localeCompare(a.name))
    case 'newest':
      return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    case 'oldest':
      return copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    default:
      return copy
  }
}
