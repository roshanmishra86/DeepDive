interface ToggleSwitchProps {
  checked: boolean
  onChange: (on: boolean) => void
  /** Accessible name; matches the visible row label. */
  label: string
}

/** Real switch control (role="switch" + aria-checked), not a static span. */
export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? 'lib-switch lib-switch-on' : 'lib-switch'}
      onClick={() => onChange(!checked)}
    >
      <span className="lib-switch-knob" aria-hidden />
    </button>
  )
}
