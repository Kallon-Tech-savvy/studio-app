import {
  useMemo,
  useState,
} from 'react'

import type {
  Session,
} from '@supabase/supabase-js'

import type {
  StaffMember,
} from './types'

// This stylesheet holds every admin-panel-specific class used below
// (.admin-panel, .admin-button, .stat-card, .admin-table, and so on).
// It was never actually imported anywhere in the app, which meant the
// entire studio dashboard — the part staff use every day — was
// rendering with none of its intended styling at all.
import './styles/admin.css'

import {
  calculateBalance,
  selectFinancialSummary,
} from './domain/finance'

import {
  createGalleryClientIndex,
} from './domain/admin'

import {
  useAdminData,
} from './hooks/useAdminData'

import {
  AdminHeader,
} from './components/AdminHeader'

import {
  AdminNoticeProvider,
} from './components/AdminNotice'

import {
  AdminTabs,
} from './components/AdminTabs'

import {
  DashboardView,
} from './components/DashboardView'

import {
  GalleriesView,
} from './components/GalleriesView'

import {
  ClientsView,
} from './components/ClientsView'

import {
  LogsView,
} from './components/LogsView'

import {
  StaffView,
} from './components/StaffView'



type AdminTab =
  | 'dashboard'
  | 'galleries'
  | 'clients'
  | 'staff'
  | 'logs'

interface AdminPanelProps {
  session: Session
  staff: StaffMember
}

export function AdminPanel({
  session,
  staff,
}: AdminPanelProps) {
  const canManageStaff =
    Boolean(
      staff.permissions.manageStaff,
    )

  const canManageGalleries =
    Boolean(
      staff.permissions
        .manageGalleries,
    )

  const canUploadPhotos =
    Boolean(
      staff.permissions.uploadPhotos,
    )

  const canViewFinances =
    Boolean(
      staff.permissions.viewFinances,
    )

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<AdminTab>('dashboard')

  const data = useAdminData({
    accessToken:
      session.access_token,

    canViewFinances,

    canManageStaff,
  })

  const galleriesByClientId =
    useMemo(
      () =>
        createGalleryClientIndex(
          data.galleries,
        ),
      [data.galleries],
    )

  const financialSummary =
    useMemo(
      () =>
        canViewFinances
          ? selectFinancialSummary(
              data.clients,
            )
          : selectFinancialSummary([]),
      [
        data.clients,
        canViewFinances,
      ],
    )

  return (
    <AdminNoticeProvider>
      <section className="darkroom admin-panel">
        <AdminHeader
          session={session}
          staff={staff}
        />

      <AdminTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        galleryCount={
          data.galleries.length
        }
        clientCount={
          data.clients.length
        }
        canViewFinances={
          canViewFinances
        }
        canManageStaff={
          canManageStaff
        }
      />

      {!canManageGalleries &&
        !canUploadPhotos && (
          <p className="status-note">
            Your account (
            {staff.role}) doesn't have
            gallery-management or
            upload permissions yet.
            Ask an owner to grant
            access — you can still
            browse what's here.
          </p>
        )}

      {data.loading && (
        <div
          className="admin-loading"
          role="status"
        >
          Loading studio workspace…
        </div>
      )}

      {data.error && (
        <div
          className="admin-error"
          role="alert"
        >
          {data.error}
        </div>
      )}

      {activeTab ===
        'dashboard' && (
        <DashboardView
          galleries={
            data.galleries
          }
          logs={data.logs}
          clientCount={
            data.clients.length
          }
          financialSummary={
            financialSummary
          }
          canViewFinances={
            canViewFinances
          }
          onOpenGalleries={() =>
            setActiveTab(
              'galleries',
            )
          }
          onOpenClients={() =>
            setActiveTab(
              'clients',
            )
          }
        />
      )}

      {activeTab ===
        'galleries' && (
        <GalleriesView
          accessToken={
            session.access_token
          }
          galleries={
            data.galleries
          }
          clients={
            data.clients
          }
          albums={data.albums}
          photos={data.photos}
          canManageGalleries={
            canManageGalleries
          }
          canUploadPhotos={
            canUploadPhotos
          }
          loadGalleries={
            data.loadGalleries
          }
          loadAlbums={
            data.loadAlbums
          }
          loadPhotos={
            data.loadPhotos
          }
          loadLogs={
            data.loadLogs
          }
        />
      )}

      {activeTab ===
        'clients' &&
        canViewFinances && (
          <ClientsView
            accessToken={
              session.access_token
            }
            clients={
              data.clients
            }
            galleries={
              data.galleries
            }
            galleriesByClientId={
              galleriesByClientId
            }
            loadClients={
              data.loadClients
            }
            loadGalleries={
              data.loadGalleries
            }
            loadLogs={
              data.loadLogs
            }
          />
        )}

      {activeTab ===
        'staff' &&
        canManageStaff && (
          <StaffView
            staff={data.staff}
            accessToken={
              session.access_token
            }
            currentEmail={
              staff.email
            }
            onRefresh={
              data.loadStaff
            }
          />
        )}

      {activeTab ===
        'logs' &&
        canManageStaff && (
          <LogsView
            logs={data.logs}
          />
        )}
      </section>
    </AdminNoticeProvider>
  )
}