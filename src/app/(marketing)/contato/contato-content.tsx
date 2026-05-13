'use client'

import { useState } from 'react'
import { MailQuestion, Sparkles, Users2 } from 'lucide-react'

import { DemoBanner } from '@/components/team-link/demo-banner'
import { FormSection } from '@/components/team-link/form-section'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const supportTopics = [
  {
    icon: MailQuestion,
    title: 'Dúvidas sobre a plataforma',
    description: 'Tire dúvidas sobre cadastro, publicação de projetos ou participação em equipes.',
  },
  {
    icon: Sparkles,
    title: 'Sugestões e feedback',
    description: 'Compartilhe ideias para melhorar a experiência ou novas funcionalidades.',
  },
  {
    icon: Users2,
    title: 'Parcerias e contato direto',
    description: 'Entre em contato para falar de oportunidades ou propostas com a equipe.',
  },
] as const

export function ContatoContent() {
  const [bannerOpen, setBannerOpen] = useState(false)

  return (
    <main className="bg-muted/30 pb-20">
      <div className="border-b border-border bg-gradient-to-b from-muted/80 to-background py-14">
        <Container className="space-y-5 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-primary">Contato</p>
          <div className="grid gap-6 lg:grid-cols-[1.05fr,minmax(0,0.9fr)]">
            <div>
              <h1 className="text-4xl font-bold md:text-5xl">Fale com a equipe do Team Link</h1>
              <p className="mt-5 max-w-xl text-muted-foreground">
                Tem uma dúvida, sugestão ou quer falar com a gente? Use o formulário abaixo. Vamos responder pelo canal indicado assim que possível.
              </p>
            </div>
            <aside className="rounded-[2rem] border border-primary/35 bg-[#081021] p-8 text-sm text-white shadow-xl">
              <p className="text-xs uppercase tracking-[0.32em] text-white/65">Como podemos ajudar</p>
              <ul className="mt-6 space-y-5">
                {supportTopics.map((topic) => {
                  const Icon = topic.icon
                  return (
                    <li key={topic.title} className="flex gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                        <Icon className="h-4 w-4 text-white" aria-hidden />
                      </span>
                      <div>
                        <p className="text-base font-semibold">{topic.title}</p>
                        <p className="mt-1 text-xs text-white/75">{topic.description}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </aside>
          </div>
        </Container>
      </div>

      <Container size="narrow" className="py-12">
        <form
          className="space-y-10"
          onSubmit={(event) => {
            event.preventDefault()
            setBannerOpen(true)
          }}
        >
          <FormSection title="Sua mensagem">
            <div className="space-y-3">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" required placeholder="Seu nome completo" className="rounded-2xl" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="mail">E-mail</Label>
              <Input id="mail" required type="email" placeholder="seu.email@exemplo.com" className="rounded-2xl" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="assunto">Assunto</Label>
              <Input id="assunto" required placeholder="Ex.: dúvida sobre publicação de projeto" className="rounded-2xl" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="mensagem">Mensagem</Label>
              <Textarea
                id="mensagem"
                required
                rows={8}
                placeholder="Conte com detalhes do que você precisa para que possamos te ajudar melhor."
                className="rounded-2xl"
              />
            </div>

            <Button type="submit" className="w-full rounded-2xl py-6 text-lg font-semibold">
              Enviar mensagem
            </Button>
          </FormSection>
        </form>
      </Container>

      <DemoBanner
        open={bannerOpen}
        tone="success"
        onClose={() => setBannerOpen(false)}
        message="Recebemos sua mensagem. Responderemos pelo canal indicado em breve."
      />
    </main>
  )
}
