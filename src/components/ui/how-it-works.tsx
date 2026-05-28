'use client'

import { motion } from 'framer-motion'
import { ClipboardList, Layers3, LineChart, Search } from 'lucide-react'

import { Container } from '@/components/layout/container'

const steps = [
  {
    icon: ClipboardList,
    title: 'Publique sua ideia',
    description: 'Conte o problema, o objetivo do projeto e as habilidades que você procura.',
    accent: 'from-primary/15 to-indigo-500/10',
  },
  {
    icon: Search,
    title: 'Encontre colaboradores',
    description: 'Encontre pessoas com habilidades compatíveis e objetivos em comum.',
    accent: 'from-indigo-500/15 to-teal-500/10',
  },
  {
    icon: Layers3,
    title: 'Monte sua equipe',
    description: 'Defina funções, organize responsabilidades e alinhe os próximos passos da equipe.',
    accent: 'from-teal-500/15 to-primary/15',
  },
  {
    icon: LineChart,
    title: 'Acompanhe o projeto',
    description: 'Mantenha o projeto organizado para que novos participantes entendam o andamento.',
    accent: 'from-amber-500/12 to-primary/14',
  },
] as const

export function HowItWorks() {
  return (
    <section id="como-funciona" className="border-b border-card-outline bg-card py-14 sm:py-20">
      <Container className="space-y-10 sm:space-y-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Passo a passo</p>
          <h2 className="mt-4 text-balance text-3xl font-bold sm:text-4xl">Como o Team Link funciona</h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Em poucos passos, você sai de uma ideia solta para um projeto com pessoas envolvidas.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <motion.article
                key={step.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05, ease: 'easeOut' }}
                viewport={{ once: true, margin: '-40px' }}
                whileHover={{ y: -3, scale: 1.01 }}
                className={`relative mx-auto flex w-full max-w-md flex-col items-center rounded-[1.75rem] border border-card-outline bg-gradient-to-br ${step.accent} p-6 text-center shadow-sm md:mx-0 md:max-w-none`}
              >
                <span className="absolute right-6 top-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background/85 text-primary shadow-inner">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </motion.article>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
