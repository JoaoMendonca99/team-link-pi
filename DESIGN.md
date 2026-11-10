# Team Link — proposta de sistema visual

Status: **referência operacional aplicada no Prompt 41, com exceções registradas ao final**. Data: 10/11/2026. Origem: [auditoria integrada](AUDITORIA-UI.md). A proposta original é preservada como histórico; a seção de implementação ao final distingue o que foi aplicado.

## Direção

Preservar fundo escuro, azul da marca, superfícies em cards, cantos arredondados, sidebar e interface compacta de produtividade. Refinar hierarquia, medidas e estados. Uma tela operacional deve ajudar a localizar tarefa, prazo, responsável e próxima ação; não seguir composição de landing page com seção por viewport, fotos ou movimento obrigatório.

A produção e o código local divergem. Os tokens abaixo descrevem valores encontrados no checkout e propostas para reconciliação com a revisão publicada. Não aplicar substituições globais sem verificar os usos.

## Existente versus proposto

| Elemento | Encontrado | Proposta |
|---|---|---|
| Família tipográfica | Inter carregada no layout local | Manter Inter; não adicionar família por tela |
| Fundo escuro | `#0b1120` | Manter |
| Card escuro | `#111827` | Manter como superfície principal |
| Primário | `#2563eb`, usado em botão e texto | Manter preenchimento de botão; separar link textual no escuro |
| Texto | `#f8fafc`, secundário `#94a3b8` | Manter, verificando composição/opacidade |
| Largura de site | Container `max-w-7xl` (1280px) | Manter nas páginas públicas; workspace com largura fluida |
| Outras larguras | narrow 896px, article 768px | Dar papéis explícitos a formulário/leitura; reduzir linhas longas |
| Cantos | Tokens base, md, 2xl, 3xl e valores arbitrários | Escala curta por família, sem apagar diferenças funcionais |
| Alturas de controle | Botões 32/36/40px; pesquisa até 48px | Compacto desktop 36px; confortável 44px; busca 44–48px |
| Espaçamento | Muitas utilities, sem contrato por papel | Escala de 4px e receitas de página/componente |

## Cores e contraste

| Papel | Valor proposto no escuro | Observação |
|---|---|---|
| Canvas | `#0b1120` | Fundo de página |
| Surface | `#111827` | Cards, formulários, painéis |
| Surface elevada | `#1e293b` | Menus e estados discretos; limitar áreas sobrepostas |
| Texto principal | `#f8fafc` | Títulos e informação essencial |
| Texto secundário | `#94a3b8` | Descrição e metadados; não reduzir por opacidade sem medir |
| Botão primário | `#2563eb` com branco | Preservar azul da marca |
| Link no escuro | `#60a5fa` como candidato | Validar em superfícies e estados; substituir o uso de azul de botão como texto pequeno |
| Foco | `#60a5fa` | Anel perceptível e afastado da borda |
| Borda normal | `#1e293b` ou token atual | Separador discreto; controle essencial pode exigir borda mais perceptível |
| Êxito/atenção/erro | Tokens semânticos existentes | Sempre texto/ícone além de cor; medir contraste em cada fundo |

O caso medido na produção, `#2563eb` sobre `#0b1120`, dá aproximadamente 3,64:1. Por isso, o link precisa de papel próprio. Não clarear o preenchimento de todos os botões como efeito colateral.

Critérios: texto normal pelo menos 4,5:1, texto grande 3:1; indicadores e limites essenciais de controles pelo menos 3:1 onde aplicável. Estados disabled têm tratamento próprio e não servem como justificativa para reduzir legibilidade de controles ativos. A proposta não certifica todas as combinações nem muda automaticamente o tema claro. Manter os tons secundários e o acento laranja observado na home até decisão explícita sobre seu papel.

## Tipografia

| Papel | Tamanho/entrelinha sugeridos | Peso |
|---|---|---|
| H1 operacional desktop | 30–32 / 38px | 650–700 |
| H1 operacional mobile | 24–28 / 32–36px | 650–700 |
| H2 de seção | 20–24 / 28–32px | 600–700 |
| H3 de card | 16–18 / 24–26px | 600 |
| Texto principal | 14–16 / 21–24px | 400–500 |
| Label e ação | 14 / 20px | 500–600 |
| Metadado | 12–13 / 18–20px | 400–500 |
| Microtexto | 11–12px, uso excepcional | Sem informação essencial exclusiva |

