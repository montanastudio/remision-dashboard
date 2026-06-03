# Frontend Handoff — Montana Gerencia Dashboard

> Dashboard gerencial de REMISION GROUP. Next.js 14 App Router, TypeScript, Tailwind CSS, Google Sheets como base de datos.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS + CSS Variables (theming) |
| Autenticación | NextAuth.js (credenciales) |
| Datos | Google Sheets API v4 (lectura y escritura) |
| Gráficas | Recharts |
| Exportar | xlsx (SheetJS) vía `lib/exportExcel.ts` |
| Mapa | Leaflet (solo en `/zona`) |

---

## Estructura de carpetas

```
app/
  (dashboard)/          ← Grupo de rutas protegidas (layout con sidebar + topbar)
    layout.tsx          ← Guard de sesión; calcula allowedSections y renderiza LayoutShell
    resumen/            ← Resumen ejecutivo
    ventas/             ← Análisis de ventas
    vendedores/         ← Metas y rendimiento
    clientes/           ← Top clientes
    cartera/            ← Análisis de cartera y antigüedad
    gestion-cartera/    ← Kanban de cobranza
    inventario/         ← Stock y rotación
    zona/               ← Mapa geográfico de ventas
    calculadora-precios/← Simulador de márgenes (solo Gerencia/Admin)
    configuracion/
      usuarios/         ← CRUD de usuarios
      permisos/         ← Matriz de permisos por rol
  api/                  ← API routes (Next.js route handlers)
components/             ← Componentes globales reutilizables
lib/                    ← Helpers: sheets, permisos, formato, fechas
public/                 ← Assets estáticos (logo-blanco.png)
```

---

## Layout principal

### Flujo de renderizado

```
DashboardLayout (server)
  └─ getServerSession → redirige a /login si no hay sesión
  └─ getAllowedSections(role, perms) → lista de secciones permitidas
  └─ <LayoutShell allowedSections={...}> (client)
       ├─ <SidebarNav />     ← 220px, fijo, overflow-y-auto solo en <nav>
       └─ <div overflow-y-auto>
            ├─ <TopBar />    ← sticky top-0, título + PeriodoPicker + DarkMode + Avatar
            ├─ <main>        ← children (cada página)
            └─ <footer>
```

### LayoutShell (`components/LayoutShell.tsx`)
- `h-screen overflow-hidden` en el wrapper externo → sidebar fijo
- `overflow-y-auto` en la columna de contenido → solo el contenido hace scroll
- Maneja el estado `sidebarOpen` (móvil) y el backdrop oscuro

### SidebarNav (`components/SidebarNav.tsx`)
- **Logo fijo** (top) + **Footer con usuario/Salir** (bottom)
- **`<nav>` con `overflow-y-auto`** → solo los ítems del menú scrollean
- Envuelve `<NavLinks>` en `<Suspense>` porque usa `useSearchParams`
- `NavLinks` preserva el query string del filtro de período al navegar entre páginas que lo soportan (`FILTRO_PAGES`)
- Ítem activo: `bg-[var(--brand-blue)] text-white`

### TopBar (`components/TopBar.tsx`)
- Título y subtítulo según `pathname` (mapas `PAGE_TITLES` / `PAGE_SUBS`)
- **PeriodoPicker**: solo visible en páginas con datos de ventas (`/resumen`, `/ventas`, `/vendedores`, `/clientes`, `/zona`)
- **DarkModeToggle**: botón cuadrado redondeado `w-9 h-9 rounded-[8px]`
- **Avatar**: botón circular con degradado rojo→azul + aro verde (`box-shadow`). Al hacer click abre popup con fecha del último registro en Sheets

---

## Theming y CSS

### Variables CSS (definidas en `globals.css`)

```css
/* Modo claro */
--bg:          #f5f7fa     /* Fondo general */
--card:        #ffffff     /* Cards */
--sidebar:     #ffffff     /* Sidebar y TopBar */
--border:      #e5e8ed     /* Bordes */
--text:        #0f172a     /* Texto principal */
--text-sub:    #475569     /* Texto secundario */
--text-muted:  #94a3b8     /* Texto apagado */
--brand-blue:  #2563eb     /* Azul primario */
--bar-bg:      #f1f5f9     /* Fondo barras/inputs */
--nav-hover:   #f1f5f9     /* Hover en nav items */

/* Modo oscuro: class="dark" en <html> */
--bg:          #0d1b2a
--card:        #112035
--sidebar:     #0a1628
--border:      #1e3050
--text:        #e2eaf4
...
```

Dark mode activado por `document.documentElement.classList.toggle('dark')` en `DarkModeToggle`.

