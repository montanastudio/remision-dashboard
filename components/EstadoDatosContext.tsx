'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface EstadoDatos {
  loading: boolean
  fechaInfoISO: string | null      // YYYY-MM-DD del último día con datos
  fechaInfoLabel: string | null    // "16 de julio de 2026"
  actualizadoLabel: string | null  // "19 jul 2026, 8:32 a. m." o null
}

const Ctx = createContext<EstadoDatos>({
  loading: true, fechaInfoISO: null, fechaInfoLabel: null, actualizadoLabel: null,
})

export const useEstadoDatos = () => useContext(Ctx)

export function EstadoDatosProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EstadoDatos>({
    loading: true, fechaInfoISO: null, fechaInfoLabel: null, actualizadoLabel: null,
  })

  useEffect(() => {
    let alive = true
    fetch('/api/ultima-fecha')
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        setState({
          loading: false,
          fechaInfoISO: d?.fechaInfoISO ?? null,
          fechaInfoLabel: d?.ok ? (d?.fecha ?? null) : null,
          actualizadoLabel: d?.actualizadoLabel ?? null,
        })
      })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false })) })
    return () => { alive = false }
  }, [])

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}
