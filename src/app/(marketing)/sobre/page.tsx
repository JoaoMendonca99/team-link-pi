import type { Metadata } from 'next'

import Link from 'next/link'
import { Activity, Compass, Lightbulb, Search, Sparkles, UsersRound } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Sobre',
  description:
    'O Team Link ajuda pessoas a publicar ideias, encontrar colaboradores e formar equipes para tirar projetos do papel.',
}

const pillars = [
  {
    icon: Sparkles,
    title: 'O que resolvemos',
    description:
      'Muitas ideias não avançam por falta de equipe, organização ou visibilidade. O Team Link cria um espaço simples para apresentar projetos e encontrar pessoas interessadas em colaborar.',
  },
  {
    icon: UsersRound,
    title: 'Para quem é',
    description:
      'Para estudantes, criadores, desenvolvedores, designers, pesquisadores e qualquer pessoa que queira participar de projetos colaborativos.',
  },
  {
    icon: Compass,
    title: 'Como funciona',
    description:
      'Você publica uma ideia, informa as habilidades necessárias e outras pessoas podem descobrir o projeto, curtir, comentar ou solicitar participação.',
  },
] as const

const steps = [
  {
    icon: Lightbulb,
    title: 'Publique sua ideia',
    description:
      'Descreva o problema, o objetivo do projeto, a categoria e as habilidades que você procura.',
  },
  {
    icon: Search,
    title: 'Encontre colaboradores',
    description:
      'Outras pessoas podem descobrir seu projeto, interagir e solicitar participação.',
  },
  {
    icon: UsersRound,
    title: 'Monte sua equipe',
    description:
      'O dono do projeto analisa as solicitações e aprova quem fará parte da equipe.',
  },
  {
    icon: Activity,
    title: 'Acompanhe sua evolução',
    description:
      'Projetos, participações, curtidas e comentários ficam organizados no perfil.',
  },
] as const

const team = [
  {
    name: 'João Gustavo Mendonça',
    role: 'Produto e desenvolvimento',
    focus: 'Desenvolvimento, produto e organização da plataforma.',
  },
  {
    name: 'Arthur Raposo de Castro',
    role: 'Pesquisa e estrutura',
    focus: 'Pesquisa, estrutura de solução e apoio técnico.',
  },
  {
    name: 'Erick Souto Godoi',
    role: 'Design e experiência',
    focus: 'Interface, experiência do usuário e comunicação visual.',
  },
  {
    name: 'Pedro Henrique Bianco',
    role: 'Protótipos e validação',
    focus: 'Protótipos, validação e apoio ao desenvolvimento.',
  },
] as const

export default function SobrePage() {
  return (
    <main>
      <section className="border-b border-border bg-gradient-to-br from-primary/20 via-muted/70 to-background py-24">
        <Container className="space-y-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">
            Sobre o Team Link
          </p>
          <h1 className="text-balance text-4xl font-extrabold md:text-[3.75rem]">
            Conectando ideias a pessoas certas
          </h1>
          <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
            O Team Link ajuda pessoas a publicar ideias, encontrar colaboradores e formar equipes
            para tirar projetos do papel com mais clareza e organização.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-6">
            <Button asChild className="rounded-2xl px-8 py-6 text-base font-semibold">
              <Link href="/explorar">Explorar projetos</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-2xl px-8 py-6 text-base font-semibold"
            >
              <Link href="/nova-ideia">Criar ideia</Link>
            </Button>
          </div>
        </Container>
      </section>

      <section className="border-b border-border bg-background py-20">
        <Container className="grid gap-8 md:grid-cols-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon
            return (
              <article
                key={pillar.title}
                className="rounded-[1.9rem] border border-border bg-card p-8 shadow-xl"
              >
                <Icon className="h-10 w-10 text-primary" aria-hidden />
                <h2 className="mt-6 text-2xl font-bold">{pillar.title}</h2>
                <p className="mt-4 text-muted-foreground">{pillar.description}</p>
              </article>
            )
          })}
        </Container>
      </section>

      <section className="bg-muted/30 py-24">
        <Container className="space-y-12">
          <div className="space-y-4 text-center md:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">
              Passo a passo
            </p>
            <h2 className="text-balance text-4xl font-bold">Como o Team Link funciona</h2>
            <p className="max-w-2xl text-muted-foreground md:text-lg">
              Em poucos passos, você sai de uma ideia solta para um projeto com pessoas envolvidas.
            </p>
          </div>
          <ol className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon
              return (
                <li
                  key={step.title}
                  className="flex h-full flex-col gap-4 rounded-[1.75rem] border border-border bg-card p-6 shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Icon className="h-6 w-6 text-primary" aria-hidden />
                  </div>
                  <h3 className="text-xl font-semibold leading-tight">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </li>
              )
            })}
          </ol>
        </Container>
      </section>

      <section className="border-y border-border bg-background py-24">
        <Container className="space-y-12">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Equipe</p>
            <h2 className="text-balance text-4xl font-bold">Quem está construindo o Team Link</h2>
            <p className="text-muted-foreground md:text-lg">
              Por trás do Team Link existe uma equipe focada em criar uma experiência simples, útil e
              confiável para colaboração em projetos.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {team.map((member) => (
              <article
                key={member.name}
                className="rounded-[1.75rem] border border-border bg-card p-6 shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-xl font-semibold text-primary">
                    {member.name
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold leading-tight">{member.name}</h3>
                    <p className="text-sm font-medium text-teal-600 dark:text-teal-300">
                      {member.role}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{member.focus}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-muted/30 py-24">
        <Container className="grid gap-10 md:grid-cols-[2fr_minmax(0,1fr)] md:items-center">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">
              Pronto para começar
            </p>
            <h2 className="text-balance text-4xl font-bold">Tem uma ideia para tirar do papel?</h2>
            <p className="text-muted-foreground md:text-lg">
              Publique seu projeto no Team Link e encontre pessoas com habilidades complementares para
              construir junto.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="rounded-2xl px-6 py-5 text-base font-semibold">
                <Link href="/nova-ideia">Criar ideia</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-2xl px-6 py-5 text-base font-semibold"
              >
                <Link href="/explorar">Explorar projetos</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-[1.8rem] border border-border bg-card p-8 text-center shadow-xl">
            <Sparkles className="mx-auto h-10 w-10 text-primary" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              Cada projeto começa com uma ideia. Quanto antes você compartilhar, mais cedo as pessoas
              certas podem chegar até ela.
            </p>
          </div>
        </Container>
      </section>
    </main>
  )
}