### Clases utilitarias personalizadas (Tailwind)

```
rounded-card   → border-radius del card estándar (10px aprox)
rounded-nav    → border-radius ítems nav
rounded-pill   → cápsula/badge
shadow-card    → sombra estándar de card
shadow-card-hover → sombra al hover
fade-in-up     → animación de entrada (translate + opacity)
num            → fuente monoespaciada para cifras
table-scroll   → contenedor de tabla con scroll interno
```

---

## Patrón Server Component + Client Component

Todas las páginas siguen el mismo patrón:

```
page.tsx (Server Component)
  ├─ Verifica sesión y permisos → redirect si no tiene acceso
  ├─ Lee Google Sheets (RAW_ / RES_ / LS_)
  ├─ Normaliza y agrega datos
  └─ Renderiza <XxxClient> o <XxxInteractivo> con props pre-computadas

XxxClient.tsx / XxxInteractivo.tsx (Client Component — 'use client')
  ├─ Recibe datos como props iniciales
  ├─ Estado local para filtros, selecciones, drill-downs
  ├─ useMemo para derivar datos sin ir al servidor
  └─ Fetch a /api/* para mutaciones (PATCH/POST)
```

---

## Secciones / Páginas

### 1. Resumen Ejecutivo (`/resumen`)

**Rol mínimo:** cualquier rol con `resumen: true`

**Datos:**
- `RAW_Ventas_Excel` → ventas del período seleccionado
- `RAW_Cartera` → composición de cartera (buckets normalizados)
- `LS METAS Y PROYECCION` → % crecimiento para proyección

**Qué muestra:**
- KPIs: Total Ventas, Clientes activos, Ticket promedio, Margen bruto
- Gráfica de tendencia: ventas reales vs. proyección
- Donut de composición de cartera (7 buckets canónicos con colores)
- Alertas: cartera en jurídico, facturas vencidas

**Filtro de período:** sí (PeriodoPicker en TopBar)

---

### 2. Ventas (`/ventas`)

**Datos:** `RAW_Ventas_Excel`

**Qué muestra:**
- KPIs del período
- Gráfica de barras mensuales
- Tabla de ventas por línea de producto
- Distribución por forma de pago

**Filtro de período:** sí

---

### 3. Vendedores (`/vendedores`)

**Datos:** `RAW_Ventas_Excel` + `LS_METAS_VENDEDOR`

**Qué muestra:**
- Gauges semicirculares de % cumplimiento por vendedor
- Selector YTD vs. mes específico (`MetasGauges.tsx`)
- Tabla de ranking

**Cálculo de meta:**
```
% Cumplimiento = (Ventas reales / Meta del período) × 100
Colores: verde ≥100%, azul 70-99%, naranja 40-69%, rojo <40%
```

**Filtro de período:** sí

**Componentes internos:**
- `MetasGauges.tsx` — selector mes/YTD
- `VendedorMetaCard.tsx` — gauge individual con arco SVG
- `VendedoresCharts.tsx` — gráficas comparativas
- `VendedoresInteractivo.tsx` — tabla interactiva

---

### 4. Clientes (`/clientes`)

**Datos:** `RAW_Ventas_Excel`

**Qué muestra:**
- Top clientes por facturación
- Historial de compras del cliente seleccionado
- Donut de distribución

**Filtro de período:** sí

---

### 5. Cartera (`/cartera`)

**Datos:** `RAW_Cartera` (normalización de buckets en `page.tsx`)

**Arquitectura especial:** toda la computación de métricas ocurre en el cliente (`CarteraInteractivo`) para que el filtro de vendedor sea reactivo sin SSR.

**Qué muestra:**
- Filtro de vendedor (barra superior)
- Header card: Total Cartera + mini donut + clientes/facturas en mora
- Donut de distribución por bucket + barras de antigüedad
- Tabla de clientes con drill-down
- Detalle agrupado por NIT
- Tabla de facturas vencidas (exportable a Excel)

**Buckets canónicos (en orden de gravedad):**

| Nombre | Label | Color |
|---|---|---|
| No vencida | No vencida | #22c55e |
| 1-30 días | 1-30d | #86efac |
| Próximo a vencer | 31-45d | #f59e0b |
| Vencida | 46-60d | #f97316 |
| Mora | 61-75d | #ea580c |
| Prejurídico | 76-90d | #ef4444 |
| Jurídico | 91+d | #b91c1c |

**Normalización de nombres legacy:** `LEGACY_TO_NAME` en `page.tsx` y `CarteraInteractivo.tsx` mapea variantes del sheet al nombre canónico.

---

### 6. Gestión Cartera (`/gestion-cartera`)

