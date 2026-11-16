import { clipSeconds } from './clips.js'
import { playClipSound } from '../audio/animationSounds.js'
import { ChickenModel, CHICKEN_HEIGHT } from './ChickenModel.js'

function gaitForClip(name) {
  if (name === 'chickenWalk') return 'walk'
  if (name === 'chickenRun' || name === 'scatter') return 'run'
  return 'idle'
}

function idlePoseForClip(name) {
  if (name === 'peck' || name === 'scratch') return name
  return null
}

/**
 * Minimal HorseBody/ProceduralBody-shaped wrapper for the Animation Viewer chicken set.
 */
export class ChickenPreviewBody {
  constructor({ height = CHICKEN_HEIGHT } = {}) {
    this.model = new ChickenModel({ height })
    this.root = this.model.root
    this.current = 'chickenIdle'
    this._paused = false
    this._t = 0
    this._seconds = clipSeconds('chickenIdle', 'chicken')
    this.model.setGait('idle', null)
  }

  play(name, { force = false } = {}) {
    const clip = name || 'chickenIdle'
    if (!force && clip === this.current) return true
    this.current = clip
    this._t = 0
    this._seconds = clipSeconds(clip, 'chicken') || 1
    this.model.setGait(gaitForClip(clip), idlePoseForClip(clip))
    playClipSound(clip, { minGapMs: 40 })
    return true
  }

  setPaused(paused) {
    this._paused = Boolean(paused)
  }

  setViewerHoldOnce() {}
  setViewerLoopOnce() {}

  seek(u) {
    const t = Math.min(1, Math.max(0, Number(u) || 0))
    this._t = t * this._seconds
  }

  get progress() {
    if (!(this._seconds > 0)) return 0
    return Math.min(1, this._t / this._seconds)
  }

  update(dt) {
    if (!this._paused) {
      this._t += dt
      if (this._t > this._seconds) {
        const play = this.current
        // Loop loop-clips; hold once-clips at end.
        if (play === 'peck' || play === 'scratch' || play === 'scatter') {
          this._t = this._seconds
        } else {
          this._t %= this._seconds
          if (play === 'chickenWalk' || play === 'chickenRun') {
            playClipSound(play, { minGapMs: 280 })
          }
        }
      }
    }
    const speed = gaitForClip(this.current) === 'run' ? 4 : gaitForClip(this.current) === 'walk' ? 2 : 0
    this.model.update(dt, speed)
  }

  dispose() {
    this.model.dispose()
  }
}
