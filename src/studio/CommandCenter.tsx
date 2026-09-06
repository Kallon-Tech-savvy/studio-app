import { useMemo } from 'react'
import type { Client, Gallery, Log } from '../types'
import { getNextAction } from '../domain/gallery/nextAction'
import { getGalleryHealth } from '../domain/gallery/health'
import { getStudioWorkQueue } from './WorkQueue'
import { NextActionCard } from './NextActionCard'
import { GalleryHealth } from './GalleryHealth'

interface CommandCenterProps {
  galleries: Gallery[]
  clients: Client[]
  logs: Log[]
  photoCounts?: Record<string, number>
  selectedCounts?: Record<string, number>
  onUnlockDownloads?: (galleryId: string) => Promise<void> | void
}

export function CommandCenter({ galleries, clients, logs, photoCounts = {}, selectedCounts = {}, onUnlockDownloads }: CommandCenterProps) {
  const queue = useMemo(
    () => getStudioWorkQueue(galleries, clients, photoCounts, selectedCounts),
    [galleries, clients, photoCounts, selectedCounts],
  )

  const topItem = queue[0]
  const liveActivity = logs.slice(0, 8)

  return (
    <div className="admin-view">
      <div className="section-headline">
        <div>
          <h3 className="section-heading">Studio in Session</h3>
          <p className="section-sub">What needs attention right now, what is in progress, and what just happened.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="admin-card">
          <h4>Today</h4>
          <p>{galleries.length} active galleries</p>
          <p>{queue.filter(item => item.blocking).length} need attention</p>
          <p>{queue.filter(item => item.nextAction?.code === 'REVIEW_SELECTION').length} clients reviewing</p>
        </div>

        <div className="admin-card">
          <h4>Priority</h4>
          {topItem ? (
            <>
              <p>{topItem.clientName}</p>
              <p>{topItem.galleryTitle}</p>
              <p>Next action: {topItem.nextAction?.label}</p>
            </>
          ) : (
            <p>No active galleries.</p>
          )}
        </div>
      </div>

      {topItem && (
        <div style={{ marginTop: '1rem' }}>
          {topItem.nextAction && (
            <NextActionCard
              action={topItem.nextAction}
              actionLabel={topItem.nextAction.code === 'UNLOCK_DOWNLOADS' ? 'Unlock downloads' : undefined}
              onAction={
                topItem.nextAction.code === 'UNLOCK_DOWNLOADS' && onUnlockDownloads
                  ? () => void onUnlockDownloads(topItem.galleryId)
                  : undefined
              }
            />
          )}
        </div>
      )}

      <div className="dashboard-grid" style={{ marginTop: '1rem' }}>
        <div className="admin-card">
          <h4>Needs attention</h4>
          {queue.length === 0 ? (
            <p className="empty-note">No galleries currently require action.</p>
          ) : (
            queue.slice(0, 5).map(item => (
              <div key={item.galleryId} className="audit-preview__item" style={{ marginBottom: '0.75rem' }}>
                <strong>{item.galleryTitle}</strong>
                <span>{item.clientName}</span>
                {item.nextAction && (
                  <>
                    <small>{item.nextAction.label}</small>
                    <small>{item.nextAction.reason}</small>
                  </>
                )}
                <div style={{ marginTop: '0.5rem' }}>
                  <GalleryHealth items={item.health} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="admin-card">
          <h4>Live activity</h4>
          {liveActivity.length === 0 ? (
            <p className="empty-note">No recent activity yet.</p>
          ) : (
            <div className="audit-preview">
              {liveActivity.map(log => (
                <article key={log.id} className="audit-preview__item">
                  <strong>[{log.action}]</strong>
                  <span>{log.details}</span>
                  <time>{new Date(log.created_at).toLocaleString()}</time>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
