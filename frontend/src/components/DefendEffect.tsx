'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface DefendEffectProps {
  target: string
  isActive: boolean
}

// Cyberpunk shield + tech particles
export function DefendEffect({ target, isActive }: DefendEffectProps) {
  const [show, setShow] = useState(isActive)

  useEffect(() => {
    setShow(isActive)
    if (isActive) {
      const timer = setTimeout(() => setShow(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  if (!show) return null

  return (
    <>
      {/* Neon shield glow */}
      <motion.div
        className="fixed pointer-events-none rounded-full border-2 border-cyan-400"
        initial={{ opacity: 0, scale: 0 }}
        animate={{
          opacity: [0, 1, 0],
          scale: [0, 1.8, 1.2],
        }}
        transition={{ duration: 1.3, ease: 'easeOut' }}
        style={{
          width: 200,
          height: 200,
          boxShadow: '0 0 30px rgba(34,211,238,0.8), inset 0 0 30px rgba(34,211,238,0.3)',
        }}
      />

      {/* Inner shield pulse */}
      <motion.div
        className="fixed pointer-events-none rounded-full border border-cyan-300"
        initial={{ opacity: 0, scale: 0 }}
        animate={{
          opacity: [0, 0.8, 0],
          scale: [0, 1.5, 1],
        }}
        transition={{ duration: 1.3, delay: 0.1, ease: 'easeOut' }}
        style={{
          width: 160,
          height: 160,
          boxShadow: '0 0 15px rgba(34,211,238,0.5)',
        }}
      />

      {/* Shield icon */}
      <motion.div
        className="fixed pointer-events-none text-5xl"
        initial={{ opacity: 1, scale: 0.5, rotate: 0 }}
        animate={{
          opacity: [1, 1, 0],
          scale: [0.5, 1.2, 0.8],
          rotate: [0, 180, 180],
        }}
        transition={{ duration: 1.3, ease: 'easeOut' }}
      >
        🛡️
      </motion.div>

      {/* Tech particles radiating outward */}
      {[0, 1, 2, 3].map(i => (
        <motion.div
          key={i}
          className="fixed pointer-events-none w-1 h-1 rounded-full bg-cyan-400"
          initial={{
            opacity: 1,
            x: 0,
            y: 0,
          }}
          animate={{
            opacity: 0,
            x: Math.cos((i / 4) * Math.PI * 2) * 150,
            y: Math.sin((i / 4) * Math.PI * 2) * 150,
          }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      ))}
    </>
  )
}
