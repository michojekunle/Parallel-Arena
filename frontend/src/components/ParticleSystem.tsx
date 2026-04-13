'use client'

import { motion } from 'framer-motion'

// Ambient sci-fi particles for cyberpunk atmosphere
export function ParticleSystem() {
  // Generate random particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 8 + Math.random() * 4,
    size: 1 + Math.random() * 3,
  }))

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-cyan-400 opacity-40"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            boxShadow: `0 0 ${p.size * 2}px rgba(34,211,238,0.6)`,
          }}
          animate={{
            y: [0, -300],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      {/* Ambient grid background glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            repeating-linear-gradient(
              0deg,
              rgba(34,211,238,0.03) 0px,
              transparent 1px,
              transparent 50px,
              rgba(34,211,238,0.03) 51px
            ),
            repeating-linear-gradient(
              90deg,
              rgba(34,211,238,0.03) 0px,
              transparent 1px,
              transparent 50px,
              rgba(34,211,238,0.03) 51px
            )
          `,
        }}
        animate={{
          backgroundPosition: ['0 0', '0 50px'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  )
}
