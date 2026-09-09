import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import type { StaffMember } from '../types'

interface AdminHeaderProps {
  session: Session
  staff: StaffMember
}

export function AdminHeader({
  staff,
}: AdminHeaderProps) {
  const [signingOut, setSigningOut] = useState(false)
  const displayName =
    staff.name ||
    staff.email.split('@')[0]

  async function handleSignOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) setSigningOut(false)
  }

  return (
    <header className="admin-header">
      <div>
        <h2>
          Welcome back, {displayName}
        </h2>
      </div>

      <div className="admin-header__actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        
        {/* Gamification Stats */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
          <div title="Current Streak" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--warning)', fontWeight: 'bold' }}>
            🔥 {staff.current_streak || 0}
          </div>
          <div title="Experience Points" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)', fontWeight: 'bold' }}>
            ⚡ {staff.experience_points || 0} XP
          </div>
          <div title="Photographer Level" style={{ background: 'var(--accent)', color: '#000', padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.8rem' }}>
            LVL {Math.floor((staff.experience_points || 0) / 100) + 1}
          </div>
        </div>

        <span
          className={`role-badge ${
            staff.role === 'owner'
              ? 'role-badge--owner'
              : ''
          }`}
        >
          {staff.role}
        </span>

        <button
          type="button"
          className="admin-button admin-button--secondary"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </header>
  )
}