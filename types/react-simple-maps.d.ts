declare module 'react-simple-maps' {
  import { ComponentType, ReactNode, MouseEvent } from 'react'

  interface ProjectionConfig {
    center?: [number, number]
    scale?: number
    rotate?: [number, number, number]
    parallels?: [number, number]
  }

  interface ComposableMapProps {
    projection?: string
    projectionConfig?: ProjectionConfig
    width?: number
    height?: number
    style?: React.CSSProperties
    className?: string
    children?: ReactNode
  }

  interface GeographiesProps {
    geography: string | object
    children: (props: { geographies: Geography[] }) => ReactNode
  }

  interface Geography {
    rsmKey: string
    properties: Record<string, string | number>
    [key: string]: unknown
  }

  interface GeographyProps {
    geography: Geography
    fill?: string
    stroke?: string
    strokeWidth?: number
    style?: {
      default?: React.CSSProperties
      hover?: React.CSSProperties
      pressed?: React.CSSProperties
    }
    onClick?: (event: MouseEvent) => void
    onMouseEnter?: (event: MouseEvent) => void
    onMouseMove?: (event: MouseEvent) => void
    onMouseLeave?: (event: MouseEvent) => void
    className?: string
  }

  interface ZoomableGroupProps {
    center?: [number, number]
    zoom?: number
    minZoom?: number
    maxZoom?: number
    disablePanning?: boolean
    children?: ReactNode
    onMoveStart?: (pos: { coordinates: [number, number]; zoom: number }) => void
    onMove?: (pos: { coordinates: [number, number]; zoom: number }) => void
    onMoveEnd?: (pos: { coordinates: [number, number]; zoom: number }) => void
  }

  export const ComposableMap: ComponentType<ComposableMapProps>
  export const Geographies: ComponentType<GeographiesProps>
  export const Geography: ComponentType<GeographyProps>
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>
  export const Marker: ComponentType<Record<string, unknown>>
  export const Annotation: ComponentType<Record<string, unknown>>
  export const Sphere: ComponentType<Record<string, unknown>>
  export const Graticule: ComponentType<Record<string, unknown>>
  export const Line: ComponentType<Record<string, unknown>>
}
