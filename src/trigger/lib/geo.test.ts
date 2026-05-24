import { describe, it, expect } from 'vitest'
import { getNeighborhoodFromCoords } from './geo'

describe('getNeighborhoodFromCoords', () => {
  it('identifies Gowanus correctly', () => {
    expect(getNeighborhoodFromCoords(40.6742, -73.9995)).toBe('carroll_gardens_cobble_hill_gowanus_red_hook')
  })

  it('identifies Williamsburg correctly', () => {
    expect(getNeighborhoodFromCoords(40.7135, -73.9566)).toBe('williamsburg')
  })

  it('identifies Astoria correctly', () => {
    expect(getNeighborhoodFromCoords(40.7721, -73.9303)).toBe('old_astoria_hallets_point')
  })

  it('identifies East Village correctly', () => {
    expect(getNeighborhoodFromCoords(40.7265, -73.9815)).toBe('east_village')
  })

  it('identifies Jersey City correctly', () => {
    expect(getNeighborhoodFromCoords(40.7178, -74.0431)).toBe('van_vorst_park')
  })

  it('identifies Hoboken correctly', () => {
    expect(getNeighborhoodFromCoords(40.7440, -74.0324)).toBe('hoboken')
  })

  it('returns null for a point in the ocean', () => {
    expect(getNeighborhoodFromCoords(40.5, -74.5)).toBeNull()
  })
})
