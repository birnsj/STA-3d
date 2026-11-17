// Sounds are a quiet no-op where Web Audio does not exist (Node). Animation clip sounds roll a random chance, so without
// this an unrelated animator test failed now and then with "AudioContext is not defined".
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { playClipSound } from '../src/audio/animationSounds.js'
import { playDeathSound, playSoundEvent, playWeaponSound } from '../src/audio/uiSounds.js'

describe('audio without Web Audio', () => {
  it('has no AudioContext in this environment', () => {
    assert.equal(typeof AudioContext, 'undefined')
  })

  it('plays nothing and throws nothing', () => {
    assert.doesNotThrow(() => {
      playSoundEvent('getHit')
      playDeathSound()
      playWeaponSound('phaser')
      for (let i = 0; i < 50; i += 1) playClipSound('melee', { force: true, minGapMs: 0 })
    })
  })
})
