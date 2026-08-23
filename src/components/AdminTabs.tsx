import {
  BadgeIcon,
  CameraIcon,
  DashIcon,
  ScrollIcon,
  UsersIcon,
} from './icon'

type AdminTab =
  | 'dashboard'
  | 'galleries'
  | 'clients'
  | 'staff'
  | 'logs'

interface AdminTabsProps {
  activeTab: AdminTab
  onChange: (tab: AdminTab) => void

  galleryCount: number
  clientCount: number

  canViewFinances: boolean
  canManageStaff: boolean
}

export function AdminTabs({
  activeTab,
  onChange,
  galleryCount,
  clientCount,
  canViewFinances,
  canManageStaff,
}: AdminTabsProps) {
  const tabs = [
    {
      id: 'dashboard' as const,
      label: 'Dashboard',
      icon: <DashIcon />,
    },

    {
      id: 'galleries' as const,
      label: `Galleries (${galleryCount})`,
      icon: <CameraIcon />,
    },

    ...(canViewFinances
      ? [
          {
            id: 'clients' as const,
            label: `Clients (${clientCount})`,
            icon: <UsersIcon />,
          },
        ]
      : []),

    ...(canManageStaff
      ? [
          {
            id: 'staff' as const,
            label: 'Team',
            icon: <BadgeIcon />,
          },
          {
            id: 'logs' as const,
            label: 'Audit Logs',
            icon: <ScrollIcon />,
          },
        ]
      : []),
  ]

  return (
    <nav
      className="admin-tabs"
      aria-label="Admin sections"
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`admin-tab ${
            activeTab === tab.id
              ? 'admin-tab--active'
              : ''
          }`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}