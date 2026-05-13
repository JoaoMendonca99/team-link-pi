'use client'

import { useState } from 'react'

import { DemoBanner } from '@/components/team-link/demo-banner'
import { FormSection } from '@/components/team-link/form-section'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function ContatoContent() {
  const [bannerOpen, setBannerOpen] = useState(false)

  return (
    <main className="bg-muted/30 pb-20">
      <div className="border-b border-border bg-gradient-to-b from-muted/80 to-background py-14">
        <Container className="space-y-5 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-primary">Linha institucional</p>
          <div className="grid gap-6 lg:grid-cols-[1.05fr,minmax(0,0.9fr)]">
            <div>
              <h1 className="text-4xl font-bold md:text-5xl">Fale com a equipe acadêmica</h1>
              <p className="mt-5 max-w-xl text-muted-foreground">
                Neste estágio apenas interface local: nenhuma mensagem sai do seu computador até canais institucionais serem configurados.
              </p>
            </div>
            <aside className="rounded-[2rem] border border-primary/35 bg-[#081021] p-8 text-sm text-white shadow-xl">
              <p className="text-xs uppercase tracking-[0.32em] text-white/65">Informações públicas acadêmicas</p>
              <ul className="mt-6 space-y-4">
                <li>
                  <p className="text-white/65">Projeto</p>
                  <p className="text-xl font-semibold">Team Link</p>
                </li>
                <li>
                  <p className="text-white/65">Curso</p>
                  <p className="text-lg font-semibold">Engenharia da Computação</p>
                </li>
                <li>
                  <p className="text-white/65">Experiência</p>
                  <p className="text-lg font-semibold">Projeto Integrador II</p>
                </li>
                <li>
                  <p className="text-white/65">Escopo atual</p>
                  <p>Site estático hospedável em https://team-link.vercel.app (placeholder institucional).</p>
                </li>
              </ul>
              <p className="mt-8 text-xs text-white/70">
                Não há e-mail público até o jurídico da instituição aprovar canais externos oficiais.
              </p>
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
          <FormSection title="Mensagem">
            <div className="space-y-3">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" required placeholder="Maria Helena Prado" className="rounded-2xl" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="mail">Email institucional</Label>
              <Input id="mail" required type="email" placeholder="aluno.ext@univ.local" className="rounded-2xl" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="assunto">Assunto</Label>
              <Input id="assunto" required placeholder="Convite para coworking com laboratório X" className="rounded-2xl" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="mensagem">Mensagem</Label>
              <Textarea
                id="mensagem"
                required
                rows={8}
                placeholder="Explique urgência acadêmica, sem dados sensíveis de terceiros."
                className="rounded-2xl"
              />
            </div>

            <Button type="submit" className="w-full rounded-2xl py-6 text-lg font-semibold">
              Enviar (visualização apenas)
            </Button>
          </FormSection>
        </form>
      </Container>

      <DemoBanner
        open={bannerOpen}
        tone="success"
        onClose={() => setBannerOpen(false)}
        message="Pedido gravado apenas localmente até existir servidor de mensagens institucional aprovado."
      />
    </main>
  )
}
