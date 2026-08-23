import type {
  ButtonHTMLAttributes,
  PropsWithChildren,
} from 'react'

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'danger'
    | 'ghost'
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      {...props}
      className={`admin-button admin-button--${variant} ${className}`}
    >
      {children}
    </button>
  )
}