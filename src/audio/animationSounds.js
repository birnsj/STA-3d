// Resolve animation clip / action names → sound events (animationSounds.json + Viewer overrides).
import { playSoundEvent } from './uiSounds.js'
import { soundChanceForClip, soundEventForClip } from '../spike3d/animationSoundSettings.js'

const lastPlayedAt = new Map()

/**
 * Play the sound bound to a clip/action name.
 * Rolls against the clip's random chance (0–100) unless force is set (Preview sound).
 * @param {string} clipName walk | peck | idleLookAround | …
 * @param {{ minGapMs?: number, settings?: Record<string, string>|null, chances?: Record<string, number>|null, force?: boolean }} [opts]
 */
export function playClipSound(clipName, { minGapMs = 120, settings = null, chances = null, force = false } = {}) {
  const eventId = soundEventForClip(clipName, settings)
  if (!eventId) return false
  if (!force) {
    const chance = soundChanceForClip(clipName, chances)
    if (chance <= 0) return false
    if (chance < 100 && Math.random() * 100 >= chance) return false
  }
  const now = performance.now()
  const key = `${clipName}:${eventId}`
  const last = lastPlayedAt.get(key) ?? 0
  if (now - last < minGapMs) return false
  lastPlayedAt.set(key, now)
  playSoundEvent(eventId)
  return true
}

export { playSoundEvent, soundEventForClip, soundChanceForClip }
