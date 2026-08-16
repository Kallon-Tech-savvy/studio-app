/**
 * Pure financial domain functions.
 *
 * No React dependency. No DOM dependency. No network dependency.
 * All functions are deterministic and independently testable.
 */

import type { Client, PaymentStatus } from '../types'

// ── Per-client ────────────────────────────────────────────────────

/** Returns the outstanding balance for a client. Always >= 0. */
export function calculateBalance(client: Pick<Client, 'total_amount' | 'amount_paid'>): number {
  return Math.max(0, Number(client.total_amount) - Number(client.amount_paid))
}

/** Returns the payment status label for a client. */
export function getPaymentStatus(
  client: Pick<Client, 'total_amount' | 'amount_paid'>,
): PaymentStatus {
  const outstanding = Number(client.total_amount) - Number(client.amount_paid)
  if (outstanding <= 0) return 'PAID'
  if (Number(client.amount_paid) > 0) return 'PARTIAL'
  return 'UNPAID'
}

// ── Aggregate ─────────────────────────────────────────────────────

export type FinancialSummary = {
  totalRevenue: number
  totalReceived: number
  totalOutstanding: number
}

/**
 * Computes studio-wide financial aggregates in a single pass.
 * Avoids the two separate `.reduce()` calls that were previously
 * scattered across the dashboard render.
 */
export function selectFinancialSummary(clients: Client[]): FinancialSummary {
  let totalRevenue = 0
  let totalReceived = 0

  for (const c of clients) {
    totalRevenue += Number(c.total_amount)
    totalReceived += Number(c.amount_paid)
  }

  return {
    totalRevenue,
    totalReceived,
    totalOutstanding: Math.max(0, totalRevenue - totalReceived),
  }
}
