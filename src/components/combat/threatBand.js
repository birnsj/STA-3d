// Presentation only: Threat has no book max, so the HUD shows pressure bands instead of a filled meter.
// Low 1–3, Rising 4–6 (enemies can buy meaningful spends; AI often holds ~4 for Avoid Injury), High 7+.
export function threatBand(threat) {
  if (threat <= 0) return { id: 'none', label: null }
  if (threat <= 3) return { id: 'low', label: 'Low' }
  if (threat <= 6) return { id: 'rising', label: 'Rising' }
  return { id: 'high', label: 'High' }
}
