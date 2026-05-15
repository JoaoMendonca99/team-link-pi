'use client'

import { useMemo, useState } from 'react'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
const HELP_SECTIONS = [
  {
    id: 'cadastro',
    title: 'Como criar uma conta?',
    bullets: [
      'Acesse "Cadastro" no menu superior ou na home.',
      'Informe nome, e-mail, senha e seu curso ou área principal.',
      'Confirme seu e-mail pelo link enviado e faça login para começar.',
    ],
  },
  {
    id: 'publicar',
    title: 'Como publicar um projeto?',
    bullets: [
      'Abra "Nova ideia" e descreva o problema, o objetivo e a categoria do projeto.',
      'Indique as habilidades que você procura e o número de vagas em aberto.',
      'Use tags para ajudar outras pessoas a encontrarem seu projeto.',
    ],
  },
  {
    id: 'procurar',
    title: 'Como encontrar projetos para participar?',
    bullets: [
      'Use "Explorar" para ver todos os projetos publicados.',
      'Combine filtros por categoria, status, habilidade ou tema.',
      'Abra a página de cada projeto para ler a descrição completa antes de se candidatar.',
    ],
  },
  {
    id: 'participar',
    title: 'Como solicitar participação?',
    bullets: [
      'Na página do projeto, clique em "Solicitar participação".',
      'Escreva uma mensagem rápida apresentando-se e indicando sua disponibilidade (opcional).',
      'Aguarde a resposta de quem publicou o projeto. Você pode cancelar a solicitação a qualquer momento.',
    ],
  },
  {
    id: 'editar-perfil',
    title: 'Como editar meu perfil?',
    bullets: [
      'Entre na sua conta e acesse "Perfil".',
      'Clique em "Editar perfil" para atualizar nome, bio, curso, habilidades e interesses.',
      'As alterações ficam disponíveis imediatamente para outras pessoas que abrirem seu perfil.',
    ],
  },
  {
    id: 'contato',
    title: 'Como entrar em contato com a equipe?',
    bullets: [
      'Use a página "Contato" para enviar uma mensagem.',
      'Conte o motivo do contato, sugestões ou problemas que encontrou.',
      'Vamos responder pelo canal indicado quando o contato estiver completo.',
    ],
  },
] satisfies Array<{ id: string; title: string; bullets: string[] }>

export function AjudaContent() {
  const [expanded, setExpanded] = useState<string>('cadastro')

  const faqPairs = useMemo(
    () => [
      [
        'Preciso pagar alguma coisa para usar o Team Link?',
        'Não. O Team Link é gratuito para publicar projetos, participar de equipes e usar todas as funcionalidades atuais.',
      ],
      [
        'Posso sair de um projeto depois de entrar?',
        'Sim. Entre em contato com quem publicou o projeto pelos comentários para combinar a saída.',
      ],
      [
        'Posso encerrar minha sessão neste dispositivo?',
        'Sim. Abra o menu da sua conta no canto superior e selecione "Sair" para encerrar a sessão apenas neste navegador.',
      ],
    ],
    [],
  )

  return (
    <main className="bg-muted/35 pb-20">
      <div className="border-b border-border bg-gradient-to-br from-muted/80 via-background to-background">
        <Container className="space-y-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-primary">Central de ajuda</p>
          <h1 className="text-4xl font-bold md:text-5xl">Como usar o Team Link</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Respostas rápidas para os principais fluxos da plataforma: cadastro, publicação de projetos, participação em equipes e configuração de perfil.
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
                className={`rounded-[1.75rem] border border-card-outline bg-card shadow-md ${opened ? 'ring-2 ring-primary/35' : ''}`}
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

        <aside className="space-y-6 rounded-[1.85rem] border border-card-outline bg-card p-8 shadow-xl">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Perguntas frequentes</h2>
            <p className="text-sm text-muted-foreground">Respostas rápidas para as dúvidas mais comuns sobre o Team Link.</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/65">Pronto para começar</p>
              <h2 className="mt-4 text-3xl font-bold">Que tal publicar a sua próxima ideia?</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="rounded-2xl px-10 font-semibold shadow-lg shadow-white/35">
                <Link href="/explorar">Explorar projetos</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-2xl border-white/55 bg-transparent text-white hover:bg-white/15">
                <Link href="/nova-ideia">Publicar projeto</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </main>
  )
}
