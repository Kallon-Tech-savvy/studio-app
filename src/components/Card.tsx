import type {
  PropsWithChildren,
} from 'react'

interface CardProps {
  className?: string
}

export function Card({
  children,
  className = '',
}: PropsWithChildren<CardProps>) {
  return (
    <section
      className={`admin-card ${className}`}
    >
      {children}
    </section>
  )
}