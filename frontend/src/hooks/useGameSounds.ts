'use client'

import { useCallback, useRef } from 'react'

type AudioContextWithWebkit = Window & { webkitAudioContext?: typeof AudioContext }

export function useGameSounds() {
  const audioContextRef = useRef<AudioContext | null>(null)

  const playSynthetic = useCallback((type: string) => {
    if (typeof window === 'undefined') return

    if (!audioContextRef.current) {
      const Ctx = window.AudioContext ?? (window as AudioContextWithWebkit).webkitAudioContext
      if (!Ctx) return
      audioContextRef.current = new Ctx()
    }

    const ctx = audioContextRef.current
    if (ctx.state === 'suspended') ctx.resume()

    const now = ctx.currentTime

    // VICTORY uses multiple oscillators — handle separately before allocating the default osc
    if (type === 'VICTORY') {
      // Triumphant ascending triad: C4 → E4 → G4 staggered over 0.6s
      const freqs = [261.63, 329.63, 392]
      freqs.forEach((freq, i) => {
        const vo = ctx.createOscillator()
        const vg = ctx.createGain()
        vo.connect(vg)
        vg.connect(ctx.destination)
        vo.type = 'triangle'
        vo.frequency.setValueAtTime(freq, now + i * 0.15)
        vg.gain.setValueAtTime(0, now + i * 0.15)
        vg.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.05)
        vg.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.5)
        vo.start(now + i * 0.15)
        vo.stop(now + i * 0.15 + 0.55)
      })
      return
    }

    const osc = ctx.createOscillator()
    const gn = ctx.createGain()
    osc.connect(gn)
    gn.connect(ctx.destination)

    switch (type) {
      case 'ATTACK':
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(440, now)
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.1)
        gn.gain.setValueAtTime(0.1, now)
        gn.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
        osc.start(now)
        osc.stop(now + 0.1)
        break
      case 'HEAL':
        osc.type = 'sine'
        osc.frequency.setValueAtTime(523, now)
        osc.frequency.exponentialRampToValueAtTime(1046, now + 0.2)
        gn.gain.setValueAtTime(0.1, now)
        gn.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
        osc.start(now)
        osc.stop(now + 0.2)
        break
      case 'DEFEND':
        osc.type = 'square'
        osc.frequency.setValueAtTime(220, now)
        gn.gain.setValueAtTime(0.05, now)
        gn.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
        osc.start(now)
        osc.stop(now + 0.1)
        break
      case 'JOIN':
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(220, now)
        osc.frequency.linearRampToValueAtTime(440, now + 0.2)
        gn.gain.setValueAtTime(0.1, now)
        gn.gain.linearRampToValueAtTime(0, now + 0.3)
        osc.start(now)
        osc.stop(now + 0.3)
        break
      case 'RESOLVE':
        osc.type = 'sine'
        osc.frequency.setValueAtTime(150, now)
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.4)
        gn.gain.setValueAtTime(0.2, now)
        gn.gain.linearRampToValueAtTime(0, now + 0.4)
        osc.start(now)
        osc.stop(now + 0.4)
        break
      default:
        // Unknown type — disconnect to avoid AudioContext node leak
        osc.disconnect()
        return
    }
  }, [])

  return { play: playSynthetic }
}
