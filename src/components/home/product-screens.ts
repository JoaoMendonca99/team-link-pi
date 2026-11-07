import panelDesktop from './screens/panel-desktop.webp'
import panelMobile from './screens/panel-mobile.webp'
import spaceDesktop from './screens/space-desktop.webp'
import spaceMobile from './screens/space-mobile.webp'
import activitiesDesktop from './screens/activities-desktop.webp'
import activitiesMobile from './screens/activities-mobile.webp'
import teamDesktop from './screens/team-desktop.webp'
import teamMobile from './screens/team-mobile.webp'
import goalsDesktop from './screens/goals-desktop.webp'
import goalsMobile from './screens/goals-mobile.webp'
import messagesDesktop from './screens/messages-desktop.webp'
import messagesMobile from './screens/messages-mobile.webp'
import documentsDesktop from './screens/documents-desktop.webp'
import documentsMobile from './screens/documents-mobile.webp'
import integrationsDesktop from './screens/integrations-desktop.webp'
import integrationsMobile from './screens/integrations-mobile.webp'

// Captured from the unchanged application at 787c855, using isolated synthetic data.
export const productScreens = {
  panel: { desktop: panelDesktop, mobile: panelMobile, caption: 'Recorte do painel: período, atividades e equipe.', alt: 'Painel real do Projeto Aurora, com resumo de atividades, metas, progresso e integrantes. Dados de demonstração.' },
  space: { desktop: spaceDesktop, mobile: spaceMobile, caption: 'Meu Espaço: dashboard pessoal.', alt: 'Meu Espaço real, com navegação pessoal e contadores de projetos, atividades, candidaturas e revisões. Dados de demonstração.' },
  activities: { desktop: activitiesDesktop, mobile: activitiesMobile, caption: 'Recorte do Kanban da equipe.', alt: 'Kanban real com filtros, etapas, prioridades, prazos e responsáveis. No celular, as etapas aparecem empilhadas. Dados de demonstração.' },
  team: { desktop: teamDesktop, mobile: teamMobile, caption: 'Card de integrantes do painel.', alt: 'Equipe real do painel com quatro integrantes de demonstração: Líder, Gestor, Revisor e Membro, cada um com seu cargo exibido.' },
  goals: { desktop: goalsDesktop, mobile: goalsMobile, caption: 'Dashboard do Controle de Atividades.', alt: 'Dashboard real de atividades e metas do período, com três de oito atividades concluídas, progresso de 38% e barras de progresso das metas. Dados de demonstração.' },
  messages: { desktop: messagesDesktop, mobile: messagesMobile, caption: 'Conversa Geral de um projeto.', alt: 'Interface real de mensagens de projetos, com lista de conversas, histórico, autores e campo de mensagem. A versão mobile mostra a conversa aberta. Conteúdo de demonstração.' },
  documents: { desktop: documentsDesktop, mobile: documentsMobile, caption: 'Assistente de relatório: etapa 1 de 5.', alt: 'Assistente real do Gerador de Relatórios, com as etapas Documento, Informações, Dados, Conteúdo e Finalizar. Relatório acadêmico de demonstração.' },
  integrations: { desktop: integrationsDesktop, mobile: integrationsMobile, caption: 'Catálogo de funcionalidades do projeto.', alt: 'Catálogo real de funcionalidades: Gerador de Relatórios, GitHub, Suporte SAC e Controle de Atividades obrigatório. GitHub e SAC aparecem disponíveis para adicionar.' },
} as const

export type ProductScreen = keyof typeof productScreens
