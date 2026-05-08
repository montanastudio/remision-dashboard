import { redirect } from 'next/navigation'

// This file exists only to avoid a Next.js route conflict.
// The actual resumen content lives at /resumen.
export default function DashboardRoot() {
  redirect('/resumen')
}
