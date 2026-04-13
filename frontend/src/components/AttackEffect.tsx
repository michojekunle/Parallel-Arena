'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface AttackEffectProps {
  attacker: string
  target: string
  isActive: boolean
  damage: number
}

// Animated fire projectile + impact explosion
export function AttackEffect({ attacker, target, isActive, damage }: AttackEffectProps) {
  const [show, setShow] = useState(isActive)

  useEffect(() => {
    setShow(isActive)
    if (isActive) {
      const timer = setTimeout(() => setShow(false), 1600) // Epic 1.6s duration
      return () => clearTimeout(timer)
    }
  }, [isActive])

  if (!show) return null

  return (
    <>
      {/* Attacker → Target: Fire projectile trail */}
      <motion.div
        className="fixed pointer-events-none"
        initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
        animate={{
          opacity: [1, 0.8, 0],
          x: 300,
          y: 50,
          scale: [1, 1.2, 0.5],
        }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        <div className="text-4xl animate-pulse">🔥</div>
      </motion.div>

      {/* Impact explosion at target */}
      <motion.div
        className="fixed pointer-events-none"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0.8] }}
        transition={{ duration: 0.8, delay: 0.7, ease: 'easeOut' }}
      >
        <div className="text-6xl">💥</div>
      </motion.div>

      {/* Damage number floating up */}
      <motion.div
        className="fixed pointer-events-none text-xl font-bold text-red-500"
        initial={{ opacity: 1, y: 0 }}
        animate={{ opacity: 0, y: -60 }}
        transition={{ duration: 1.2, delay: 0.8 }}
      >
        -{damage}
      </motion.div>

      {/* Screen shake on impact */}
      <motion.div
        className="fixed inset-0 pointer-events-none border-2 border-red-500 opacity-0"
        animate={{
          opacity: [0, 0.3, 0],
          boxShadow: [
            '0 0 0 0 rgba(239, 68, 68, 0)',
            '0 0 20px 10px rgba(239, 68, 68, 0.4)',
            '0 0 0 0 rgba(239, 68, 68, 0)',
          ],
        }}
        transition={{ duration: 0.6, delay: 0.7 }}
      />
    </>
  )
}
