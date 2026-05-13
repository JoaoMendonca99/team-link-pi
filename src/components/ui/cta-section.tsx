'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Compass, Rocket } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'

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
          <h2 className="text-balance text-4xl font-bold md:text-5xl">Pronto para orquestrar sua equipe?</h2>
          <p className="text-lg text-white/80 md:text-xl">
            Publique com clareza, convide talentos próximos e mantenha o histórico do projeto sempre visível para a banca ou para mentores externos.
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
              Voltar ao explorar
            </Link>
          </Button>
        </motion.div>

        <div className="grid gap-6 border-t border-white/15 pt-10 text-white/85 sm:grid-cols-3">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.25 }}>
            <div className="text-4xl font-bold tabular-nums text-white">—</div>
            <div className="text-sm uppercase tracking-[0.2em] text-white/65">Projetos publicados (após backend)</div>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.25, delay: 0.05 }}>
            <div className="text-4xl font-bold tabular-nums text-white">—</div>
            <div className="text-sm uppercase tracking-[0.2em] text-white/65">Equipes registradas na plataforma</div>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.25, delay: 0.1 }}>
            <div className="text-4xl font-bold tabular-nums text-white">—</div>
            <div className="text-sm uppercase tracking-[0.2em] text-white/65">Indicadores de engajamento reais</div>
          </motion.div>
        </div>
      </Container>
    </section>
  )
}
