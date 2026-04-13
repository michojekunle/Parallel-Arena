'use client'

import { useCallback, useRef } from 'react'

export function useGameSounds() {
  const audioContextRef = useRef<AudioContext | null>(null)

  const playSynthetic = useCallback((type: string) => {
    if (typeof window === 'undefined') return
    
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    
    const ctx = audioContextRef.current
    if (ctx.state === 'suspended') ctx.resume()

    const osc = ctx.createOscillator()
    const gn = ctx.createGain()
    osc.connect(gn)
    gn.connect(ctx.destination)

    const now = ctx.currentTime

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
    }
  }, [])

  return { play: playSynthetic }
}
