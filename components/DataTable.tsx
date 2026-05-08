import React, { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  render?: (row: T, i: number) => ReactNode
  mono?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  maxHeight?: number
}

export default function DataTable<T extends Record<string, string | number | undefined | null | React.ReactNode>>({
  columns,
  data,
  maxHeight = 320,
}: DataTableProps<T>) {
  return (
    <div className="table-scroll" style={{ maxHeight }}>
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 bg-[var(--card)] z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-[10px] py-[9px] text-[var(--text-sub)] ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                  } ${col.mono ? 'num text-[11px]' : ''}`}
                >
                  {col.render ? col.render(row, i) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
