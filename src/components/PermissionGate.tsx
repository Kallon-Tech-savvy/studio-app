import type {
  PropsWithChildren,
} from 'react'

interface PermissionGateProps {
  allowed: boolean
  fallback?: React.ReactNode
}

export function PermissionGate({
  allowed,
  fallback = null,
  children,
}: PropsWithChildren<PermissionGateProps>) {
  if (!allowed) {
    return <>{fallback}</>
  }

  return <>{children}</>
}