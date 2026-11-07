import { Check, CheckSquare, ChevronRight, FileText, LayoutDashboard, Link2, MessageSquare, Target, Users } from 'lucide-react'
import styles from './home.module.css'

const demoTasks = [
  { stage: 'A fazer', title: 'Planejar a próxima entrega', tag: 'Planejamento', color: 'slate' },
  { stage: 'Em andamento', title: 'Construir o protótipo', tag: 'Desenvolvimento', color: 'blue' },
  { stage: 'Em revisão', title: 'Validar os resultados', tag: 'Validação', color: 'amber' },
  { stage: 'Concluído', title: 'Definir o escopo', tag: 'Planejamento', color: 'teal' },
]

export function DemoBoard() {
  return <>
    <div className={styles.board}>{demoTasks.map((task, index) => <div className={styles.boardColumn} key={task.stage}><p className={styles.stageLabel}><span data-color={task.color} />{task.stage}</p><div className={styles.taskCard}><span className={styles.taskTag}>{task.tag}</span><p>{task.title}</p><div><span className={styles.initial}>{['AL', 'BC', 'CS', 'AL'][index]}</span><span>{index === 3 ? <><Check aria-hidden className="size-3" />Entregue</> : 'Esta semana'}</span></div></div></div>)}</div>
    <ul className={styles.mobileTasks}>{demoTasks.map(task => <li key={task.stage}><span className={styles.stageLabel}><span data-color={task.color} />{task.stage}</span><strong>{task.title}</strong></li>)}</ul>
  </>
}

export function ProductPreview() {
  return <figure className={styles.productFigure}>
    <figcaption className={styles.previewCaption}><span><LayoutDashboard aria-hidden className="size-3.5" />Uma visão do seu ambiente</span><span>Demonstração · dados ilustrativos</span></figcaption>
    <div className={styles.productFrame}>
      <div className={styles.windowBar}><span className={styles.windowDots} aria-hidden><i /><i /><i /></span><span>Team Link<ChevronRight aria-hidden className="size-3" />Projeto Aurora</span><span className={styles.workspaceBadge}>Ambiente do projeto</span></div>
      <div className={styles.previewLayout}>
        <div className={styles.previewSidebar} aria-hidden="true"><span className={styles.previewLogo}><Link2 className="size-5" />Team Link</span><p>PROJETO AURORA</p>{[{ icon: LayoutDashboard, label: 'Visão geral' }, { icon: CheckSquare, label: 'Atividades' }, { icon: Users, label: 'Equipe' }, { icon: MessageSquare, label: 'Conversas' }, { icon: FileText, label: 'Relatórios' }].map(({ icon: Icon, label }) => <span key={label} data-active={label === 'Visão geral'}><Icon className="size-4" />{label}</span>)}<div className={styles.sidebarBottom}>Da ideia à entrega.<br />Com a equipe no mesmo lugar.</div></div>
        <div className={styles.previewMain}>
          <div className={styles.previewHeading}><div><p>VISÃO GERAL</p><h2>Projeto Aurora</h2><span>Uma solução colaborativa para a comunidade.</span></div><span className={styles.periodBadge}>Período atual</span></div>
          <div className={styles.previewStats}><div><CheckSquare aria-hidden /><span>Atividades em foco<strong>4 etapas conectadas</strong></span></div><div><Users aria-hidden /><span>Equipe<strong>Funções e responsáveis</strong></span></div><div><Target aria-hidden /><span>Metas<strong>Evolução por período</strong></span></div></div>
          <div className={styles.previewSectionTitle}><strong>O trabalho em movimento</strong><span>Controle de Atividades</span></div>
          <DemoBoard />
          <div className={styles.previewBottom}><div className={styles.miniGoal}><Target aria-hidden className="size-4" /><div><strong>Meta: apresentar o protótipo</strong><span>Planejar → construir → validar</span></div></div><div className={styles.teamStack}><span className={styles.initial}>AL</span><span className={styles.initial}>BC</span><span className={styles.initial}>CS</span><span>Equipe conectada</span></div></div>
        </div>
      </div>
    </div>
  </figure>
}