**Rol mínimo:** `gestion_cartera: true`

**Arquitectura:** datos cargados SSR + fetch al montar para listas actualizadas. Mutaciones vía API PATCH.

**Qué muestra:**
- Barra de filtros: búsqueda por nombre/NIT, bucket, monto min/max, vendedor
- Tablero Kanban de columnas personalizables (listas)
- Vista de supervisión (solo Administrador/Gerencia)

**Componentes internos:**

| Archivo | Responsabilidad |
|---|---|
| `GestionCarteraClient.tsx` | Shell: estado global, filtros, apertura de panels |
| `KanbanBoard.tsx` | Columnas + tarjetas; gestión de listas |
| `KanbanFilters.tsx` | Barra de filtros con `applyFilters()` (cliente, sin API) |
| `NotasPanel.tsx` | Drawer lateral (portal a `document.body`) para notas/recordatorios |
| `InfoClientePanel.tsx` | Panel de info de contacto del cliente |
| `SupervisionView.tsx` | Vista agregada para supervisión (tabla por vendedor) |

**Interacción de cards:**
- Click en la card → abre `InfoClientePanel`
- Botón "Notas" en la card → abre `NotasPanel` (drawer)

**Listas (columnas Kanban):**
- CRUD completo vía `/api/gestion-cartera/listas`
- Almacenadas en hoja `GC_Listas` del segundo Google Sheet

**Segundo Google Sheet (Gestión Cartera):**
Configurado en `GOOGLE_SHEETS_ID_CARTERA`. Hojas:
- `GC_ClienteMeta` — listaId + fecha de contacto por NIT
- `GC_Listas` — definición de columnas Kanban
- `GC_Notas` — notas de gestión por NIT
- `GC_Recordatorios` — recordatorios con fecha y estado

---

### 7. Inventario (`/inventario`)

**Datos:** `RAW_Inventario`, `RAW_Sin_Rotar`, `RAW_Saldos_Fisicos`

**Qué muestra (tabs):**
- **Saldos**: stock actual con chips de color por nivel (verde/amarillo/rojo inverso)
- **Sin rotar**: productos sin movimiento
- **Gráficas**: distribución por línea

**Componentes:**
- `TabsInventario.tsx` — navegación por tabs
- `InventarioSaldos.tsx` — tabla con chips de inventario
- `InventarioSinRotar.tsx` — lista de sin rotación
- `InventarioCharts.tsx` — Recharts

---

### 8. Zonas (`/zona`)

**Datos:** `RAW_Ventas_Excel` + `LS_ZONAS`

**Qué muestra:**
- Mapa de Colombia (Leaflet) con municipios coloreados según ventas
- Modal de detalle por ciudad

**Filtro de período:** sí

---

### 9. Calculadora de Precios (`/calculadora-precios`)

**Rol mínimo:** `calculadora_precios: true` (Administrador y Gerencia por defecto)

**Puramente client-side**, sin conexión a Sheets.

**Inputs:** Costo, Precio de lista, Descuento %

**Cálculos (useMemo):**
```
precioConDesc = precio × (1 - desc/100)
ivaValor      = precioConDesc × 0.19
precioFinal   = precioConDesc × 1.19
utilidad      = precioConDesc - costo
margen%       = (utilidad / precioConDesc) × 100
markup%       = (utilidad / costo) × 100
```

**Indicadores de margen:** verde ≥30%, ámbar ≥15%, naranja ≥0%, rojo <0%

---

### 10. Configuración — Usuarios (`/configuracion/usuarios`)

**Rol:** solo `configuracion: true` (Administrador)

**Qué hace:**
- Lista todos los usuarios (de `LS_Usuarios` en Sheets)
- Crear usuario nuevo (`NuevoUsuarioForm`)
- Cambiar contraseña (`CambiarPasswordForm`)
- Botón "Generar metas en Sheets" (`SeedMetasButton`) → POST `/api/seed-metas-vendedor`

---

### 11. Configuración — Permisos (`/configuracion/permisos`)

**Rol:** solo `configuracion: true`

**Qué hace:**
- Muestra una tabla rol × sección con checkboxes
- Guarda en `LS_Permisos` vía POST `/api/permisos`
- Los cambios se reflejan inmediatamente (sin reiniciar)

---

## Sistema de permisos

### Roles disponibles

| Rol | Acceso por defecto |
|---|---|
| `Administrador` | Todo (incluye configuración) |
| `Gerencia` | Todo excepto configuración |
| `Ventas` | Resumen, Ventas, Vendedores, Clientes |
| `Cartera` | Cartera, Gestión Cartera |
| Roles custom | Configurable desde Permisos |

