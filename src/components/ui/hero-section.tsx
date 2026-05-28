'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Compass, MessageSquare, Rocket, Sparkles, UserPlus, Users2 } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'

const platformPreviewRows = [
  { icon: Rocket, label: 'Divulgue ideias', tag: 'Publicação' },
  { icon: UserPlus, label: 'Encontre colaboradores', tag: 'Conexão' },
  { icon: Users2, label: 'Receba interessados', tag: 'Equipe' },
] as const

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-white/15 bg-[#071028] pb-16 pt-12 text-white sm:pb-20 sm:pt-14 lg:pb-24 lg:pt-16">
      <div className="pointer-events-none absolute inset-0 opacity-95">
        <div className="absolute -left-[10%] top-[-20%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,#2563EB_0%,transparent_65%)] blur-3xl" />
        <div className="absolute right-[-5%] top-[10%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,#4F46E5_0%,transparent_70%)] blur-3xl" />
        <div className="absolute bottom-[-30%] left-[20%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,#14B8A6_0%,transparent_70%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(15,23,42,0.75),rgba(15,23,42,0.45))]" />
      </div>

      <Container className="relative z-10">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="space-y-8 text-center lg:text-left"
          >
            <span className="inline-flex max-w-full rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85 sm:px-4 sm:text-[11px] sm:tracking-[0.28em]">
              Plataforma de projetos
            </span>

            <div className="space-y-4 sm:space-y-6">
              <h1 className="text-balance text-3xl font-extrabold leading-tight sm:text-5xl lg:text-[3.85rem] lg:leading-[1.05] xl:text-[4.25rem]">
                Conecte ideias a pessoas.
              </h1>
              <p className="text-balance text-base text-white/80 sm:text-lg md:text-xl">
                Publique projetos, encontre colaboradores e forme equipes para transformar ideias em soluções reais.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                size="lg"
                asChild
                className="rounded-2xl bg-white px-7 font-semibold text-primary shadow-xl shadow-primary/35 hover:bg-white/90"
              >
                <Link href="/explorar" className="inline-flex items-center gap-2">
                  Explorar projetos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="rounded-2xl border-white/70 bg-transparent px-7 font-semibold text-white hover:bg-white/15"
              >
                <Link href="/nova-ideia">Criar ideia</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: Compass, label: 'Descubra projetos por área, habilidade ou interesse' },
                { icon: Users2, label: 'Veja papéis, vagas e habilidades de cada projeto' },
                { icon: MessageSquare, label: 'Curta, comente e solicite participação' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="mx-auto flex w-full max-w-md gap-3 rounded-2xl border border-white/20 bg-white/5 p-4 text-left backdrop-blur sm:mx-0 sm:max-w-none"
                >
                  <Icon className="mt-1 h-5 w-5 text-[#F59E0B]" aria-hidden />
                  <p className="text-sm leading-relaxed text-white/80">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08, ease: 'easeOut' }}
            className="relative mx-auto w-full max-w-md lg:mx-0 lg:max-w-none"
          >
            <div className="absolute -right-6 -top-10 hidden h-40 w-40 rounded-full bg-white/10 blur-3xl lg:block" />
            <div className="relative space-y-6 rounded-[2rem] border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Organize projetos com clareza</p>
                  <p className="mt-1 text-sm text-white/70">
                    Publique ideias, encontre colaboradores e acompanhe oportunidades de participação em um só lugar.
                  </p>
                </div>
              </div>
              <ul className="space-y-3 border-t border-white/15 pt-4">
                {platformPreviewRows.map((row) => {
                  const Icon = row.icon
                  return (
                    <li
                      key={row.label}
                      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#071028]/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <span className="flex min-w-0 items-center gap-3 text-sm text-white/85">
                        <Icon className="h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden />
                        <span className="min-w-0">{row.label}</span>
                      </span>
                      <span className="w-fit shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
                        {row.tag}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  )
}
