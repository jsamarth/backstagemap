import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson'
import NTA_GEO_RAW from './nta.geojson.json'
import JC_GEO_RAW from './jc.geojson.json'

const NTA_GEO = NTA_GEO_RAW as unknown as FeatureCollection<Polygon | MultiPolygon>
const JC_GEO = JC_GEO_RAW as unknown as FeatureCollection<Polygon | MultiPolygon>

// Hoboken bounding polygon (~1 sq mile city, no official open GeoJSON)
const HOBOKEN_FEATURE = {
  type: 'Feature' as const,
  properties: { name: 'hoboken' },
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[
      [-74.0379, 40.7353],
      [-74.0188, 40.7353],
      [-74.0188, 40.7627],
      [-74.0379, 40.7627],
      [-74.0379, 40.7353],
    ]],
  },
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[\s\-\/\.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function getNeighborhoodFromCoords(lat: number, lng: number): string | null {
  const pt = point([lng, lat]) // GeoJSON uses [lng, lat]

  if (booleanPointInPolygon(pt, HOBOKEN_FEATURE)) return 'hoboken'

  for (const feature of JC_GEO.features) {
    if (booleanPointInPolygon(pt, feature)) {
      const name: string = (feature.properties as Record<string, string>)?.neighborho ?? ''
      return name ? toSlug(name) : null
    }
  }

  for (const feature of NTA_GEO.features) {
    if (booleanPointInPolygon(pt, feature)) {
      const name: string = (feature.properties as Record<string, string>)?.ntaname ?? ''
      return name ? toSlug(name) : null
    }
  }

  return null
}
