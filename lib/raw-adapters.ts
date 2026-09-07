/**
 * Traducción de los archivos crudos del ERP (carpeta de Drive) al formato de
 * las hojas RAW_* que consume el dashboard.
 *
 * Antes esta transformación vivía en un Apps Script de 8 pasos que escribía el
 * spreadsheet intermedio (ver pestaña LOG_Proceso). Al leer la carpeta directo,
 * el dashboard tiene que hacerla él mismo.
 *
 * REGLA DE ORO: cada adaptador devuelve EXACTAMENTE los encabezados que ya
 * emitía la hoja correspondiente. Así ninguna página, componente o parser
 * (normalizeVentasColumns, cartera-normalize, kardex, rotacion, recaudos)
 * necesita cambiar.
 */

/* ────────────────────────── helpers de valor ────────────────────────── */

/** Igual que parseNum de lib/sheets, replicado aquí para evitar un ciclo de imports. */
function num(val: string | undefined): number {
  if (!val) return 0
  let s = String(val).trim()
  if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '')
  s = s.replace(/[^0-9.-]/g, '')
  return parseFloat(s) || 0
}

/**
 * Canoniza un número al formato que emitía el sheet: sin ceros de cola.
 * El ERP exporta "10584008.00" y "0.00"; la hoja guardaba "10584008" y "0".
 * Una celda vacía es 0 (así lo hacían las columnas de aging de RAW_Recibos).
 */
function n(val: string | undefined): string {
  const v = num(val)
  if (!Number.isFinite(v)) return '0'
  return String(Number(v.toFixed(4)))
}

/**
 * Reparación de la Ñ cuando los datos llegan convertidos a Google Sheets.
 *
 * El ERP escribe la Ñ de dos formas según en qué terminal se digitó el registro
 * (0xD1 de Windows-1252 y 0xA5 de CP850 de DOS). El conversor a Sheets decodifica
 * todo como CP850, así que acierta con los registros de DOS y destroza los de
 * Windows: "MARIÑO" llega como "MARIÐO" y "NIÑO" como "NI±O".
 *
 * En los seis archivos solo existen cuatro caracteres no-ASCII: Ñ y ñ (correctos,
 * 2.964 casos) y Ð y ± (corruptos, 3.940). Ni Ð ni ± aparecen legítimamente en
 * nombres colombianos —los casos reales son OCAÑA, CARREÑO, MUÑOZ, NIÑO DIOS—
 * así que la corrección no es ambigua.
 *
 * Leyendo los .DBF directamente esto no hace falta (no traen Ð ni ±), pero se
 * aplica siempre: es inofensivo y cubre el día en que vuelvan a subir la
 * conversión en vez del archivo original.
 */
const MOJIBAKE: Record<string, string> = { 'Ð': 'Ñ', '\u00b1': 'ñ' }

/** Texto tal cual, sin espacios sobrantes y con la Ñ reparada. */
function t(val: string | undefined): string {
  const s = (val ?? '').trim()
  return /[Ð\u00b1]/.test(s) ? s.replace(/[Ð\u00b1]/g, c => MOJIBAKE[c]) : s
}

/**
 * Quita los ceros a la izquierda de los códigos numéricos. El ERP exporta
 * "01290040" y la hoja guardaba "1290040"; sin esto los cruces entre ventas,
 * kardex, movimientos e inventario fallan en silencio.
 */
