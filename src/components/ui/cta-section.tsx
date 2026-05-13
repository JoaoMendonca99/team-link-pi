'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Compass, MessageSquare, Rocket, Sparkles, Users2 } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'

const highlights = [
  {
    icon: Sparkles,
    title: 'Publique sua ideia',
    description: 'Conte o problema, o objetivo e as habilidades que você procura.',
  },
  {
    icon: Users2,
    title: 'Forme sua equipe',
    description: 'Receba solicitações e escolha quem entra no projeto.',
  },
  {
    icon: MessageSquare,
    title: 'Acompanhe interações',
    description: 'Curtidas, comentários e participações ficam reunidos no projeto.',
  },
] as const

export function CTASection() {
  return (
    <section className="relative overflow-hidden border-b border-transparent bg-[#081021] py-24 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[10%] top-[-20%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,#2563EB_0%,transparent_70%)] blur-3xl opacity-85" />
        <div className="absolute bottom-[-30%] right-[5%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,#14B8A6_0%,transparent_70%)] blur-3xl opacity-85" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(8,17,39,0.95),rgba(26,78,236,0.45))]" />
      </div>

      <Container className="relative z-10 space-y-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mx-auto max-w-3xl space-y-5"
        >
          <span className="inline-flex rounded-full border border-white/40 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/85">
            Próximo passo
          </span>
          <h2 className="text-balance text-4xl font-bold md:text-5xl">Pronto para tirar sua ideia do papel?</h2>
          <p className="text-lg text-white/80 md:text-xl">
            Publique seu projeto, encontre pessoas com habilidades complementares e mantenha tudo organizado em um só lugar.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
          className="flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Button
            size="lg"
            asChild
            className="rounded-2xl px-10 font-semibold shadow-lg shadow-primary/35"
          >
            <Link href="/nova-ideia" className="inline-flex items-center gap-2">
              <Rocket className="h-4 w-4" aria-hidden />
              Publicar nova ideia
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="rounded-2xl border-white/60 bg-transparent px-10 font-semibold text-white hover:bg-white/15"
          >
            <Link href="/explorar" className="inline-flex items-center gap-2">
              <Compass className="h-4 w-4" aria-hidden />
              Explorar projetos
            </Link>
          </Button>
        </motion.div>

        <div className="grid gap-6 border-t border-white/15 pt-10 text-left text-white/85 sm:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3 }}
                className="mx-auto w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur sm:mx-0 sm:max-w-none"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-white/75">{item.description}</p>
              </motion.div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
