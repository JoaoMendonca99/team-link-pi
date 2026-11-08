import { ProductShowcase, type ShowcaseItem } from './product-showcase'

const features = [
  { id: 'activities', label: 'Atividades', title: 'Responsabilidades claras. Entregas visíveis.', description: 'O Kanban do Controle de Atividades, com suas etapas, filtros, prioridades, prazos e responsáveis. No celular, as etapas ocupam novas linhas.' },
  { id: 'team', label: 'Equipe', title: 'As pessoas certas, com papéis definidos.', description: 'Consulte os integrantes, seus níveis de acesso e os cargos de cada pessoa na equipe do projeto.' },
  { id: 'goals', label: 'Metas', title: 'O próximo passo tem um objetivo.', description: 'O dashboard do Controle de Atividades reúne o progresso das entregas e das metas do período selecionado.' },
  { id: 'messages', label: 'Comunicação', title: 'A conversa continua dentro do projeto.', description: 'Na central de mensagens, a equipe acessa as conversas do projeto e mantém o histórico das decisões no mesmo contexto.' },
  { id: 'documents', label: 'Documentação', title: 'Do trabalho realizado ao documento.', description: 'O assistente real organiza o relatório em cinco etapas: Documento, Informações, Dados, Conteúdo e Finalizar. Revise o documento antes de exportar.' },
  { id: 'integrations', label: 'Integrações', title: 'Mais ferramentas, quando fizer sentido.', description: 'O catálogo do projeto permite à gestão adicionar GitHub e SAC. A conexão de cada integração é configurada na própria ferramenta.' },
] as const satisfies readonly ShowcaseItem[]

export function ProductTour() {
  return <ProductShowcase id="tour" label="Conheça os recursos do Team Link" items={features} />
}
