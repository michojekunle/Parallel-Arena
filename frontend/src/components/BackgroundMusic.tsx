'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'

export function BackgroundMusic() {
  const [isMuted, setIsMuted] = useState(true)
  const [hasInteracted, setHasInteracted] = useState(false)
  
  // Synthetic loop state
  const audioContextRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)

  const stopSynthetic = () => {
    oscillatorRef.current?.stop()
    oscillatorRef.current?.disconnect()
    oscillatorRef.current = null
  }

  const startSynthetic = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }

    if (oscillatorRef.current) return

    const ctx = audioContextRef.current
    const gn = ctx.createGain()
    gainNodeRef.current = gn
    gn.connect(ctx.destination)
    gn.gain.setValueAtTime(0, ctx.currentTime)
    gn.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 2) // Fade in

    // Low-frequency drone (Cyberpunk atmosphere)
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(55, ctx.currentTime) // Low A
    
    // Add filtering for "Gritty" feel
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(400, ctx.currentTime)
    
    osc.connect(filter)
    filter.connect(gn)
    
    osc.start()
    oscillatorRef.current = osc
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('parallel_arena_mute')
    setIsMuted(stored === 'true' || stored === null) // Default to muted on fresh start

    const unlock = () => {
      setHasInteracted(true)
      window.removeEventListener('click', unlock)
    }
    window.addEventListener('click', unlock)
    return () => {
      stopSynthetic()
      window.removeEventListener('click', unlock)
    }
  }, [])

  useEffect(() => {
    if (hasInteracted && !isMuted) {
      startSynthetic()
    } else {
      // Fade out and stop
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.exponentialRampToValueAtTime(0.0001, audioContextRef.current!.currentTime + 0.5)
        setTimeout(stopSynthetic, 500)
      }
    }
    localStorage.setItem('parallel_arena_mute', String(isMuted))
  }, [isMuted, hasInteracted, startSynthetic])

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-black/40 border border-[#1a1a1a] rounded-full">
      <div className="flex gap-0.5 h-3 items-end">
        {[1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            animate={!isMuted && hasInteracted ? { 
              height: [4, 12, 6, 12, 4],
              opacity: [0.3, 1, 0.3] 
            } : { 
              height: 4,
              opacity: 0.2
            }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
            className="w-0.5 bg-[#26D962]"
          />
        ))}
      </div>
      <button
        onClick={() => setIsMuted(!isMuted)}
        className="text-[10px] font-bold text-white uppercase tracking-tighter hover:text-[#26D962] transition-colors"
      >
        {isMuted ? 'UNMUTE PROTOCOL' : 'MUTE AUDIO'}
      </button>
    </div>
  )
}
