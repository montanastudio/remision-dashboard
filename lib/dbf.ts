/**
 * Lector de archivos dBASE (.DBF), que es como el ERP exporta los datos crudos.
 *
 * Formato: cabecera de 32 bytes, un descriptor de 32 bytes por campo terminado
 * en 0x0D, y luego los registros de ancho fijo, cada uno precedido por un byte
 * que marca si está borrado.
 *
 * Se implementa a mano (son ~100 líneas) para no meter una dependencia más solo
 * por esto, y sobre todo para controlar la codificación, que en estos archivos
 * viene mezclada (ver ALTOS más abajo).
 */

/**
 * Tabla de decodificación de la mitad alta (0x80-0xFF).
 *
 * El byte 29 de la cabecera debería declarar el codepage, pero este ERP lo deja
 * en 0x00 — y de todos modos no serviría: los archivos traen las DOS
 * codificaciones MEZCLADAS dentro del mismo archivo, según en qué terminal se
 * haya digitado cada registro. En VTA0906 conviven "MARTINEZ MARIÑO" (0xD1,
 * Windows-1252) y "MORALES MUÑOZ" (0xA5, CP850 de DOS).
 *
 * Por eso no se elige una codificación: se usa una tabla híbrida. Base
 * Windows-1252, y encima las letras españolas de CP850 (0xA0-0xA5, 0x81, 0x82,
 * 0x8A, 0x90), cuyo significado en Windows-1252 (¡ ¢ £ ¤ ¥ y controles) no
 * aparece nunca en estos datos. Así ambas se leen bien sin tener que adivinar.
 *
 * Verificado sobre los 6 archivos: solo existen 11 bytes altos distintos, y los
 * dos que concentran el 97% son 0xD1 y 0xA5 — las dos formas de la Ñ.
 */
const ALTOS =
  '\u20ac' + 'üé' + '\u0192\u201e\u2026\u2020\u2021\u02c6\u2030' + 'è' +
  '\u2039\u0152' + 'ì\u017d' + 'ÅÉ' +
  '\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153' +
  'Ø\u017e\u0178' +
  'áíóúñÑ' +
  '¦§¨©ª«¬\u00ad®¯°±²³´µ¶·¸¹º»¼½¾¿' +
  'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß' +
  'àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ'

function decodificar(buf: Buffer, ini: number, fin: number): string {
  let out = ''
  for (let i = ini; i < fin; i++) {
    const b = buf[i]
    out += b < 0x80 ? String.fromCharCode(b) : ALTOS[b - 0x80]
  }
  return out
}

interface Campo { nombre: string, tipo: string, largo: number }

export class DbfError extends Error {}

/**
 * Devuelve el contenido del DBF en la misma forma que `spreadsheets.values.get`:
 * la primera fila son los nombres de campo y el resto los registros. Así los
 * adaptadores no notan la diferencia entre un DBF y una hoja de cálculo.
 */
export function parseDbf(buf: Buffer): string[][] {
  if (buf.length < 33) throw new DbfError('El archivo DBF está vacío o truncado.')

  const nRegistros = buf.readUInt32LE(4)
  const largoCabecera = buf.readUInt16LE(8)
  const largoRegistro = buf.readUInt16LE(10)
  if (largoCabecera < 33 || largoRegistro < 1 || largoCabecera > buf.length) {
    throw new DbfError('Cabecera DBF inválida — ¿el archivo se subió completo?')
  }

  // Descriptores de campo, hasta el terminador 0x0D.
  const campos: Campo[] = []
  for (let off = 32; off + 32 <= largoCabecera; off += 32) {
    if (buf[off] === 0x0d) break
    const nombre = buf.toString('latin1', off, off + 11).replace(/\0[\s\S]*$/, '').trim()
    if (!nombre) break
    campos.push({ nombre, tipo: String.fromCharCode(buf[off + 11]), largo: buf[off + 16] })
  }
  if (!campos.length) throw new DbfError('El DBF no declara ningún campo.')

  const filas: string[][] = [campos.map(c => c.nombre)]

  for (let i = 0; i < nRegistros; i++) {
    const base = largoCabecera + i * largoRegistro
    if (base + largoRegistro > buf.length) break   // archivo truncado: se corta aquí
    if (buf[base] === 0x2a) continue                // 0x2A = registro borrado

    const fila: string[] = []
    let off = base + 1
    for (const c of campos) {
      let v = decodificar(buf, off, off + c.largo).trim()
      // Lógicos: el ERP los escribe T/Y/1 o F/N/0.
      if (c.tipo === 'L') v = /^[TYty1]$/.test(v) ? 'SI' : v === '' ? '' : 'NO'
      // Fechas tipo D vienen como AAAAMMDD; se pasan a DD/MM/AAAA, que es lo
      // que esperan los adaptadores. (Hoy el ERP las exporta como texto, pero
      // si algún día cambia el tipo esto lo absorbe.)
      else if (c.tipo === 'D' && /^\d{8}$/.test(v)) v = `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)}`
      fila.push(v)
      off += c.largo
    }
    filas.push(fila)
  }

  return filas
}