Manter texto de input em 16px no mobile quando necessário para legibilidade e comportamento do navegador. Usar números tabulares em métricas. Mono apenas para código/identificadores, sem transformar títulos do produto em terminal. Bio e descrições extensas devem ter largura de leitura de aproximadamente 60–75 caracteres. Uppercase com tracking aberto fica reservado a pequenos rótulos; não usar em parágrafos ou longas instruções.

Um título principal que identifica a tarefa; painéis auxiliares recebem nível secundário. Escolher nível semântico pelo documento, não pelo tamanho visual. Definir hierarquia também para drawers e modais.

## Espaçamento e dimensões

Escala proposta: **4, 8, 12, 16, 20, 24, 32, 40, 48, 64px**. Evitar novos valores arbitrários sem necessidade demonstrada.

| Relação | Medida inicial |
|---|---|
| Ícone + texto | 8px |
| Label + campo | 8px |
| Campo + ajuda/erro | 4–8px |
| Campos do mesmo grupo | 16–20px |
| Padding card mobile/desktop | 16 / 20–24px |
| Gap de cards | 16 / 24px |
| Título + descrição | 8px |
| Cabeçalho + primeira seção | 24–32px |
| Seções operacionais | 24–32px |
| Gutters de página mobile/tablet/desktop | 16 / 24 / 32px |
| Seções promocionais desktop | 48–80px conforme conteúdo, não viewport obrigatória |

Um único responsável pelo padding vertical entre wrappers; não somar padding grande de section e Container sem intenção. Títulos, filtros e resultados compartilham as bordas do conteúdo.

## Layouts e navegação

- Páginas públicas: largura máxima de 1280px; formulários de uma coluna entre 560–720px; leitura longa até cerca de 768px. São papéis propostos, não obrigação de alargar AuthCard.
- Workspace: sidebar expandida por volta de 240px; conteúdo com padding 24–32px; opcionalmente limitar conteúdo de leitura sem limitar Kanban/listas de trabalho.
- Breakpoints orientativos: mobile abaixo de 640px, intermediário 640–1023px, desktop a partir de 1024px. O conteúdo deve decidir quando empilhar, evitando saltos abruptos por medidas fixas.
- Sidebar: estado ativo com fundo, ícone/texto e `aria-current` quando aplicável; submenu com expansão identificada. No mobile, drawer com nome, foco contido, Escape, fundo inerte e retorno ao gatilho.
- Breadcrumbs preservam contexto com ellipsis em segmentos intermediários; não truncar a tarefa atual sem alternativa legível.
- Filtros e abas relevantes devem ter estado compartilhável na URL; reaproveitar suporte já existente na produção em vez de reinventar.
- Estados de histórico, ativos e pendentes devem informar o que está sendo filtrado, com contagem e caminho de retorno.

## Cards, métricas e densidade

Proposta de raio: controles 8–12px, cards 16px, painéis/overlays 20–24px, pill apenas para tags/estados. Validar lado a lado com a identidade existente antes de migrar raios de toda a aplicação.

Card de projeto: categoria/estado, título, resumo limitado, tags limitadas e rodapé previsível. Não multiplicar contornos com o mesmo peso em cada subgrupo. Alinhar rodapés na mesma linha quando favorecer comparação, mas não esticar painéis independentes até a altura do vizinho.

Dashboard mobile: experimentar métricas 2 × 2 com rótulos que caibam; ação urgente em seguida. A mesma atividade pode aparecer em atenção e lista, mas a segunda apresentação deve ser compacta e não exigir releitura integral do mesmo contexto.

Kanban: manter contagem e estado explícitos. No mobile, preferir alternância por etapa ou lista agrupada; no tablet, comparar duas colunas com leitura confortável. Scroll interno precisa de indicação e teste com toque/teclado. Etapa vazia não precisa ter a altura de uma etapa com 19 cards. Nenhuma recomendação altera regras de status, revisão ou prazo.

## Botões e campos

Uma ação principal por grupo de tarefa. Secundária com contorno/fundo discreto; ação textual para navegação auxiliar; perigo somente para ação destrutiva. Ícone isolado recebe nome acessível e área de toque adequada.

Desktop pode manter controles compactos de 32–36px em tabelas densas. No toque, preferir 44 × 44px de área interativa, incluindo padding invisível quando apropriado. **44px é meta de conforto; não é o mínimo universal WCAG AA.** Alvos menores exigem avaliação de tamanho, distância e exceções. Links em texto corrido têm contexto diferente de botões isolados.

