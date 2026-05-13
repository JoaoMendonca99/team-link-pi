'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef, type ReactNode } from 'react'

interface ScrollSectionProps {
  children: ReactNode
  className?: string
}

export function ScrollSection({ children, className = '' }: ScrollSectionProps) {
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.82, 1], [0, 1, 1, 0])
  const y = useTransform(scrollYProgress, [0, 0.2, 0.82, 1], [32, 0, 0, -24])

  return (
    <motion.div
      ref={ref}
      style={{ opacity, y }}
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
