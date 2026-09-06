import type {
  Gallery,
  Log,
} from '../types'

import {
  countPublishedGalleries,
} from '../domain/admin'

import {
  formatCurrency,
  formatPercent,
  type FinancialSummary,
} from '../domain/finance'

import { Card } from './Card'
import { Button } from './Button'
import { StatCard } from './StatCard'

interface DashboardViewProps {
  galleries: Gallery[]
  logs: Log[]

  clientCount: number
  financialSummary: FinancialSummary
  canViewFinances?: boolean

  onOpenGalleries: () => void
  onOpenClients?: () => void
}

export function DashboardView({
  galleries,
  logs,
  clientCount,
  financialSummary,
  canViewFinances = true,
  onOpenGalleries,
  onOpenClients,
}: DashboardViewProps) {
  const publishedCount =
    countPublishedGalleries(
      galleries,
    )

  return (
    <div className="admin-view">
      <div className="section-headline">
        <div>
          <h3 className="section-heading">
            Studio At-A-Glance
          </h3>
          <p className="section-sub">
            Real-time operations, delivery status, and financial health.
          </p>
        </div>
      </div>

      {galleries.length === 0 &&
        clientCount === 0 && (
          <p className="status-note">
            Welcome to your studio workspace. Start in the Galleries tab to create your first gallery,
            or the Clients tab to add a client — either works, you can always connect them later.
          </p>
        )}

      <div className="stats-grid">
        <StatCard
          label="Published Galleries"
          value={publishedCount}
          subtext={`${galleries.length} total rolls`}
        />

        <StatCard
          label="Total Clients"
          value={clientCount}
          subtext={
            canViewFinances && financialSummary.totalRevenue > 0
              ? `Avg ${formatCurrency(financialSummary.averageClientValue)} / client`
              : undefined
          }
        />

        {canViewFinances ? (
          <>
            <StatCard
              label="Revenue Booked"
              value={formatCurrency(financialSummary.totalRevenue)}
              subtext={`${formatCurrency(financialSummary.totalReceived)} received (${formatPercent(financialSummary.collectionRate)})`}
              tone="positive"
            />

            <StatCard
              label="Outstanding Balances"
              value={formatCurrency(financialSummary.totalOutstanding)}
              subtext={`${financialSummary.unpaidCount + financialSummary.partialCount} unpaid/partial accounts`}
              tone={financialSummary.totalOutstanding > 0 ? 'danger' : 'positive'}
            />
          </>
        ) : null}
      </div>

      {canViewFinances && financialSummary.totalRevenue > 0 && (
        <div className="financial-health-card">
          <div className="financial-health-card__header">
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem' }}>Financial Health</h4>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                Collection rate: <strong style={{ color: 'var(--ink)' }}>{formatPercent(financialSummary.collectionRate)}</strong>
              </p>
            </div>
            {onOpenClients && (
              <Button variant="secondary" onClick={onOpenClients}>
                Manage accounts
              </Button>
            )}
          </div>
          <div className="financial-progress-bar" role="progressbar" aria-valuenow={financialSummary.collectionRate} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="financial-progress-bar__fill"
              style={{ width: `${financialSummary.collectionRate}%` }}
            />
          </div>
          <div className="financial-health-card__legend">
            <span>
              Collected: <strong>{formatCurrency(financialSummary.totalReceived)}</strong>
            </span>
            <span>
              Receivables: <strong>{formatCurrency(financialSummary.totalOutstanding)}</strong>
            </span>
            <span>
              Fully Paid: <strong>{financialSummary.paidCount}</strong> clients
            </span>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <Card>
          <h4>Recent Deliveries</h4>

          {galleries.length === 0 ? (
            <p className="empty-note">
              No galleries yet — create your first shoot to see it here.
            </p>
          ) : (
            <ul className="roll-status-list">
              {galleries
                .slice(0, 5)
                .map(gallery => (
                  <li key={gallery.id}>
                    <span
                      className={`status-dot ${
                        gallery.status ===
                        'PUBLISHED'
                          ? 'status-dot--published'
                          : ''
                      }`}
                    />

                    <span>
                      {gallery.title}
                    </span>

                    <small>
                      {gallery.status}
                    </small>
                  </li>
                ))}
            </ul>
          )}

          <Button
            variant="secondary"
            onClick={onOpenGalleries}
          >
            Manage All Galleries
          </Button>
        </Card>

        <Card>
          <h4>
            Recent Activity Audit Trail
          </h4>

          {logs.length === 0 ? (
            <p className="empty-note">
              Nothing yet — actions like uploads and gallery changes will show up here.
            </p>
          ) : (
            <div className="audit-preview">
              {logs
                .slice(0, 8)
                .map(log => (
                  <article
                    key={log.id}
                    className="audit-preview__item"
                  >
                    <strong>
                      [{log.action}]
                    </strong>

                    <span>
                      {log.details}
                    </span>

                    <time>
                      {new Date(
                        log.created_at,
                      ).toLocaleString()}
                    </time>
                  </article>
                ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}