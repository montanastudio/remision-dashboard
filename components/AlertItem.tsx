'use client'

type AlertType = 'critical' | 'warn' | 'ok'

interface AlertItemProps {
  type: AlertType
  title: string
  description: string
}

const config: Record<AlertType, { classes: string; titleClass: string; borderColor: string }> = {
  critical: {
    classes: 'bg-red-50 dark:bg-red-950/60',
    titleClass: 'text-red-600 dark:text-red-400',
    borderColor: '#dc2626',
  },
  warn: {
    classes: 'bg-orange-50 dark:bg-orange-950/60',
    titleClass: 'text-orange-600 dark:text-orange-400',
    borderColor: '#ea580c',
  },
  ok: {
    classes: 'bg-green-50 dark:bg-green-950/60',
    titleClass: 'text-green-700 dark:text-green-400',
    borderColor: '#16a34a',
  },
}

export default function AlertItem({ type, title, description }: AlertItemProps) {
  const c = config[type]
  return (
    <div
      className={`rounded-[8px] p-[10px_14px] mb-2 last:mb-0 ${c.classes}`}
      style={{ borderLeft: `3px solid ${c.borderColor}` }}
    >
      <div className={`text-[12px] font-semibold mb-1 ${c.titleClass}`}>
        {title}
      </div>
      <div className="text-[11.5px] text-[var(--text-sub)] leading-[1.5]">{description}</div>
    </div>
  )
}
