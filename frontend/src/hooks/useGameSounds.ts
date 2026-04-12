'use client'

import { useCallback, useRef, useEffect } from 'react'

const SOUNDS = {
  ATTACK: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c976939958.mp3', // Laser pulse
  HEAL: 'https://cdn.pixabay.com/audio/2021/08/04/audio_0625c15139.mp3',   // Shine/Recovery
  DEFEND: 'https://cdn.pixabay.com/audio/2022/01/18/audio_2452077e68.mp3', // Shield/Metal
  JOIN: 'https://cdn.pixabay.com/audio/2022/03/10/audio_5179373998.mp3',   // Digital enter
  VICTORY: 'https://cdn.pixabay.com/audio/2021/08/04/audio_c394747ebc.mp3', // Victory chime
  DEATH: 'https://cdn.pixabay.com/audio/2022/10/18/audio_31c883907c.mp3',   // Alarm/Failure
  RESOLVE: 'https://cdn.pixabay.com/audio/2022/03/24/audio_362e54e4c2.mp3'  // Boom/Thud
}

export function useGameSounds() {
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})

  // Pre-load sounds on mount
  useEffect(() => {
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url)
      audio.load()
      audioRefs.current[key] = audio
    })

    // Browser audio unlock mechanism
    const unlock = () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.play().then(() => {
          audio.pause()
          audio.currentTime = 0
        }).catch(() => {})
      })
      window.removeEventListener('click', unlock)
    }
    window.addEventListener('click', unlock)
    return () => window.removeEventListener('click', unlock)
  }, [])

  const play = useCallback((key: keyof typeof SOUNDS) => {
    const audio = audioRefs.current[key]
    
    // Synthetic fallback (OSCILLATOR) if audio files are blocked or fail
    const playFallback = () => {
      if (typeof window === 'undefined') return
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      
      const frequencies: Record<string, number> = { ATTACK: 150, HEAL: 880, DEFEND: 440, RESOLVE: 80, JOIN: 600 }
      osc.frequency.setValueAtTime(frequencies[key] || 440, ctx.currentTime)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
    }

    if (!audio) {
      playFallback()
      return
    }

    try {
      const clone = audio.cloneNode() as HTMLAudioElement
      clone.volume = 0.5
      clone.play().catch(playFallback)
    } catch (e) {
      playFallback()
    }
  }, [])

  return { play }
}
