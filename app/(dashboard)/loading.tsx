/**
 * UI de carga del dashboard. Next.js la muestra automáticamente mientras el
 * server component de cada página trae los datos (navegación entre secciones,
 * cambios de pestaña con ?tab=, refresco). Es un overlay con una rueda giratoria
 * para que quede claro que algo está cargando, en vez de que la vista se quede
 * quieta.
 */
import LoadingOverlay from '@/components/LoadingOverlay'

export default function Loading() {
  return <LoadingOverlay />
}
