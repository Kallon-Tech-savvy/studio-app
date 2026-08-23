import { useState } from 'react'

import type { StaffPermissionSet, StaffRecord, StaffRole } from '../types'
import { adminApi } from '../services/adminApi'
import { useAdminNotice, describeError } from './AdminNotice'

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
]

const PERMISSION_FIELDS: { key: keyof StaffPermissionSet; label: string; hint: string }[] = [
  { key: 'manageGalleries', label: 'Manage galleries', hint: 'Create, edit, and delete galleries and albums' },
  { key: 'uploadPhotos', label: 'Upload photos', hint: 'Add and remove photos from galleries' },
  { key: 'viewFinances', label: 'View finances', hint: 'See the Clients tab and payment balances' },
  { key: 'manageStaff', label: 'Manage staff', hint: 'Grant permissions and see this page' },
]

interface StaffViewProps {
  staff: StaffRecord[]
  accessToken: string
  currentEmail: string
  onRefresh: () => Promise<void>
}

export function StaffView({ staff, accessToken, currentEmail, onRefresh }: StaffViewProps) {
  const notify = useAdminNotice()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { role: StaffRole; permissions: StaffPermissionSet; is_active: boolean }>>({})

  function draftFor(member: StaffRecord) {
    return drafts[member.id] ?? { role: member.role, permissions: member.permissions, is_active: member.is_active }
  }

  function updateDraft(member: StaffRecord, updates: Partial<{ role: StaffRole; permissions: StaffPermissionSet; is_active: boolean }>) {
    setDrafts(current => ({
      ...current,
      [member.id]: { ...draftFor(member), ...updates },
    }))
  }

  function isDirty(member: StaffRecord) {
    const draft = drafts[member.id]
    if (!draft) return false
    return (
      draft.role !== member.role ||
      draft.is_active !== member.is_active ||
      PERMISSION_FIELDS.some(field => draft.permissions[field.key] !== member.permissions[field.key])
    )
  }

  async function save(member: StaffRecord) {
    const draft = draftFor(member)
    setSavingId(member.id)

    try {
      await adminApi.staff.update(accessToken, member.id, {
        role: draft.role,
        permissions: draft.permissions,
        is_active: draft.is_active,
      })

      await onRefresh()
      setDrafts(current => {
        const next = { ...current }
        delete next[member.id]
        return next
      })
      notify(`Updated access for ${member.full_name || member.email}.`, 'success')
    } catch (error) {
      notify(describeError(error, "Couldn't save that — please try again."), 'error')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="admin-view">
      <h3 className="section-heading">Studio Team</h3>

      <p className="status-note">
        Anyone who creates a staff account lands here automatically with every permission turned off —
        that's on purpose, so a stranger can't self-register their way into your galleries. Turn on
        whatever each person actually needs below.
      </p>

      {staff.length === 0 ? (
        <p className="empty-note">No staff accounts yet.</p>
      ) : (
        <div className="staff-list">
          {staff.map(member => {
            const draft = draftFor(member)
            const isSelf = member.email.toLowerCase() === currentEmail.toLowerCase()
            const dirty = isDirty(member)

            return (
              <div className="staff-card" key={member.id}>
                <div className="staff-card__identity">
                  <strong>{member.full_name || member.email}</strong>
                  <span className="empty-note" style={{ margin: 0 }}>{member.email}</span>
                  {!member.is_active && <span className="payment-status payment-status--outstanding">Deactivated</span>}
                </div>

                <div className="field">
                  <label>Role</label>
                  <select
                    value={draft.role}
                    disabled={isSelf}
                    onChange={event => {
                      const newRole = event.target.value as StaffRole
                      const newPermissions = { ...draft.permissions }
                      
                      if (newRole === 'photographer') {
                        newPermissions.uploadPhotos = true
                        newPermissions.manageGalleries = true
                      } else if (newRole === 'owner' || newRole === 'admin') {
                        newPermissions.manageGalleries = true
                        newPermissions.uploadPhotos = true
                        newPermissions.viewFinances = true
                        newPermissions.manageStaff = true
                      }

                      updateDraft(member, { role: newRole, permissions: newPermissions })
                    }}
                  >
                    {ROLE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="staff-card__permissions">
                  {PERMISSION_FIELDS.map(field => (
                    <label className="checkbox-field" key={field.key} title={field.hint}>
                      <input
                        type="checkbox"
                        checked={draft.permissions[field.key]}
                        disabled={isSelf}
                        onChange={event =>
                          updateDraft(member, {
                            permissions: { ...draft.permissions, [field.key]: event.target.checked },
                          })
                        }
                      />
                      {field.label}
                    </label>
                  ))}
                </div>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    disabled={isSelf}
                    onChange={event => updateDraft(member, { is_active: event.target.checked })}
                  />
                  Active — unchecking blocks this person from signing in
                </label>

                {isSelf ? (
                  <p className="field-hint">
                    You can't change your own access — ask another owner or admin to do it.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="admin-button admin-button--primary"
                    disabled={!dirty || savingId === member.id}
                    onClick={() => save(member)}
                  >
                    {savingId === member.id ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