Labels persistentes acima de selects e inputs; placeholder mostra exemplo, não substitui label. Busca de projetos e busca de vagas podem compartilhar altura, raio e posição do ícone sem perder termos próprios.

Regras de feedback: estado pressionado/hover/foco claros; spinner durante requisição; evitar duplo envio; erro inline ligado por `aria-describedby` e `aria-invalid`; falha de serviço em mensagem global acessível. Preservar valores preenchidos. Não afirmar recebimento/salvamento antes da confirmação real.

## Formulários e edição

Cadastro mobile: tarefa primeiro, breve orientação e progresso; instruções complementares podem vir depois. Não criar conta ou revelar segundo passo só para capturar auditoria.

Criação de projeto: preservar assistente publicado e sua seleção de tipo. Reavaliar o espaço antes das opções, títulos repetidos e acesso ao próximo passo. Não substituir pelo formulário monolítico do checkout antigo.

Editor: agrupar informações, vagas e publicação com navegação por seção; textos longos podem ter resumo expansível. Salvar/cancelar devem ser fáceis de encontrar; barra fixa só com reserva de espaço e sem conflito com chat/teclado. Proteger alterações não salvas com aviso proporcional ao risco.

Contato: formulário próximo do título, tópicos auxiliares resumidos. Demonstrar explicitamente quando não houver envio real, antes de coletar texto do usuário. Não propor conexão de e-mail/backend sem autorização da etapa de implementação.

## Modais, drawers e chat

Diálogo compartilhado com título associado, descrição quando útil, foco inicial, contenção do Tab, Escape, restauração do foco e fundo inerte. A implementação de detalhe de atividade observada é referência positiva de foco/Escape; modal de grupos precisa atingir comportamento equivalente.

Largura máxima por tarefa: confirmação ~400–480px, formulário simples ~560–640px, detalhe complexo conforme conteúdo e viewport. Margens externas de pelo menos 16px, altura máxima respeitando viewport dinâmica, conteúdo rolável e ações alcançáveis. Drawer mobile pode usar quase toda a tela com fechamento sempre acessível. Não congelar ações por causa da própria rolagem do corpo.

Chat: preservar composer e cabeçalho enquanto mensagens rolam; manter busca e retorno claros; grupos Geral e de atividades com tipo identificável; nomear todos os controles. Falha no envio deve preservar rascunho/anexo e oferecer nova tentativa, sem duplicar envio. Esse comportamento precisa ser testado com dados de teste, pois a auditoria não enviou mensagens.

Launcher: reservar área inferior/lateral no shell e afastar das ações de página. Coordenar com modais, drawers, safe-area e teclado virtual. Em evidências, ocultar texto privado das conversas sem confundir máscara com estado da interface.

## Estados, linguagem e acessibilidade

| Estado | Contrato proposto |
|---|---|
| Carregamento | Shell estável e skeleton próximo ao conteúdo, status acessível |
| Vazio inicial | Explicar o que pertence à área e oferecer próxima ação pertinente |
| Filtro vazio | Explicar filtro ativo e oferecer limpar/ajustar |
| Erro | Dizer o que falhou e como tentar novamente; preservar trabalho |
| Sucesso | Somente após confirmação real; anúncio assistivo proporcional |
| Desabilitado | Razão compreensível; não usar somente baixa opacidade |
| Conteúdo longo | Quebra/truncamento deliberado e acesso ao texto completo |
| Conectividade limitada | Não prometer salvamento; permitir recuperação do rascunho quando aplicável |

Manter português brasileiro consistente. Preferir “Criar projeto” no fluxo operacional e escolher conscientemente onde “Nova ideia” representa uma entidade distinta. Dispositivos devem mostrar navegador/sistema em linguagem humana; detalhes de user agent ficam expansíveis. PDF, ZIP e biblioteca devem corresponder ao que a ferramenta realmente oferece no próximo passo.

Incluir link de pular para conteúdo, landmarks e ordem de títulos. Não depender de cor para estado, hover para ação ou gesto de arrastar sem alternativa. Foco não pode ser ocultado pelo chat/header. Validar zoom e reflow, labels, contraste e nomes na árvore acessível da revisão correta.

## Movimento e acabamento

Transições de 120–200ms para cor, opacidade e transformações discretas, sem `transition-all` por padrão. Nenhuma entrada obrigatória, scroll-jacking, animação contínua ou shader em telas operacionais. Preferência de movimento reduzido deve alcançar CSS e Framer Motion. Sombras fortes ficam para overlays; cards comuns usam borda/fundo com elevação discreta.