### Flujo

```
LS_Permisos (Google Sheet)
  ↓ getPermissions() — lib/permissions.ts — cached 60s
  ↓ canAccess(role, section, perms) — true/false
  ↓ getAllowedSections(role, perms) — string[] para SidebarNav
```

`LOCKED_ROLES = ['Administrador']` — su configuración no se puede modificar desde UI.

### Archivos clave

- `lib/permissions-config.ts` — definición de secciones, labels, permisos por defecto
- `lib/permissions.ts` — `getPermissions()`, `canAccess()`, `getAllowedSections()`
- Cada `page.tsx` llama `canAccess()` en el servidor y hace `redirect('/resumen')` si no tiene acceso

---

## Componentes globales reutilizables

### `Card` (`components/Card.tsx`)
```tsx
<Card title="..." subtitle="..." action={<button>...</button>}>
  {children}
</Card>
```
Props: `title`, `subtitle?`, `action?` (slot top-right), `className?`

### `MetricCard` (`components/MetricCard.tsx`)
```tsx
<MetricCard
  label="Total Ventas"
  value="$1.234.567"
  sub="vs. período anterior"
  variant="good"           // default | good | warn | alert
  delta={{ value: '+12%', positive: true }}
/>
```
Variants añaden borde izquierdo de color: verde/ámbar/rojo.

### `DonutChart` (`components/DonutChart.tsx`)
```tsx
<DonutChart
  data={[{ name: 'bucket', label: '91+d', value: 123456, color: '#b91c1c' }]}
  size={160}
/>
```
Incluye tooltip y leyenda. Acepta `label` opcional para mostrar en leyenda en vez del `name`.

### `TrendChart` (`components/TrendChart.tsx`)
Gráfica de línea/área Recharts con formato colombiano en ejes.

### `BarRows` (`components/BarRows.tsx`)
Barras horizontales de porcentaje, usadas en resumen y cartera.

### `DataTable` (`components/DataTable.tsx`)
Tabla genérica con soporte de ordenamiento.

### `AlertItem` (`components/AlertItem.tsx`)
Chip de alerta con icono, color y texto.

### `Badge` (`components/Badge.tsx`)
Etiqueta de estado con color de fondo configurable.

### `PeriodoPicker` (`components/PeriodoPicker.tsx`)
- Botón cuadrado `w-9 h-9 rounded-[8px]` con ícono de calendario
- Punto azul cuando hay filtro activo
- Panel dropdown con 5 modos: período actual / mes / año / rango / todo
- Persiste el filtro en URL query string (`?filtro=mes&m=3&y=2025`)
- Solo visible en páginas con datos de ventas

### `DarkModeToggle` (`components/DarkModeToggle.tsx`)
- Botón `w-9 h-9 rounded-[8px]`
- Persiste preferencia en `localStorage`
- Aplica/quita clase `dark` en `<html>`

---

## Lib helpers

### `lib/sheets.ts`
- `getSheetData(sheetName)` — lee una hoja con cache en memoria de 60s
- `writeSheetData(sheetName, rows)` — escribe filas
- `rowsToObjects(rows)` — convierte `string[][]` a `Record<string, string>[]` usando primera fila como header
- `parseNum(str)` — maneja formato colombiano (`1.234.567` → `1234567`)
- `normalizeVentasColumns(row)` — mapea nombres de columnas variables del sheet a nombres internos fijos

### `lib/sheets-cartera.ts`
- `getCarteraSheet(sheetName)` — igual que `getSheetData` pero para el segundo spreadsheet (`GOOGLE_SHEETS_ID_CARTERA`)
- `upsertCarteraRow(sheet, keyCol, keyVal, values)` — busca fila por clave y actualiza, o añade nueva
- `rowsToObjects(rows)` — misma función pero en este módulo
- `todayISO()` — devuelve fecha actual en formato `YYYY-MM-DD`

### `lib/permissions.ts`
- `getPermissions()` — lee `LS_Permisos` (cached), merge con defaults
- `canAccess(role, section, perms)` — boolean
- `getAllowedSections(role, perms)` — string[]

### `lib/filtro-ventas.ts`
- `filtroLabel(params)` — texto legible del filtro activo (ej. "Marzo 2025")
- `applyFiltroVentas(rows, params)` — filtra filas de ventas según los query params de la URL
- Tipos: `FiltroTipo = 'actual' | 'mes' | 'año' | 'rango' | 'todo'`

### `lib/format.ts`
- `fmt(n)` → `$1.234.567`
- `fmtN(n)` → `1.234.567` (sin $)
- `pct(n)` → `12.3%`

