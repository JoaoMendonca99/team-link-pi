'use client'

import { useRef, useState } from 'react'
import { Check, CheckSquare, FileText, GitBranch, MessageSquare, Target, Users } from 'lucide-react'
import { DemoBoard } from './product-preview'
import styles from './home.module.css'

const features = [
  { id: 'activities', label: 'Atividades', icon: CheckSquare, title: 'Responsabilidades claras. Entregas visíveis.', description: 'Organize o Kanban com etapas, responsáveis, prioridades, prazos e revisões.' },
  { id: 'team', label: 'Equipe', icon: Users, title: 'As pessoas certas, com papéis definidos.', description: 'Apresente vagas, acompanhe candidaturas e organize as funções e os acessos de cada integrante.' },
  { id: 'goals', label: 'Metas', icon: Target, title: 'O próximo passo tem um objetivo.', description: 'Conecte atividades às metas e acompanhe o progresso de cada período, preservando o histórico.' },
  { id: 'messages', label: 'Comunicação', icon: MessageSquare, title: 'A conversa continua dentro do projeto.', description: 'Mantenha o contexto das decisões nas conversas com a equipe.' },
  { id: 'documents', label: 'Documentação', icon: FileText, title: 'Do trabalho realizado ao documento.', description: 'Organize rascunhos e informações do projeto no Gerador de Relatórios e exporte para revisão.' },
  { id: 'integrations', label: 'Integrações', icon: GitBranch, title: 'Mais ferramentas, quando fizer sentido.', description: 'Ative GitHub e SAC conforme a necessidade do projeto e as permissões da equipe.' },
] as const

function FeatureContent({ id }: { id: typeof features[number]['id'] }) {
  if (id === 'activities') return <DemoBoard />
  if (id === 'team') return <div className={styles.demoPeople}>{[{ initials: 'AL', name: 'Ana Lima', role: 'Líder', job: 'Coordenação' }, { initials: 'BC', name: 'Bruno Costa', role: 'Gestor', job: 'Desenvolvimento' }, { initials: 'CS', name: 'Carla Souza', role: 'Revisor', job: 'Pesquisa e validação' }].map(person => <div key={person.initials}><span className={styles.personInitial}>{person.initials}</span><div><strong>{person.name}</strong><p>{person.job}</p></div><span className={styles.periodBadge}>{person.role}</span></div>)}</div>
  if (id === 'goals') return <div className={styles.demoGoals}><div><Target aria-hidden className="size-6" /><strong>Apresentar o protótipo</strong><span className={styles.periodBadge}>Período atual</span></div><p>As atividades dão contexto ao progresso da meta.</p><ol>{['Definir o escopo', 'Construir o protótipo', 'Validar os resultados'].map((step, index) => <li key={step}><span>{index === 0 ? <Check aria-hidden className="size-4" /> : `0${index + 1}`}</span><strong>{step}</strong><span>{index === 0 ? 'Concluído' : index === 1 ? 'Em andamento' : 'A fazer'}</span></li>)}</ol></div>
  if (id === 'messages') return <div className={styles.demoConversation}><p>Projeto Aurora <span>· Conversa da equipe</span></p><div><span className={styles.personInitial}>AL</span><div><strong>Ana Lima</strong><p>Podemos revisar o protótipo na próxima reunião?</p></div></div><div><span className={styles.personInitial}>CS</span><div><strong>Carla Souza</strong><p>Sim! Vou reunir os resultados na atividade de validação.</p></div></div><p className={styles.demoContext}><MessageSquare aria-hidden className="size-4" />Decisões e trabalho com o mesmo contexto.</p></div>
  if (id === 'documents') return <div className={styles.demoDocuments}><div><FileText aria-hidden className="size-8" /><div><strong>Relatório do projeto</strong><p>Projeto Aurora · Período atual</p></div><span className={styles.periodBadge}>Rascunho</span></div><ol>{['Objetivos e justificativa', 'Desenvolvimento do projeto', 'Resultados e referências'].map((text, i) => <li key={text}><span>0{i + 1}</span>{text}<span className={styles.documentLine} /></li>)}</ol><p>Estruture, revise e exporte. A adequação às normas e exigências da instituição faz parte da revisão da equipe.</p></div>
  return <div className={styles.demoIntegrations}>{[{ icon: GitBranch, title: 'GitHub', text: 'Repositório e evolução técnica ligados ao projeto.' }, { icon: MessageSquare, title: 'SAC', text: 'Solicitações e atendimento no contexto da equipe.' }].map(({ icon: Icon, title, text }) => <div key={title}><Icon aria-hidden className="size-6" /><div><strong>{title}</strong><p>{text}</p></div><span className={styles.periodBadge}>Opcional</span></div>)}<p>Ferramentas ativadas pela gestão, com acesso conforme o papel de cada integrante.</p></div>
}

export function ProductTour() {
  const [selected, setSelected] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  return <div className={styles.tour}>
    <div role="tablist" aria-label="Conheça os recursos do Team Link" className={styles.tourTabs} onKeyDown={event => {
      const destination = event.key === 'ArrowRight' ? (selected + 1) % features.length : event.key === 'ArrowLeft' ? (selected + features.length - 1) % features.length : event.key === 'Home' ? 0 : event.key === 'End' ? features.length - 1 : null
      if (destination !== null) { event.preventDefault(); setSelected(destination); tabs.current[destination]?.focus() }
    }}>{features.map(({ id, label, icon: Icon }, index) => <button key={id} ref={element => { tabs.current[index] = element }} type="button" role="tab" id={`tour-tab-${id}`} aria-controls={`tour-panel-${id}`} aria-selected={index === selected} tabIndex={index === selected ? 0 : -1} onClick={() => setSelected(index)}><Icon aria-hidden className="size-4" />{label}</button>)}</div>
    {features.map((feature, index) => <div key={feature.id} role="tabpanel" id={`tour-panel-${feature.id}`} aria-labelledby={`tour-tab-${feature.id}`} hidden={selected !== index} tabIndex={0} className={styles.tourPanel}>
      <div className={styles.tourIntro}><div><h3>{feature.title}</h3><p>{feature.description}</p></div><span>Demonstração · dados ilustrativos</span></div>
      <div className={styles.tourContent}><FeatureContent id={feature.id} /></div>
    </div>)}
  </div>
}
