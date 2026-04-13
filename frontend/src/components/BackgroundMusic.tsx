'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'

type MusicMode = 'cyberpunk' | 'orchestral' | 'industrial'

interface AudioNodes {
  ctx: AudioContext
  masterGain: GainNode
  musicGain: GainNode
  sfxGain: GainNode
  oscillators: OscillatorNode[]
  filters: BiquadFilterNode[]
}

export function BackgroundMusic() {
  const [isMuted, setIsMuted] = useState(true)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [musicMode, setMusicMode] = useState<MusicMode>('cyberpunk')
  const [musicVolume, setMusicVolume] = useState(0.3)
  const [sfxVolume, setSfxVolume] = useState(0.5)
  const [intensity, setIntensity] = useState(0) // 0-1, increased on attacks

  const audioNodesRef = useRef<AudioNodes | null>(null)
  const modeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intensityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize Audio Context
  const initAudioContext = useCallback(() => {
    if (audioNodesRef.current) return audioNodesRef.current

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()

    const masterGain = ctx.createGain()
    const musicGain = ctx.createGain()
    const sfxGain = ctx.createGain()

    masterGain.connect(ctx.destination)
    musicGain.connect(masterGain)
    sfxGain.connect(masterGain)

    masterGain.gain.setValueAtTime(isMuted ? 0 : 1, ctx.currentTime)

    audioNodesRef.current = {
      ctx,
      masterGain,
      musicGain,
      sfxGain,
      oscillators: [],
      filters: [],
    }

    return audioNodesRef.current
  }, [isMuted])

  // Stop all oscillators
  const stopAllOscillators = useCallback(() => {
    if (!audioNodesRef.current) return
    audioNodesRef.current.oscillators.forEach(osc => {
      try {
        osc.stop()
        osc.disconnect()
      } catch {}
    })
    audioNodesRef.current.filters.forEach(f => f.disconnect())
    audioNodesRef.current.oscillators = []
    audioNodesRef.current.filters = []
  }, [])

  // Cyberpunk Synth: Pulsing neon synth with beat
  const playCyberpunk = useCallback(() => {
    const nodes = initAudioContext()
    stopAllOscillators()

    const { ctx, musicGain } = nodes
    const now = ctx.currentTime

    // Fade in
    musicGain.gain.setValueAtTime(0, now)
    musicGain.gain.linearRampToValueAtTime(musicVolume * 0.8, now + 1)

    // Bass synth (wobbling)
    const bassOsc = ctx.createOscillator()
    bassOsc.type = 'square'
    bassOsc.frequency.setValueAtTime(55, now)
    bassOsc.frequency.setTargetAtTime(60, now, 0.05) // Wobble effect

    const bassFilter = ctx.createBiquadFilter()
    bassFilter.type = 'lowpass'
    bassFilter.frequency.setValueAtTime(300, now)
    bassFilter.frequency.setTargetAtTime(250 + intensity * 100, now, 0.1)

    const bassGain = ctx.createGain()
    bassGain.gain.setValueAtTime(0.3, now)

    bassOsc.connect(bassFilter)
    bassFilter.connect(bassGain)
    bassGain.connect(musicGain)

    // High synth (melody)
    const melodyOsc = ctx.createOscillator()
    melodyOsc.type = 'triangle'
    const melodyFreq = 220 + intensity * 200 // Rises with intensity
    melodyOsc.frequency.setValueAtTime(melodyFreq, now)

    // Modulate melody frequency for movement
    const lfo = ctx.createOscillator()
    lfo.frequency.setValueAtTime(0.5, now) // 0.5 Hz modulation
    const lfoGain = ctx.createGain()
    lfoGain.gain.setValueAtTime(50, now)
    lfo.connect(lfoGain)
    lfoGain.connect(melodyOsc.frequency)

    const melodyGain = ctx.createGain()
    melodyGain.gain.setValueAtTime(0.15, now)

    melodyOsc.connect(melodyGain)
    melodyGain.connect(musicGain)

    bassOsc.start()
    melodyOsc.start()
    lfo.start()

    nodes.oscillators.push(bassOsc, melodyOsc, lfo)
    nodes.filters.push(bassFilter)
  }, [initAudioContext, stopAllOscillators, musicVolume, intensity])

  // Orchestral: Grand battle theme with strings
  const playOrchestral = useCallback(() => {
    const nodes = initAudioContext()
    stopAllOscillators()

    const { ctx, musicGain } = nodes
    const now = ctx.currentTime

    musicGain.gain.setValueAtTime(0, now)
    musicGain.gain.linearRampToValueAtTime(musicVolume * 0.6, now + 2)

    // String pad (sawtooth with filter)
    const stringOsc = ctx.createOscillator()
    stringOsc.type = 'sawtooth'
    stringOsc.frequency.setValueAtTime(110, now) // Low A

    const stringFilter = ctx.createBiquadFilter()
    stringFilter.type = 'lowpass'
    stringFilter.frequency.setValueAtTime(400, now)
    stringFilter.Q.setValueAtTime(2, now)

    const stringGain = ctx.createGain()
    stringGain.gain.setValueAtTime(0.25, now)

    stringOsc.connect(stringFilter)
    stringFilter.connect(stringGain)
    stringGain.connect(musicGain)

    // Horn (sine wave stabs)
    const hornOsc = ctx.createOscillator()
    hornOsc.type = 'sine'
    hornOsc.frequency.setValueAtTime(330 + intensity * 100, now)

    const hornGain = ctx.createGain()
    hornGain.gain.setValueAtTime(0, now)
    // Stab every 1.5s
    hornGain.gain.linearRampToValueAtTime(0.2, now + 0.1)
    hornGain.gain.linearRampToValueAtTime(0, now + 0.5)
    hornGain.gain.linearRampToValueAtTime(0.2, now + 1.6)
    hornGain.gain.linearRampToValueAtTime(0, now + 2.0)

    hornOsc.connect(hornGain)
    hornGain.connect(musicGain)

    stringOsc.start()
    hornOsc.start()

    nodes.oscillators.push(stringOsc, hornOsc)
    nodes.filters.push(stringFilter)
  }, [initAudioContext, stopAllOscillators, musicVolume, intensity])

  // Industrial/Glitch: Chaotic, stuttering beats
  const playIndustrial = useCallback(() => {
    const nodes = initAudioContext()
    stopAllOscillators()

    const { ctx, musicGain } = nodes
    const now = ctx.currentTime

    musicGain.gain.setValueAtTime(0, now)
    musicGain.gain.linearRampToValueAtTime(musicVolume * 0.9, now + 0.5)

    // Glitchy pulse (square wave with stuttering)
    const pulseOsc = ctx.createOscillator()
    pulseOsc.type = 'square'
    pulseOsc.frequency.setValueAtTime(80 + intensity * 150, now)

    const pulseFilter = ctx.createBiquadFilter()
    pulseFilter.type = 'highpass'
    pulseFilter.frequency.setValueAtTime(100, now)

    const pulseGain = ctx.createGain()
    pulseGain.gain.setValueAtTime(0.35, now)
    // Stutter effect: on/off rapidly
    for (let i = 0; i < 8; i++) {
      pulseGain.gain.setTargetAtTime(0.35, now + i * 0.15, 0.02)
      pulseGain.gain.setTargetAtTime(0, now + i * 0.15 + 0.05, 0.02)
    }

    pulseOsc.connect(pulseFilter)
    pulseFilter.connect(pulseGain)
    pulseGain.connect(musicGain)

    // Noise layer (metallic)
    const bufSize = ctx.sampleRate * 0.5
    const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noiseSource = ctx.createBufferSource()
    noiseSource.buffer = noiseBuffer
    noiseSource.loop = true
    noiseSource.playbackRate.setValueAtTime(0.8, now)

    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.setValueAtTime(4000, now)
    noiseFilter.Q.setValueAtTime(10, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.1, now)

    noiseSource.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(musicGain)

    pulseOsc.start()
    noiseSource.start()

    nodes.oscillators.push(pulseOsc)
    nodes.filters.push(pulseFilter, noiseFilter)
  }, [initAudioContext, stopAllOscillators, musicVolume, intensity])

  // Play current mode
  useEffect(() => {
    if (!hasInteracted || isMuted) return

    if (musicMode === 'cyberpunk') playCyberpunk()
    else if (musicMode === 'orchestral') playOrchestral()
    else if (musicMode === 'industrial') playIndustrial()

    // Rotate modes every 45s if not attacking
    if (modeTimerRef.current) clearTimeout(modeTimerRef.current)
    modeTimerRef.current = setTimeout(() => {
      setMusicMode(prev => {
        const modes: MusicMode[] = ['cyberpunk', 'orchestral', 'industrial']
        const idx = modes.indexOf(prev)
        return modes[(idx + 1) % modes.length]
      })
    }, 45_000)

    return () => {
      if (modeTimerRef.current) clearTimeout(modeTimerRef.current)
    }
  }, [hasInteracted, isMuted, musicMode, playCyberpunk, playOrchestral, playIndustrial])

  // Intensity boost on attacks (simulate with global state observation)
  useEffect(() => {
    setIntensity(prev => Math.max(0, prev - 0.05)) // Decay
    if (intensityTimerRef.current) clearTimeout(intensityTimerRef.current)
    intensityTimerRef.current = setTimeout(() => setIntensity(0), 3000)
  }, [intensity])

  // Trigger intensity boost on action
  useEffect(() => {
    const boostIntensity = () => {
      setIntensity(1)
    }
    window.addEventListener('keydown', (e) => {
      if (['1', '2', '3', 'Enter'].includes(e.key)) boostIntensity()
    })
    return () => window.removeEventListener('keydown', boostIntensity as any)
  }, [])

  // Master mute/unmute
  useEffect(() => {
    if (audioNodesRef.current) {
      const targetGain = isMuted ? 0 : 1
      audioNodesRef.current.masterGain.gain.linearRampToValueAtTime(
        targetGain,
        audioNodesRef.current.ctx.currentTime + 0.3
      )
    }
    localStorage.setItem('parallel_arena_mute', String(isMuted))
  }, [isMuted])

  // Music volume change
  useEffect(() => {
    if (audioNodesRef.current) {
      audioNodesRef.current.musicGain.gain.setTargetAtTime(
        musicVolume,
        audioNodesRef.current.ctx.currentTime,
        0.1
      )
    }
  }, [musicVolume])

  // SFX volume (for future sound effects)
  useEffect(() => {
    if (audioNodesRef.current) {
      audioNodesRef.current.sfxGain.gain.setValueAtTime(sfxVolume, audioNodesRef.current.ctx.currentTime)
    }
  }, [sfxVolume])

  // Unlock audio on click
  useEffect(() => {
    const unlock = () => {
      setHasInteracted(true)
      window.removeEventListener('click', unlock)
    }
    window.addEventListener('click', unlock)
    return () => window.removeEventListener('click', unlock)
  }, [])

  return (
    <motion.div
      className="fixed bottom-4 right-4 z-40 space-y-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      {/* Master audio controls */}
      <div className="bg-black border border-[#1a1a1a] rounded-lg p-3 space-y-3 backdrop-blur-sm w-48">
        {/* Mute button */}
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="w-full px-3 py-2 bg-[#26D962] text-black font-bold text-[10px] uppercase tracking-widest hover:bg-[#20b050] transition-all"
        >
          {isMuted ? '🔇 Unmute' : '🔊 Mute'}
        </button>

        {/* Music mode selector */}
        {!isMuted && (
          <>
            <div className="space-y-1">
              <div className="text-[8px] text-[#555] uppercase font-bold">Music Mode</div>
              <div className="grid grid-cols-3 gap-1">
                {['cyberpunk', 'orchestral', 'industrial'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setMusicMode(mode as MusicMode)}
                    className={`px-2 py-1 text-[8px] font-bold uppercase tracking-tighter border transition-all ${
                      musicMode === mode
                        ? 'border-[#26D962] text-[#26D962] bg-[#26D962]/10'
                        : 'border-[#333] text-[#555] hover:border-white hover:text-white'
                    }`}
                  >
                    {mode === 'cyberpunk' ? '⚡' : mode === 'orchestral' ? '🎻' : '⚙️'}
                  </button>
                ))}
              </div>
            </div>

            {/* Music volume slider */}
            <div className="space-y-1">
              <label className="text-[8px] text-[#555] uppercase font-bold flex justify-between">
                <span>Music</span>
                <span className="text-[#26D962]">{Math.round(musicVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(musicVolume * 100)}
                onChange={e => setMusicVolume(Number(e.target.value) / 100)}
                className="w-full h-1 bg-[#1a1a1a] accent-[#26D962] cursor-pointer"
              />
            </div>

            {/* SFX volume slider */}
            <div className="space-y-1">
              <label className="text-[8px] text-[#555] uppercase font-bold flex justify-between">
                <span>SFX</span>
                <span className="text-[#3396FF]">{Math.round(sfxVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(sfxVolume * 100)}
                onChange={e => setSfxVolume(Number(e.target.value) / 100)}
                className="w-full h-1 bg-[#1a1a1a] accent-[#3396FF] cursor-pointer"
              />
            </div>

            {/* Intensity visualizer */}
            <div className="space-y-1">
              <div className="text-[8px] text-[#555] uppercase font-bold">Intensity</div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <motion.div
                    key={i}
                    className="h-2 flex-1 bg-[#1a1a1a] rounded-sm"
                    animate={{
                      backgroundColor:
                        intensity > i * 0.2
                          ? i <= intensity * 5
                            ? '#F25A67'
                            : '#26D962'
                          : '#1a1a1a',
                    }}
                    transition={{ duration: 0.1 }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Status indicator */}
      <div className="text-[8px] text-[#555] text-right">
        {!hasInteracted && 'Click to unlock audio'}
        {isMuted && hasInteracted && 'Audio muted'}
        {!isMuted && hasInteracted && `${musicMode} — ${Math.round(intensity * 100)}% ⚡`}
      </div>
    </motion.div>
  )
}
