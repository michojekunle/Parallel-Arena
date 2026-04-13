'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface HealEffectProps {
  target: string
  isActive: boolean
  amount: number
}

// Green energy spiral + healing aura
export function HealEffect({ target, isActive, amount }: HealEffectProps) {
  const [show, setShow] = useState(isActive)

  useEffect(() => {
    setShow(isActive)
    if (isActive) {
      const timer = setTimeout(() => setShow(false), 1400)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  if (!show) return null

  return (
    <>
      {/* Healing sparkle burst from center */}
      <motion.div
        className="fixed pointer-events-none"
        initial={{ opacity: 1, scale: 0 }}
        animate={{
          opacity: [1, 0.5, 0],
          scale: [0, 2, 0.5],
        }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      >
        <div className="text-5xl">✨</div>
      </motion.div>

      {/* Green glow aura */}
      <motion.div
        className="fixed pointer-events-none rounded-full"
        initial={{ opacity: 0, width: 0, height: 0 }}
        animate={{
          opacity: [0, 0.6, 0],
          width: [0, 200, 100],
          height: [0, 200, 100],
        }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        style={{
          background: 'radial-gradient(circle, rgba(38,217,98,0.4), transparent)',
        }}
      />

      {/* Healing number floating up */}
      <motion.div
        className="fixed pointer-events-none text-xl font-bold text-green-500"
        initial={{ opacity: 1, y: 0 }}
        animate={{ opacity: 0, y: -60 }}
        transition={{ duration: 1.2 }}
      >
        +{amount}
      </motion.div>

      {/* Pulsing heart symbols */}
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="fixed pointer-events-none text-2xl"
          initial={{ opacity: 1, y: 0, x: 0 }}
          animate={{
            opacity: 0,
            y: -80,
            x: [0, -30 + i * 30, -30 + i * 30],
          }}
          transition={{ duration: 1.2, delay: i * 0.1 }}
        >
          💚
        </motion.div>
      ))}
    </>
  )
}
