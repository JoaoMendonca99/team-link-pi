import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowDown, ArrowRight, Check, CheckSquare, FileText, GitBranch, Link2, MessageSquare, Puzzle, Target, Users } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { FeaturedIdeas } from '@/components/ui/featured-ideas'
import { ProjectStart } from '@/components/home/project-start'
import { ProductPreview } from '@/components/home/product-preview'
import { ProductTour } from '@/components/home/product-tour'
import styles from '@/components/home/home.module.css'

export const metadata: Metadata = {
  title: { absolute: 'Team Link — Seu projeto inteiro. Um só lugar.' },
  description: 'Da ideia à entrega, reúna sua equipe, atividades, metas, conversas e documentação em uma única plataforma.',
}

const connections = [
  { label: 'Equipe', icon: Users },
  { label: 'Atividades', icon: CheckSquare },
  { label: 'Conversas', icon: MessageSquare },
  { label: 'Metas', icon: Target },
  { label: 'Documentos', icon: FileText },
]

export default function HomePage() {
  return (
    <main id="topo" className={styles.home}>
      <section aria-labelledby="home-title" className={styles.hero}>
        <Container>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.dot} />Um ambiente de trabalho para o seu projeto</p>
            <h1 id="home-title">Seu projeto inteiro.<br /><span>Um só lugar.</span></h1>
            <p className={styles.heroDescription}>Da ideia à entrega, reúna sua equipe, atividades, metas, conversas e documentação em uma única plataforma.</p>
            <div className={styles.actions}>
              <ProjectStart>Começar um projeto<ArrowRight aria-hidden className="size-4" /></ProjectStart>
              <Button asChild variant="outline" size="lg" className={styles.secondaryAction}><Link href="/explorar">Explorar projetos</Link></Button>
            </div>
            <a href="#como-funciona" className={styles.quietLink}>Conheça o ambiente<ArrowDown aria-hidden className="size-3.5" /></a>
          </div>
          <ProductPreview />
          <p className={styles.heroFootnote}>Pessoas, trabalho e informação conectados ao mesmo projeto.</p>
        </Container>
      </section>

      <section aria-labelledby="fragmentation-title" className={styles.section}>
        <Container>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>Menos dispersão. Mais contexto.</p><h2 id="fragmentation-title">Seu projeto não deveria estar espalhado por vários lugares.</h2></div>
            <p>Uma conversa aqui, um prazo ali, um documento difícil de encontrar. Quando as informações ficam separadas, acompanhar o trabalho exige mais esforço.</p>
          </div>
          <div className={styles.comparison}>
            <div className={styles.fragmented}>
              <p className={styles.diagramLabel}>Sem centralização</p>
              <div className={styles.fragments}>{connections.map(({ label, icon: Icon }, index) => <div key={label} className={styles.fragment}><Icon aria-hidden className="size-4" /><span>{label}</span><span className={styles.fragmentNote}>{['Em um cadastro', 'Em outra ferramenta', 'Em canais separados', 'Em uma planilha', 'Em arquivos dispersos'][index]}</span></div>)}</div>
            </div>
            <div className={styles.connected}>
              <p className={styles.diagramLabel}>Com Team Link</p>
              <div className={styles.connectionRoot}><Link2 aria-hidden className="size-6" /><div><strong>Um projeto. Contexto compartilhado.</strong><span>Um ponto de encontro para o trabalho da equipe.</span></div></div>
              <div className={styles.connectionItems}>{connections.map(({ label, icon: Icon }) => <span key={label}><Icon aria-hidden className="size-4" />{label}<Check aria-hidden className="ml-auto size-3.5" /></span>)}</div>
              <p>Suas ferramentas especializadas continuam tendo espaço. O projeto ganha um lugar para conectar as informações.</p>
            </div>
          </div>
        </Container>
      </section>

      <section id="como-funciona" aria-labelledby="solution-title" className={`${styles.section} ${styles.solution}`}>
        <Container>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>Da organização à entrega</p><h2 id="solution-title">Tudo conectado<br className="hidden sm:block" /> ao mesmo projeto.</h2></div>
            <p>Monte a equipe, distribua responsabilidades e acompanhe a evolução. Cada conversa, entrega e documento encontra seu contexto.</p>
          </div>
          <ProductTour />
        </Container>
      </section>

      <section aria-labelledby="tools-title" className={styles.section}>
        <Container className={styles.toolsLayout}>
          <div>
            <p className={styles.eyebrow}>Configurável por projeto</p>
            <h2 id="tools-title">Seu projeto,<br />suas ferramentas.</h2>
            <p className={styles.bodyCopy}>O Controle de Atividades faz parte de todo projeto. Ative as outras ferramentas conforme o trabalho pedir, mantendo o painel focado no que a equipe precisa.</p>
            <p className={styles.audienceLabel}>Para equipes de diferentes áreas</p>
            <ul className={styles.audiences}>{['Acadêmicos', 'Engenharia', 'Educação', 'Robótica', 'Tecnologia', 'Sustentabilidade', 'Profissionais'].map(area => <li key={area}>{area}</li>)}</ul>
          </div>
          <div className={styles.toolPanel}>
            <div className={styles.toolPanelHeading}><span className={styles.brandMark}><Puzzle aria-hidden className="size-5" /></span><div><strong>Ferramentas do projeto</strong><p>Um painel que acompanha a sua equipe</p></div></div>
            {[
              { icon: CheckSquare, title: 'Controle de Atividades', text: 'Kanban, prazos, metas e responsáveis.', label: 'Padrão' },
              { icon: FileText, title: 'Gerador de Relatórios', text: 'Rascunhos, estrutura e exportação.', label: 'Opcional' },
              { icon: GitBranch, title: 'GitHub', text: 'Consulte a evolução técnica do repositório.', label: 'Opcional' },
              { icon: MessageSquare, title: 'SAC', text: 'Organize solicitações e atendimento.', label: 'Opcional' },
            ].map(({ icon: Icon, title, text, label }) => <div key={title} className={styles.toolRow}><Icon aria-hidden className="size-5" /><div><strong>{title}</strong><p>{text}</p></div><span data-standard={label === 'Padrão'}>{label}</span></div>)}
            <p className={styles.toolNote}>Disponibilidade e acesso conforme as configurações e permissões do projeto.</p>
          </div>
        </Container>
      </section>

      <FeaturedIdeas />

      <section aria-labelledby="start-title" className={styles.finalSection}>
        <Container>
          <div className={styles.finalCall}>
            <span className={styles.finalMark}><Link2 aria-hidden className="size-7" /></span>
            <h2 id="start-title">Pronto para reunir seu projeto em um só lugar?</h2>
            <p>Comece com a sua ideia ou encontre uma equipe para construir junto.</p>
            <div className={styles.actions}><ProjectStart>Criar meu projeto<ArrowRight aria-hidden className="size-4" /></ProjectStart><Button asChild variant="outline" size="lg" className={styles.secondaryAction}><Link href="/explorar">Explorar projetos</Link></Button></div>
          </div>
        </Container>
      </section>
    </main>
  )
}
