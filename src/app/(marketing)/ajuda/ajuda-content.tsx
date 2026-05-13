'use client'

import { useMemo, useState } from 'react'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
const HELP_SECTIONS = [
  {
    id: 'publicar',
    title: 'Como publicar uma ideia?',
    bullets: ['Abra Nova Ideia e preencha contexto técnico e acadêmico.', 'Liste habilidades reais esperadas pela equipe.', 'Use tags para aumentar recuperação futura.'],
  },
  {
    id: 'procurar',
    title: 'Como encontrar projetos?',
    bullets: ['Utilize filtros combináveis ou busca textual livre.', 'Observe status e vagas para evitar esperas inconsistentes.', 'Abra fichas para entender problema e método.'],
  },
  {
    id: 'participar',
    title: 'Como entrar para uma equipe?',
    bullets: ['O botão “Quero participar” guardará registros apenas após ligar servidor.', 'Informe disponibilidade e stack nos comentários quando abertos.', 'Acompanhe comunicação institucional por e-mail no futuro.'],
  },
  {
    id: 'editar',
    title: 'Como editar meu projeto?',
    bullets: ['Acesse Meus Projetos e edição rápida ou detalhes.', 'Atualize descrições assim que permissões institucionais existirem.', 'Integração oficial substituirá armazenamento local.'],
  },
  {
    id: 'curtidas',
    title: 'Como funcionam curtidas/comentários?',
    bullets: ['Curtidas e comentários refletirão engajamento real após implantar API.', 'Hoje apenas layout de formulário — sem servidor processando texto.', 'As rotas ficarão auditáveis segundo política institucional.'],
  },
] satisfies Array<{ id: string; title: string; bullets: string[] }>

export function AjudaContent() {
  const [expanded, setExpanded] = useState<string>('publicar')

  const faqPairs = useMemo(
    () => [
      ['Há servidor real hospedando esses projetos?', 'Neste estágio apenas export estático. Nada vai para infraestrutura privada até validação institucional.'],
      ['Posso anexar arquivos científicos?', 'Ainda não. Estamos projetando ingestão ligada ao storage seguro quando autenticação estiver disponível.'],
      ['Posso remover meu perfil local?', 'Sim — apague dados do site no navegador ou use Sair para encerrar a sessão apenas neste aparelho.'],
    ],
    [],
  )

  return (
    <main className="bg-muted/35 pb-20">
      <div className="border-b border-border bg-gradient-to-br from-muted/80 via-background to-background">
        <Container className="space-y-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-primary">FAQ Operacional</p>
          <h1 className="text-4xl font-bold md:text-5xl">Centro de ajuda da Team Link</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Conteúdo pensado para estudantes tecnológicos: texto direto aos fluxos publicados nesta versão exportada do aplicativo estático.
          </p>
        </Container>
      </div>

      <Container className="grid gap-8 py-14 md:grid-cols-[2fr,minmax(0,1fr)] md:items-start">
        <div className="space-y-4">
          {HELP_SECTIONS.map((section) => {
            const opened = expanded === section.id

            return (
              <motion.section
                key={section.id}
                layout
                className={`rounded-[1.75rem] border border-border bg-card shadow-md ${opened ? 'ring-2 ring-primary/35' : ''}`}
              >
                <button
                  type="button"
                  aria-expanded={opened}
                  aria-controls={`sec-${section.id}`}
                  id={`toggle-${section.id}`}
                  onClick={() => setExpanded((previous) => (previous === section.id ? '' : section.id))}
                  className="flex w-full cursor-pointer flex-col px-7 py-5 text-left md:flex-row md:items-center md:justify-between"
                >
                  <span className="text-lg font-semibold">{section.title}</span>
                  <span className="text-sm font-semibold text-primary">{opened ? 'Recolher' : 'Expandir'}</span>
                </button>
                {opened ? (
                  <div id={`sec-${section.id}`} className="space-y-3 border-t border-border px-7 py-6 text-sm text-muted-foreground">
                    {section.bullets.map((bullet) => (
                      <p key={bullet}>• {bullet}</p>
                    ))}
                  </div>
                ) : null}
              </motion.section>
            )
          })}
        </div>

        <aside className="space-y-6 rounded-[1.85rem] border border-border bg-card p-8 shadow-xl">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Dúvidas frequentes rápidas</h2>
            <p className="text-sm text-muted-foreground">Respostas compactas até abrir chamado formal com professores-coordenadores.</p>
          </div>
          <ul className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            {faqPairs.map(([question, answer]) => (
              <li key={question}>
                <p className="font-semibold text-foreground">{question}</p>
                <p className="mt-2">{answer}</p>
              </li>
            ))}
          </ul>
          <Button asChild className="font-semibold">
            <Link href="/explorar" className="inline-flex items-center gap-2 rounded-2xl">
              Voltar ao explorar
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </aside>
      </Container>

      <Container className="pb-20 pt-8">
        <div className="rounded-[2.5rem] border border-primary/30 bg-[#081021] p-12 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/65">Fluxo rápido</p>
              <h2 className="mt-4 text-3xl font-bold">Pronto para colocar suas ideias no radar institucional?</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="rounded-2xl px-10 font-semibold shadow-lg shadow-white/35">
                <Link href="/explorar">Explorar</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-2xl border-white/55 bg-transparent text-white hover:bg-white/15">
                <Link href="/nova-ideia">Nova ideia</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </main>
  )
}
