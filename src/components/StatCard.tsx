interface StatCardProps {
  label: string
  value: string | number
  subtext?: string
  tone?: 'default' | 'positive' | 'warning' | 'danger'
}

export function StatCard({ label, value, subtext, tone = 'default' }: StatCardProps) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      {subtext && <span className="stat-card__subtext">{subtext}</span>}
    </article>
  )
}

