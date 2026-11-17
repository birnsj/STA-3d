import { clipSeconds } from './clips.js'
import { playClipSound } from '../audio/animationSounds.js'
import { CatModel, CAT_HEIGHT } from './CatModel.js'

function gaitForClip(name) {
  if (name === 'catWalk') return 'walk'
  if (name === 'catRun') return 'run'
  return 'idle'
}

function idlePoseForClip(name) {
  if (name === 'sit' || name === 'lick' || name === 'stretch') return name
  return null
}

/**
 * Minimal preview wrapper for the Animation Viewer cat set (same shape as ChickenPreviewBody).
 */
export class CatPreviewBody {
  constructor({ height = CAT_HEIGHT } = {}) {
    this.model = new CatModel({ height })
    this.root = this.model.root
    this.current = 'catIdle'
    this._paused = false
    this._t = 0
    this._seconds = clipSeconds('catIdle', 'cat')
    this.model.setGait('idle', null)
  }

  play(name, { force = false } = {}) {
    const clip = name || 'catIdle'
    if (!force && clip === this.current) return true
    this.current = clip
    this._t = 0
    this._seconds = clipSeconds(clip, 'cat') || 1
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
        if (play === 'sit' || play === 'lick' || play === 'stretch') {
          this._t = this._seconds
        } else {
          this._t %= this._seconds
          // Looping clips re-roll Random % each cycle (catIdle → meow).
          if (play === 'catWalk' || play === 'catRun') {
            playClipSound(play, { minGapMs: 260 })
          } else if (play === 'catIdle') {
            playClipSound(play, { minGapMs: 1600 })
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
