import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import { carteraErrorMessage } from '@/lib/sheets-cartera'
import { parseFecha } from '@/lib/fecha'

// Días hacia atrás que cubre la respuesta. El período más largo de la vista
// de supervisión es "último mes" (30 días); el margen evita recortes por
// zonas horarias.
const DIAS_VENTANA = 40

function toISO(f: { dia: number; mes: number; year: number }): string {
  const mm = String(f.mes + 1).padStart(2, '0')
  const dd = String(f.dia).padStart(2, '0')
  return `${f.year}-${mm}-${dd}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const role = (session.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'gestion_cartera', perms)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const corte = new Date()
    corte.setDate(corte.getDate() - DIAS_VENTANA)
    const desde = corte.toISOString().slice(0, 10)

    // RAW_Recibos trae una fila por (recibo, factura); la suma de
    // 'Total Pagado ($)' de las filas es el recaudo total.
    const rows = rowsToObjects(await getSheetData('RAW_Recibos'))
    const recaudos = rows
      .map((r) => {
        const f = parseFecha(r['Fecha Pago'])
        return {
          nit:     r['NIT']?.trim() ?? '',
          cliente: r['Cliente']?.trim() ?? '',
          recibo:  r['Recibo']?.trim() ?? '',
          factura: r['Factura']?.trim() ?? '',
          fecha:   f ? toISO(f) : '',
          monto:   parseNum(r['Total Pagado ($)'] ?? ''),
        }
      })
      .filter((r) => r.fecha >= desde && r.monto !== 0)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))

    return NextResponse.json({ recaudos })
  } catch (e) {
    return NextResponse.json({ error: carteraErrorMessage(e) }, { status: 500 })
  }
}