## Revisão antes de oficializar

Validar uma amostra representativa: dashboard, catálogo, Kanban, editor, modal de grupo e mensagens em desktop/mobile; Kanban em tablet. Conferir pares de cores, foco/Escape/Tab, alvos de toque, nome dos controles e sobreposição do launcher. Alterações significativas de estrutura e cor devem ser aprovadas com comparação antes/depois.

Base metodológica: biblioteca local UI UX Pro Max (produtividade e colaboração, foco, tipografia), critérios seguros do Taste, 13 dimensões da UXUI Audit e [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Resultados de paleta clara e orientações Next 16.2 que não correspondem ao Team Link foram descartados; não há troca de fonte ou stack recomendada.


## Implementação aplicada — Prompt 41

A autorização do Prompt 41 tornou esta direção uma referência operacional para os componentes ajustados. Abaixo estão os contratos efetivamente aplicados; os demais números sugeridos acima continuam sendo orientações, não uma migração automática de todo componente legado.

- **Links:** token `--link`, `#1d4ed8` no claro e `#60a5fa` no escuro; o primário de preenchimento permanece `#2563eb`. Links existentes com texto primário e hover recebem a cor legível no escuro. Não houve alteração dos tokens escuros anteriores ou da geometria da home.
- **Controles:** Button padrão 44px no mobile/36px no desktop, small 44/32px, large 44px, icon 44/36px; metas mínimas de toque nos botões em pointer coarse. Input/Select 44/36px; pesquisas e grade de filtros 44–48px. Raios padrão de controle em torno de 8–10px. Overrides de contexto permanecem onde o espaço exige.
- **Superfícies:** FormSection/card operacional com borda/fundo e padding 16/24px; ProjectCard sem altura forçada e hover discreto de borda/transformação. Overlays mantêm elevação e raios maiores. Tags continuam pills. Não houve substituição indiscriminada de todos os raios antigos.
- **Espaço:** grade compartilhada de filtros com gap 16px, rótulos a 8px e campos com largura integral; painéis independentes alinhados ao topo. Foram reutilizadas as utilities da escala de 4px existente, sem motor de layout novo.
- **Diálogos:** AccessibleDialog nativo compartilhado inaugurado em Novo grupo, com inércia de fundo, foco contido/restaurado, Escape/clique fora e lock de scroll compartilhado. Diálogos existentes já adequados foram preservados.
- **Chat:** launcher no header para mobile/tablet; desktop em portal no body, afastado por faixa condicional de 80px e reserva inferior. Espaço mantido enquanto o painel abre; ocultação em modais/drawers. A janela mantém cálculo existente por visualViewport. Nenhuma grande faixa permanente é adicionada quando o chat não existe.
- **Trabalho:** métricas 2×2 no mobile; atenção antes de onboarding; Kanban por container queries, uma etapa selecionável no mobile e duas/quatro conforme largura real; lista pessoal recolhível, vazios compactos. Menus de movimentação e drag originais preservados.
- **Conteúdo:** cadastro prioriza campos no mobile; editor agrupado sem desmontar campos; contato explicitamente demonstrativo; dispositivos com resumo legível; bio/tags expansíveis; documentação descreve o próximo passo e seus formatos reais.
- **Carregamento:** skeleton do shell com região lateral enquanto sessão/preferência resolve, header preservado e esqueleto do dashboard quando os dados ainda não chegaram. Não substitui tratamento de erro nem altera autenticação.
- **Movimento:** controles compartilhados com propriedades explícitas/150ms; preferência reduzida propagada ao Framer Motion, aos cards e ao scroll por atalho. Não foram adicionadas animações promocionais. Um controle legado de cor no editor de cargos ainda usa transition-all; foi preservado fora do conjunto operacional ajustado, sem introduzir animação nova.

**Exceção funcional documentada:** o aviso de rascunho do editor cobre links e beforeunload. Não há bloqueio universal de voltar/avançar na SPA; interceptar o histórico do App Router exigiria uma mudança de navegação mais ampla. UI-010 permanece parcial por esse motivo.

Validação direcionada e limites estão no acompanhamento de AUDITORIA-UI.md. O refinamento preserva Inter, fundo escuro, azul primário, identidade do Team Link, permissões, consultas, sessões, exportações e dados.
