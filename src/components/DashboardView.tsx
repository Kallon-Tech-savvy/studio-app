import type {
  Gallery,
  Log,
} from '../types'

import {
  countPublishedGalleries,
} from '../domain/admin'

import { Card } from './Card'
import { Button } from './Button'
import { StatCard } from './StatCard'

interface DashboardViewProps {
  galleries: Gallery[]
  logs: Log[]

  clientCount: number
  totalRevenue: number
  totalOutstanding: number

  onOpenGalleries: () => void
}

export function DashboardView({
  galleries,
  logs,
  clientCount,
  totalRevenue,
  totalOutstanding,
  onOpenGalleries,
}: DashboardViewProps) {
  const publishedCount =
    countPublishedGalleries(
      galleries,
    )

  return (
    <div className="admin-view">
      <h3 className="section-heading">
        Studio At-A-Glance
      </h3>

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
        />

        <StatCard
          label="Total Clients"
          value={clientCount}
        />

        <StatCard
          label="Revenue Booked"
          value={`NLe ${totalRevenue.toLocaleString()}`}
          tone="positive"
        />

        <StatCard
          label="Outstanding Balances"
          value={`NLe ${totalOutstanding.toLocaleString()}`}
          tone="danger"
        />
      </div>

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