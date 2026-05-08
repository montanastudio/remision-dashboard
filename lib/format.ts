export function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO')
}

export function fmtN(n: number): string {
  return n.toLocaleString('es-CO')
}

export function pct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}