### `lib/fecha.ts`
- `parseFecha(str)` — parsea `DD/MM/YYYY` a `{ mes: 0-11, year: YYYY }`

### `lib/exportExcel.ts`
- `exportToExcel(rows, filename, sheetName)` — descarga un `.xlsx` en el browser usando SheetJS

### `lib/zonas-config.ts`
- Mapeo de municipios a zonas comerciales

---

## API Routes (resumen)

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/gestion-cartera/clientes` | GET | Lista clientes con meta, recordatorios y listas |
| `/api/gestion-cartera/clientes` | PATCH | Actualiza listaId o fecha de contacto |
| `/api/gestion-cartera/clientes/detalle` | GET | Facturas de un NIT específico |
| `/api/gestion-cartera/listas` | GET/POST/DELETE | CRUD de columnas Kanban |
| `/api/gestion-cartera/notas` | GET/POST | Notas de gestión por NIT |
| `/api/gestion-cartera/recordatorios` | GET/POST/PATCH | Recordatorios por NIT |
| `/api/gestion-cartera/contacto` | POST | Marca cliente como contactado hoy |
| `/api/gestion-cartera/setup` | POST | Crea hojas del segundo Sheet (solo Admin) |
| `/api/usuarios` | GET/POST/PATCH/DELETE | CRUD de usuarios en `LS_Usuarios` |
| `/api/permisos` | GET/POST | Lee/guarda `LS_Permisos` |
| `/api/seed-metas-vendedor` | POST | Genera `LS_METAS_VENDEDOR` desde histórico |
| `/api/ultima-fecha` | GET | Fecha del último registro en `RAW_Ventas_Excel` |
| `/api/sheets/[sheet]` | GET | Proxy genérico para leer cualquier hoja (debug) |

Todas las rutas verifican sesión con `getServerSession(authOptions)` y permisos antes de proceder.

---

## Variables de entorno necesarias

```bash
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# Google Sheets principal (ventas, cartera, inventario, usuarios, metas)
GOOGLE_SHEETS_ID=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...

# Segundo Google Sheet (gestión de cartera: notas, recordatorios, listas)
GOOGLE_SHEETS_ID_CARTERA=...
```

---

## Patrones frecuentes al agregar una sección nueva

### 1. Registrar la sección

En `lib/permissions-config.ts`:
```typescript
export const SECTIONS = [..., 'nueva_seccion'] as const
export const SECTION_LABELS = { ..., nueva_seccion: 'Nueva Sección' }
export const DEFAULT_PERMISSIONS = {
  Administrador: { ..., nueva_seccion: true },
  Gerencia:      { ..., nueva_seccion: true },
  Ventas:        { ..., nueva_seccion: false },
  Cartera:       { ..., nueva_seccion: false },
}
export const SECTION_ROUTES = { ..., nueva_seccion: '/nueva-seccion' }
```

### 2. Agregar ítem al sidebar

En `components/SidebarNav.tsx`, dentro del array `sections`:
```typescript
{ href: '/nueva-seccion', section: 'nueva_seccion', label: 'Nueva Sección', icon: <svg>...</svg> }
```

### 3. Registrar título en TopBar

En `components/TopBar.tsx`:
```typescript
PAGE_TITLES['/nueva-seccion'] = 'Nueva Sección'
PAGE_SUBS['/nueva-seccion']   = 'Descripción corta'
```

### 4. Crear la página

```typescript
// app/(dashboard)/nueva-seccion/page.tsx
export default async function NuevaSeccionPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'nueva_seccion', perms)) redirect('/resumen')

  // Leer y preparar datos...
  return <div className="fade-in-up"><NuevaSeccionClient datos={datos} /></div>
}
```

---

## Convenciones de estilo

- **Tamaños de texto:** `text-[11px]` (muted/labels) → `text-[12px]` (body) → `text-[13px]` (subtítulos) → `text-[18px]` (títulos de página)
- **Cards:** siempre `rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card`
- **Inputs y selects:** `text-[12px] px-2.5 py-[7px] rounded-[7px] border bg-[var(--card)]` con `focus:ring-1`
- **Botones de acción secundaria:** `px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--bar-bg)]`
- **Botón primario:** `bg-[var(--brand-blue)] text-white`
- **Animación de entrada:** clase `fade-in-up` en el wrapper de cada página
- **Monoespaciado para cifras:** clase `num` (fuente tabular)
- **Colores semánticos hardcoded:** verde `#22c55e`, rojo `#ef4444`, ámbar `#f59e0b`, azul `#2563eb`
- **Nunca usar clases de color directo de Tailwind** (ej. `bg-white`) — siempre usar `var(--card)` para dark mode