function cod(val: string | undefined): string {
  const s = t(val)
  // Solo dígitos, con parte decimal opcional: el ERP exporta "003369." y
  // "01290040". Lo que lleve letras o guiones (referencias, NITs con dígito de
  // verificación) se deja intacto. El tope de 15 dígitos evita que un valor
  // largo pierda precisión al pasar por Number.
  if (!/^\d+\.?\d*$/.test(s) || s.replace(/\D/g, '').length > 15) return s
  const n = Number(s)
  return Number.isFinite(n) ? String(n) : s
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * Normaliza una fecha del ERP a DD/MM/YYYY.
 *
 * El orden de los componentes depende de POR DÓNDE vengan los datos: los .DBF
 * del ERP traen DD/MM/YYYY, pero si alguien sube la conversión a Google Sheets,
 * Sheets reinterpreta las fechas y las reescribe como MM/DD/YYYY. Leerlas sin
 * distinguir invierte día y mes sin lanzar ningún error, así que el orden se
 * detecta de los propios datos con detectarOrdenFecha().
 *
 * Si el primer componente es > 12 no puede ser un mes, así que se interpreta
 * como día pase lo que pase — red de seguridad por si el ERP cambia el formato.
 */
export function normFecha(val: string | undefined, orden: 'MDY' | 'DMY'): string {
  const s = t(val)
  if (!s) return ''
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!m) return s
  const a = +m[1], b = +m[2]
  let y = +m[3]
  if (y < 100) y += 2000

  let dia: number, mes: number
  if (orden === 'MDY' && a <= 12) { mes = a; dia = b }
  else if (orden === 'MDY')       { dia = a; mes = b }   // a > 12 → no es mes
  else if (b <= 12)               { dia = a; mes = b }
  else                            { mes = a; dia = b }

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return s
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${y}`
}

/**
 * Deduce si un lote de filas trae las fechas como DD/MM o MM/DD, mirando los
 * datos: basta con que un componente pase de 12 para saber que es el día.
 * Con miles de filas siempre aparece un 13+; si no aparece ninguno, o si
 * aparecen en ambas posiciones (datos mezclados), se usa `porDefecto`.
 */
export function detectarOrdenFecha(
  filas: Fila[], campos: string[], porDefecto: 'MDY' | 'DMY' = 'DMY',
): 'MDY' | 'DMY' {
  let primero = false, segundo = false
  for (const f of filas) {
    for (const c of campos) {
      const m = (f[c] ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-]\d{2,4}$/)
      if (!m) continue
      if (+m[1] > 12) primero = true
      if (+m[2] > 12) segundo = true
      if (primero && segundo) return porDefecto   // contradictorio: no arriesgar
    }
  }
  if (primero) return 'DMY'
  if (segundo) return 'MDY'
  return porDefecto
}

/** 'DD/MM/YYYY' → Date local, o null. */
export function aDate(ddmmyyyy: string): Date | null {
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const d = new Date(+m[3], +m[2] - 1, +m[1])
  return isNaN(d.getTime()) ? null : d
}

const DIA_MS = 86_400_000
function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / DIA_MS)
}

/* ────────────────────────── infraestructura ────────────────────────── */

export type Fila = Record<string, string>

function aObjetos(rows: string[][]): Fila[] {
  if (rows.length < 2) return []
  const [headers, ...data] = rows
  const limpios = headers.map(h => t(h))
  return data.map(row => {
    const o: Fila = {}
    limpios.forEach((h, i) => { if (h) o[h] = row[i] ?? '' })
    return o
  })
}

/** Descarta las filas totalmente vacías que deja el ERP al final del rango. */
function conDatos(filas: Fila[], clave: string): Fila[] {
  return filas.filter(f => t(f[clave]) !== '')
}

function aMatriz(headers: string[], filas: Fila[]): string[][] {
  return [headers, ...filas.map(f => headers.map(h => f[h] ?? ''))]
}

/* ────────────────────────────── VENTAS ────────────────────────────── */

const HEADERS_VENTAS = [
  'NIT', 'Cliente', 'Ciudad', 'Cód. Vendedor', 'Vendedor', 'Tipo Fac.', 'Factura',
  'Fecha', 'Año', 'Mes', 'Grupo/Marca', 'Línea', 'Código', 'Referencia', 'Producto',
  'Cantidad', 'Costo ($)', 'Vr. Neto ($)', 'Vr. con IVA ($)', 'IVA Aplicado',
  'Devolución', 'Representa',
]

/**
 * Hasta el 31/10/2025 el ERP desglosaba IVA por línea y 'Vr. Neto' era un 19%
 * mayor que 'Vr. con IVA'; desde esa fecha ambas columnas son idénticas.
 * El archivo crudo solo trae VRTOTAL (= 'Vr. con IVA'), así que 'Vr. Neto' e
 * 'IVA Aplicado' se reconstruyen con esa regla. Ninguna página las lee hoy —
 * se emiten solo para que las exportaciones sigan teniendo las mismas columnas.
 *
 * La regla reproduce la hoja anterior en las 28.947 filas, sin una sola
 * excepción: la columna 'IVA Aplicado' del sheet coincidía con la fecha en
 * 27.265 de 27.265 casos con valor.
 */
// El 31/10/2025 todavía lleva IVA: el corte es inclusivo. Se guarda el día
// siguiente para poder comparar con "<" sin equivocarse en el borde — con
// "< 31/10" se quedaban por fuera 113 líneas de ese día, $9.391.117.
const CORTE_IVA = new Date(2025, 10, 1)

export function adaptVentas(rows: string[][]): string[][] {
  const crudas = conDatos(aObjetos(rows), 'FACTURA')
  const orden = detectarOrdenFecha(crudas, ['FECHA', 'VENCE'])
  const filas = crudas.map((r): Fila => {
    const fecha = normFecha(r['FECHA'], orden)
    const d = aDate(fecha)
    const conIva = num(r['VRTOTAL'])
    const preCorte = d !== null && d < CORTE_IVA
    return {
      'NIT':            cod(r['IDCLIENTE']),
      'Cliente':        t(r['NCLIENTE']),
      'Ciudad':         t(r['CIUDAD']),
      'Cód. Vendedor':  cod(r['VENDEDOR']),
      'Vendedor':       t(r['NVENDEDOR']),
      'Tipo Fac.':      t(r['TIPOFAC']),
      'Factura':        t(r['FACTURA']),
      'Fecha':          fecha,
      'Año':            d ? String(d.getFullYear()) : '',
      'Mes':            d ? `${MESES[d.getMonth()]} ${d.getFullYear()}` : '',
      'Grupo/Marca':    t(r['NGRUPO']),
      // NLINEA es el nombre de la línea; LINEA es el código y no se usa aquí.
      'Línea':          t(r['NLINEA']),
      'Código':         cod(r['CODIGO']),
      'Referencia':     t(r['REFERENCIA']),
      'Producto':       t(r['PRODUCTO']),
      'Cantidad':       n(r['CANTIDAD']),
      'Costo ($)':      n(r['COSTO']),
      'Vr. Neto ($)':   String(Math.round(preCorte ? conIva * 1.19 : conIva)),
      'Vr. con IVA ($)': n(r['VRTOTAL']),
      'IVA Aplicado':   preCorte ? 'SI' : 'NO',
      // Una devolución es una línea con cantidad negativa. Verificado contra las
      // 28.947 filas de la hoja: la correspondencia es exacta (el tipo de
      // factura NO sirve — DE/DV/DM aparecen en ambos lados).
      'Devolución':     num(r['CANTIDAD']) < 0 ? 'SI' : 'NO',
      // Nombre comercial del cliente. El archivo crudo lo trae como columna
      // propia; hasta ahora había que sacarlo partiendo 'Cliente' por "/".
      'Representa':     t(r['REPRESENTA']),
    }
  })
  return aMatriz(HEADERS_VENTAS, filas)
}

/** RAW_Ventas filtrada por año, como hacían RAW_Ventas_2025 / _2026. */
export function filtrarVentasPorAño(matriz: string[][], año: number): string[][] {
  if (matriz.length < 2) return matriz
  const [headers, ...data] = matriz
  const iAño = headers.indexOf('Año')
  return [headers, ...data.filter(r => r[iAño] === String(año))]
}

/* ────────────────────────────── CARTERA ────────────────────────────── */

const HEADERS_CARTERA = [
  'NIT', 'Cliente', 'Zona', 'Ciudad', 'Teléfono', 'Dirección', 'Tipo', 'Factura',
  'Fecha Factura', 'Fecha Vence', 'Días', 'Días Desde Factura',
  'Días Vencido (Sistema)', 'Bucket', 'Estado', 'Total ($)', 'Abonado ($)',
  'Saldo ($)', 'Cód. Vendedor', 'Vendedor', 'Alerta',
]

/**
 * Clasificación por DÍAS DESDE LA FACTURA (plazo de pago: 45 días). Es la misma
 * regla documentada en cartera-normalize.ts, que hasta ahora aplicaba el script
 * de importación. El archivo crudo no trae la columna Bucket.
 */
export function bucketPorDias(diasDesdeFactura: number): string {
  if (diasDesdeFactura <= 30) return 'No vencida'
  if (diasDesdeFactura <= 45) return 'Próximo a vencer'
  if (diasDesdeFactura <= 60) return 'Vencida'
  if (diasDesdeFactura <= 75) return 'Mora'
  if (diasDesdeFactura <= 90) return 'Prejurídico'
  return 'Jurídico'
}

/**
 * @param corte fecha del archivo (del sufijo del nombre). Es la referencia
 *        contra la que el ERP calculó DIAS, y contra la que se cuentan los
 *        días desde factura.
 */
export function adaptCartera(rows: string[][], corte: Date): string[][] {
  const crudas = conDatos(aObjetos(rows), 'FACTURA')
  const orden = detectarOrdenFecha(crudas, ['FECHAF', 'FECHAV'])
  const filas = crudas.map((r): Fila => {
    const fFactura = normFecha(r['FECHAF'], orden)
    const fVence   = normFecha(r['FECHAV'], orden)
    const dFactura = aDate(fFactura)
    const dVence   = aDate(fVence)
    const desdeFactura = dFactura ? diasEntre(dFactura, corte) : 0
    // DIAS del ERP cuenta desde el VENCIMIENTO: negativo = aún no vence.
    // Es la semántica que asumen resumen-diario y clientes ("Días > 0 = vencida").
    const diasVencido = n(r['DIAS'])
    return {
      'NIT':            cod(r['IDCLIENTE']),
      'Cliente':        t(r['NCLIENTE']),
      'Zona':           t(r['ZONA']),
      'Ciudad':         t(r['CIUDAD']),
      'Teléfono':       t(r['TELEFONO']),
      'Dirección':      t(r['DIRECCION']),
      'Tipo':           t(r['TIPO']),
      'Factura':        t(r['FACTURA']),
      'Fecha Factura':  fFactura,
      'Fecha Vence':    fVence,
      'Días':                   diasVencido,
      'Días Vencido (Sistema)': diasVencido,
      'Días Desde Factura':     String(desdeFactura),
      'Bucket':         bucketPorDias(desdeFactura),
      // Clasificación manual del ERP. Se conserva, pero el bucket NO se deriva
      // de aquí: ambas se contradicen en decenas de facturas.
      'Estado':         t(r['ESTADO']),
      'Total ($)':      n(r['TOTAL']),
      // 'Abonado ($)', no 'Abonos ($)': es el nombre que emitía la hoja anterior
      // y el que leen CarteraInteractivo y el detalle de gestión de cartera.
      'Abonado ($)':    n(r['ABONA']),
      'Saldo ($)':      n(r['CANCELA']),
      'Cód. Vendedor':  cod(r['VENDEDOR']),
      'Vendedor':       t(r['NVENDEDOR']),
      'Alerta':         dVence && dFactura && dVence <= dFactura
                          ? 'Fecha de vencimiento inválida' : '',
    }
  })
  return aMatriz(HEADERS_CARTERA, filas)
}

/* ───────────────────────────── RECAUDOS ───────────────────────────── */

const HEADERS_RECIBOS = [
  'NIT', 'Cliente', 'Recibo', 'Fecha Pago', 'Factura', 'Fecha Vence', 'Días',
  'Sin Vencer ($)', '1-30 días ($)', '31-60 días ($)', '61-90 días ($)',
  '+90 días ($)', 'Total Pagado ($)',
]

export function adaptRecaudo(rows: string[][]): string[][] {
  const crudas = conDatos(aObjetos(rows), 'RECIBO')
  const orden = detectarOrdenFecha(crudas, ['FECHA', 'VENCE'])
  const filas = crudas.map((r): Fila => ({
    'NIT':               cod(r['IDCLIENTE']),
    'Cliente':           t(r['NCLIENTE']),
    'Recibo':            t(r['RECIBO']),
    'Fecha Pago':        normFecha(r['FECHA'], orden),
    'Factura':           t(r['FACTURA']),
    'Fecha Vence':       normFecha(r['VENCE'], orden),
    'Días':              n(r['DIAS']),
    'Sin Vencer ($)':    n(r['DIA00']),
    '1-30 días ($)':     n(r['DIA30']),
    '31-60 días ($)':    n(r['DIA60']),
    '61-90 días ($)':    n(r['DIA90']),
    '+90 días ($)':      n(r['DIAXX']),
    'Total Pagado ($)':  n(r['CANCELA']),
  }))
  return aMatriz(HEADERS_RECIBOS, filas)
}

/* ──────────────────────────── MOVIMIENTOS ─────────────────────────── */

const HEADERS_MOVIMIENTOS = [
  'Bodega', 'Documento', 'Fecha', 'Transacción', 'Código', 'Producto',
  'Cantidad', 'Vr. Unitario ($)', 'Vr. Total ($)', 'Detalle',
]

export function adaptMovimiento(rows: string[][]): string[][] {
  const crudas = conDatos(aObjetos(rows), 'DOCUMENTO')
  const orden = detectarOrdenFecha(crudas, ['FECHA'])
  const filas = crudas.map((r): Fila => ({
    'Bodega':            t(r['DIGITADO']),
    'Documento':         cod(r['DOCUMENTO']),
    'Fecha':             normFecha(r['FECHA'], orden),
    'Transacción':       t(r['TRANSACC']),
    'Código':            cod(r['CODIGO']),
    'Producto':          t(r['PRODUCTO']),
    'Cantidad':          n(r['CANTIDAD']),
    'Vr. Unitario ($)':  n(r['VRUNIDAD']),
    'Vr. Total ($)':     n(r['VRTOTAL']),
    'Detalle':           t(r['DETALLE']),
  }))
  return aMatriz(HEADERS_MOVIMIENTOS, filas)
}

/* ────────────────────────────── KARDEX ────────────────────────────── */

const HEADERS_KARDEX = [
  'Bodega', 'Ubicación', 'Código', 'Referencia', 'Grupo', 'Línea', 'Producto',
  'Tipo', 'Transacción', 'Documento', 'Fecha', 'Entradas', 'Salidas',
  'Vr. Unitario ($)', 'Saldo', 'Vr. Existencia ($)',
]

export function adaptKardex(rows: string[][]): string[][] {
  const crudas = conDatos(aObjetos(rows), 'CODIGO')
  const orden = detectarOrdenFecha(crudas, ['FECHA'])
  const filas = crudas.map((r): Fila => ({
    'Bodega':             n(r['FISICO01']),
    'Ubicación':          t(r['UBICACION']),
    'Código':             cod(r['CODIGO']),
    'Referencia':         t(r['REFERENCIA']),
    'Grupo':              cod(r['GRUPO']),
    'Línea':              cod(r['LINEA']),
    'Producto':           t(r['PRODUCTO']),
    'Tipo':               t(r['TR']),
    'Transacción':        t(r['TRANSACC']),
    'Documento':          cod(r['DOCUMENTO']),
    'Fecha':              normFecha(r['FECHA'], orden),
    'Entradas':           n(r['ENTRADAS']),
    'Salidas':            n(r['SALIDAS']),
    'Vr. Unitario ($)':   n(r['UNITARIO']),
    'Saldo':              n(r['SALDO']),
    'Vr. Existencia ($)': n(r['VREXISTE']),
  }))
  return aMatriz(HEADERS_KARDEX, filas)
}

/* ──────────────────────────── INVENTARIO ──────────────────────────── */

/**
 * El ERP nombra las bodegas por código físico. La correspondencia se verificó
 * cruzando los 5.070 productos del archivo contra la hoja anterior.
 * Las columnas Z4-Z9 están en cero hoy, pero se conservan por si se activan.
 */
const BODEGAS: [origen: string, destino: string][] = [
  ['FISICO15', 'Stock BODEGA CEDI'],
  ['FISICO19', 'Stock BODEGA PALMASECA'],
  ['FISICOB7', 'Stock ECOMERCE'],
  ['FISICOC2', 'Stock RESERVAS'],
  ['FISICOZ4', 'Stock FISICOZ4'],
  ['FISICOZ5', 'Stock FISICOZ5'],
  ['FISICOZ6', 'Stock FISICOZ6'],
  ['FISICOZ7', 'Stock FISICOZ7'],
  ['FISICOZ8', 'Stock FISICOZ8'],
  ['FISICOZ9', 'Stock FISICOZ9'],
]

const HEADERS_INVENTARIO = [
  'Código', 'Referencia', 'Grupo', 'Línea', 'Agrupación', 'Producto',
  'Costo Promedio ($)', 'Precio Venta ($)', 'Fecha Creación',
  'Stock Total', 'Valor a Costo ($)', 'Valor a Precio Venta ($)',
  ...BODEGAS.map(([, destino]) => destino),
]

export function adaptInventario(rows: string[][]): string[][] {
  const crudas = conDatos(aObjetos(rows), 'CODIGO')
  const orden = detectarOrdenFecha(crudas, ['FCREACION'])
  const filas = crudas.map((r): Fila => {
    // Stock Total y los dos valores son derivados: el archivo crudo solo trae
    // las existencias por bodega.
    const total = BODEGAS.reduce((acc, [origen]) => acc + num(r[origen]), 0)
    const costo = num(r['PROMEDIO'])
    const venta = num(r['VENTAA'])
    const fila: Fila = {
      'Código':               cod(r['CODIGO']),
      'Referencia':           t(r['REFERENCIA']),
      'Grupo':                cod(r['GRUPO']),
      'Línea':                cod(r['LINEA']),
      'Agrupación':           cod(r['AGRUPA']),
      'Producto':             t(r['PRODUCTO']),
      'Costo Promedio ($)':   n(r['PROMEDIO']),
      'Precio Venta ($)':     n(r['VENTAA']),
      'Fecha Creación':       normFecha(r['FCREACION'], orden),
      'Stock Total':              String(Number(total.toFixed(4))),
      'Valor a Costo ($)':        String(Number((total * costo).toFixed(2))),
      'Valor a Precio Venta ($)': String(Number((total * venta).toFixed(2))),
    }
    BODEGAS.forEach(([origen, destino]) => { fila[destino] = n(r[origen]) })
    return fila
  })
  return aMatriz(HEADERS_INVENTARIO, filas)
}

/**
 * RAW_Inventario_Stock era RAW_Inventario filtrada a los productos con
 * existencias. Verificado contra la hoja anterior: 667 de 5.070, coincidencia
 * exacta con `Stock Total > 0`.
 */
export function filtrarConStock(matriz: string[][]): string[][] {
  if (matriz.length < 2) return matriz
  const [headers, ...data] = matriz
  const i = headers.indexOf('Stock Total')
  return [headers, ...data.filter(r => num(r[i]) > 0)]
}
