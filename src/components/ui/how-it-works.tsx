'use client'

import { motion } from 'framer-motion'
import { ClipboardList, Layers3, LineChart, Search } from 'lucide-react'

import { Container } from '@/components/layout/container'

const steps = [
  {
    icon: ClipboardList,
    title: 'Publique sua ideia',
    description: 'Conte o problema, o impacto e o que já validou em laboratório ou pesquisa.',
    accent: 'from-primary/15 to-indigo-500/10',
  },
  {
    icon: Search,
    title: 'Encontre colaboradores',
    description: 'Explore habilidades, tags e vagas abertas com contexto acadêmico transparente.',
    accent: 'from-indigo-500/15 to-teal-500/10',
  },
  {
    icon: Layers3,
    title: 'Monte sua equipe',
    description: 'Combine papéis, combine microciclos de entrega e defina combinados públicos.',
    accent: 'from-teal-500/15 to-primary/15',
  },
  {
    icon: LineChart,
    title: 'Evolua o projeto',
    description: 'Registre aprendizados visíveis, documentação e próximos passos para próximos integrantes.',
    accent: 'from-amber-500/12 to-primary/14',
  },
] as const

export function HowItWorks() {
  return (
    <section id="como-funciona" className="border-b border-border bg-card py-20">
      <Container className="space-y-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Fluxo guiado</p>
          <h2 className="mt-4 text-balance text-4xl font-bold">Como o Team Link funciona</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Um método enxuto para transformar ideias em squads acadêmicos com governança leve e descoberta clara.
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
                className={`relative rounded-[1.75rem] border border-border bg-gradient-to-br ${step.accent} p-6 shadow-sm`}
              >
                <span className="absolute right-6 top-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-background/85 text-primary shadow-inner">
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
