'use client'

import { motion } from 'framer-motion'
import { Award, Layers, Sparkles } from 'lucide-react'

import { Container } from '@/components/layout/container'

const benefits = [
  {
    icon: Sparkles,
    title: 'Portfólio com contexto real',
    description:
      'Cada projeto explica o problema, o objetivo e as habilidades envolvidas — útil para mostrar sua trajetória.',
  },
  {
    icon: Layers,
    title: 'Equipes multidisciplinares',
    description:
      'Veja vagas, habilidades e perfis procurados antes de gastar tempo em conversas desalinhadas.',
  },
  {
    icon: Award,
    title: 'Ambiente focado e direto',
    description:
      'Interface limpa, voltada para colaboração em projetos, sem ruídos típicos de redes sociais abertas.',
  },
] as const

export function StudentBenefitsSection() {
  return (
    <section className="border-b border-border bg-muted/20 py-20 dark:bg-muted/15">
      <Container className="space-y-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Por que usar</p>
          <h2 className="mt-4 text-balance text-4xl font-bold">O que o Team Link entrega</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon
            return (
              <motion.article
                key={benefit.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
                whileHover={{ y: -4, scale: 1.01 }}
                className="mx-auto flex w-full max-w-md flex-col items-center rounded-[1.85rem] border border-card-outline bg-card p-8 text-center shadow-sm md:mx-0 md:max-w-none"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-6 text-xl font-semibold">{benefit.title}</h3>
                <p className="mt-3 text-base text-muted-foreground">{benefit.description}</p>
              </motion.article>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
