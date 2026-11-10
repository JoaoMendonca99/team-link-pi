# Team Link — auditoria integrada de UI/UX

Data: 10/11/2026. Escopo original: Prompt 40, somente auditoria.

**Acompanhamento:** implementação do Prompt 41 registrada ao final deste arquivo; o diagnóstico original abaixo foi preservado. Proposta complementar: [DESIGN.md](DESIGN.md).

## Resumo executivo

O Team Link tem uma base visual reconhecível: fundo azul muito escuro, superfícies discretamente elevadas, azul nas ações, tipografia sem serifa e navegação lateral previsível. Os principais caminhos de projetos, atividades, vagas, candidaturas, amigos, perfil e mensagens foram acessados com login manual autorizado. Não foi encontrado bloqueio generalizado que justifique P0.

As prioridades são contraste dos links, comportamento de teclado do modal de grupos, espaço reservado ao chat flutuante e honestidade do formulário de contato no código local. A maior oportunidade de design está em reduzir rolagem e repetição no mobile, organizar os filtros e melhorar a densidade das telas de trabalho. Não há justificativa para substituir a identidade visual ou adicionar efeitos decorativos.

**Limite essencial:** produção e checkout local representam implementações diferentes. A produção possui `/meu-espaco`, Kanban, documentação e assistente de criação que não estão implementados nas mesmas rotas deste checkout. A home publicada também difere da local. Portanto, evidência de produção não é automaticamente evidência contra um arquivo local. Antes do Prompt 41, localizar a revisão correspondente ao site publicado. Não foi feito checkout, pull, commit, build ou deploy.

| Prioridade | Quantidade | Interpretação |
|---|---:|---|
| P0 — crítico | 0 | Nenhum impedimento generalizado comprovado |
| P1 — alto | 4 | UI-001, UI-002, UI-004, UI-005 |
| P2 — médio | 16 | UI-003 e UI-006 a UI-020 |
| P3 — baixo | 3 | UI-021 a UI-023; propostas opcionais |
| Total | 23 | Inclui achados locais e propostas, identificados abaixo |

P0/P1/P2/P3 correspondem aproximadamente a S4/S3/S2/S1 da UXUI Audit. A classificação do usuário prevalece. Ausência de P0 não equivale a certificação funcional ou de acessibilidade.

## Segurança das cinco skills

A análise precedeu a execução de scripts especializados. Foram lidos os cinco `SKILL.md`, inspecionados os pontos de entrada, imports, persistência e comandos relevantes. A avaliação é estática e direcionada; não substitui uma revisão integral de todas as dependências nem um novo resultado de Gen/Socket/Snyk. O diagnóstico original desses scanners não estava disponível, apenas as classificações fornecidas no pedido.

### Taste Skill: uso restrito a critérios de design

Instalação: `.agents/skills/design-taste-frontend`, identificação declarada `tasteskill 2.5.1`.

| Comportamento encontrado | Evidência local | Avaliação |
|---|---|---|
| Hook de encerramento executa Node e procura scripts em caminhos de projeto e usuário | `SKILL.md:17` e seguintes | Amplia a superfície de execução automática; pode contribuir para alerta heurístico |
| Inicializa navegador, usa CDP e avalia JavaScript na página | `scripts/consistency.mjs:4620` e chamadas `tab.eval` | Capacidade poderosa, não prova de malware |
| Encerra processos e remove diretórios recursivamente | `consistency.mjs:4632`, `:4635`; `gate.mjs:431–465` | Há proteções de perfil/caminho, mas não foi concedida confiança para limpeza neste trabalho |
| Baixa imagens e SVGs externos | `photos.mjs:667`, `:795`; `icons.mjs:65–72` | Há tráfego a Wikimedia, Picsum e jsDelivr; desnecessário para esta auditoria |
| Preenche e aciona formulários em testes locais | `consistency.mjs:7545–7557`, `:11082–11084` | O código declara interceptação e exclusão de submissão remota; ainda assim não foi executado |
| Escreve relatórios, HTML renderizado, capturas e históricos | `consistency.mjs:10252`, `:11455`; `start.mjs` | Pode registrar dados privados do DOM ou alterar artefatos fora do destino pretendido se mal configurado |

Nas buscas direcionadas não foi identificado um caminho explícito de extração de credenciais ou comando de baixar código remoto e executá-lo no shell. Isso **não comprova ausência** em todo o pacote. Leitura de variáveis como caminhos de navegador e diretórios temporários não é, por si só, extração de segredos. Imports dinâmicos dos assets vistos resolvem módulos relativos ao próprio kit.

**Conclusão:** não é possível atribuir com certeza a causa do “Critical Risk”, nem declarar toda a skill segura. Seus scripts, hook, gate e assets executáveis não foram rodados. Foram aproveitados somente critérios legíveis: alinhamento de bordas, hierarquia, escala tipográfica, famílias de componentes e acabamento. Regras promocionais como seção com altura de uma tela, sorteio de paleta, fotos obrigatórias, restrição de violeta e animações obrigatórias foram descartadas por incompatibilidade com o pedido. Nenhum mecanismo de segurança foi desativado.

### Demais skills

| Skill | Inspeção e limites | Utilização efetiva |
|---|---|---|
| Playwright CLI | Instruções e launcher PowerShell inspecionados; pacote existente `@playwright/cli 0.1.24`, dependências Playwright/Core alpha declaradas no package local. Capacidades de storage e rede existem, mas não foram usadas para extrair sessão | Navegação real, screenshots, snapshots, métricas de DOM, viewports e Escape. Scripts próprios de captura, restritos a leitura/UI. Chrome falhou no sandbox; abertura fora dele passou pela revisão de aprovação. Sem reinstalação |
| Web Design Guidelines | Skill instrucional, sem script local necessário. Documento remoto tratado como referência, não como comandos | Regras atuais consultadas na [fonte da Vercel](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), aplicadas a componentes e formulários; referências por arquivo/linha |
| UI UX Pro Max | `search.py`, imports de `core.py`, `design_system.py` e contrato de regras inspecionados. Busca lê CSVs locais; persistência é opcional. Sem chamadas de rede no caminho usado | Executada com `python -B`, consultas por domínio/stack, sem `--persist`, sem instalar dependências |
| UXUI Audit | `workflow.md`, `dimensions.md`, `report-template.md`, `capture.md` e `scripts/capture.mjs` inspecionados. Capturador importa Playwright, lê config e pode carregar storageState; não foi usado | Método com capturas fornecidas pelo Playwright CLI e análise visual nativa nas 13 dimensões. Sem script de captura separado, exportação de autenticação ou serviço externo de análise de imagens |

Não foram lidos `.env`, cookies, tokens, senhas ou chaves. Login foi feito pelo usuário no navegador. Não houve uso de `storageState`, coleta de headers de autenticação, upload de anexos, geração de documentação ou execução de scripts Taste. Navegar em produção pode acionar presença, telemetria e recibos de leitura da própria aplicação; não se afirma ausência desses efeitos automáticos. Não foram submetidas alterações de projetos, mensagens, grupos, preferências ou banco.

## Método, evidências e cobertura

Produção inspecionada: [Team Link](https://team-link-pi.vercel.app/). Desktop 1440 × 900, mobile 390 × 844; tablet 768 × 1024 para Kanban/detalhe de atividade. A barra vertical de 8px pode produzir imagens com 1432/382px de área útil. Isso não caracteriza overflow.

Capturas em [docs/auditoria-ui-2026-11-10](docs/auditoria-ui-2026-11-10/). Os blocos magenta são máscaras de privacidade, não defeitos visuais. Mensagens e identidade da conta foram ocultadas nas principais evidências privadas. Nomes/avatares públicos e alguns metadados de equipe continuam em capturas: **material local de revisão, não autorizado para publicação**. Snapshots automáticos em `.playwright-cli` também podem conter conteúdo privado; não publicar nem adicionar indiscriminadamente ao Git.

Capturas iniciais transitórias foram substituídas quando necessário. `confirmar-email-*.png` registra redirecionamento ao login, não a confirmação de e-mail. `novo-projeto-desktop.png` registra carregamento; usar `novo-projeto-mobile.png` para o assistente pronto. O fim de `medidas-espaco.txt` contém duas linhas de mensagens com URL do painel por interferência entre comandos: essas duas linhas foram descartadas da análise; mensagens foi recapturada e confirmada em `medidas-estados.txt`. Não interpretar screenshots durante animação de scroll/foco como defeito de posição do header.

### Mapa de superfícies

| Área/rota publicada | O que foi observado | Evidência/limite |
|---|---|---|
| `/` | Hero, demonstração e seções da home, desktop/mobile | `inicio-*.png`; partes demonstrativas fora da viewport podem depender de lazy loading |
| `/login` | Formulário e modo de recuperação em contexto anônimo separado | `login-mobile.png`, `recuperacao-mobile.png`; nenhum e-mail enviado |
| `/cadastro` | Etapa inicial, instruções, campos, progresso | `cadastro-*.png`; conta não criada |
| `/cadastro/confirmar-email` | Redirecionamento ao login sem callback válido | Estado de confirmação real não testado |
| `/explorar` | Catálogo com seis projetos e filtros | `explorar-*.png` |
| `/sobre`, `/ajuda`, `/contato` | Conteúdo, cards, FAQ, formulário de contato | Capturas desktop/mobile; contato não enviado |
| `/projetos/site-team-link` | Página pública, descrição, equipe, vagas, comentários e ações do gestor | `projeto-publico-*.png`; nenhuma curtida/comentário enviado |
| `/usuarios/[id]` | Perfil público da conta autorizada, formação, tags e projetos | `perfil-publico-*.png`, após aguardar dados |
| `/meu-espaco` | Dashboard populado, contadores, atenção, projetos, atividades, vagas | `dashboard-*.png` |
| `/meu-espaco/projetos` | Projeto ativo, busca, histórico disponível, atalhos | `projetos-*.png`; histórico populado não exercitado |
| `/meu-espaco/atividades` | Indicadores, filtros, lista agrupada, atraso e checklist resumido | `atividades-*.png` |
| `/meu-espaco/candidaturas` | Duas candidaturas canceladas, status e ações | `candidaturas-*.png`; sem mudar decisão |
| `/meu-espaco/vagas` | Busca, categoria, habilidade, ordenação e três oportunidades | `vagas-*.png` |
| `/meu-espaco/amigos` | Lista com seis amigos, solicitações e ações | `amigos-*.png`; sem enviar/remover amizade |
| `/meu-espaco/perfil` | Formação, bio, métricas, tags, abas e projetos | `perfil-*.png` |
| `/meu-espaco/configuracoes` | Aparência, onboarding, notificações, dispositivos, privacidade e conta | `configuracoes-*.png`; preferências não modificadas |
| `/meu-espaco/mensagens` | Lista, seleção de projeto, Geral, discussões de atividades, composer | `mensagens-*.png`, `grupo-geral-mobile.png`; texto privado mascarado |
| Widget | Aberto/fechado, busca, lista e acesso à central | `widget-*.png`; não foi criada conversa nem grupo |
| Modal “Novo grupo” | Campos, seleção de membros, cancelamento e teste de Escape/foco | `modal-grupo-mobile.png`; nenhuma criação |
| `/projetos/site-team-link/painel` | Resumo, donut, metas, progresso, equipe/hierarquia e ferramentas | `painel-*.png` |
| `…/painel/atividades` | Kanban com 41 atividades, metas, filtros, seletores e painel pessoal | `painel-atividades-*.png`, `atividades-tablet.png` |
| Detalhe de atividade | Descrição, responsáveis, revisor, checklist, histórico disponível, Discussão e anexo | `atividade-detalhe-tablet.png` + snapshot ao vivo; sem alterar checklist, enviar revisão ou anexar |
| `…/painel/candidaturas` | Vagas, abas de decisão e estado vazio | `painel-candidaturas-*.png` |
| `…/painel/relatorios` | Documentação com IA e biblioteca anterior vazia expandida | `documentacao-*.png`; PDF/ZIP não gerados |
| `/nova-ideia` | Primeiro passo do assistente, tipo acadêmico/profissional e progresso | `novo-projeto-mobile.png`; passos posteriores não preenchidos |
| `/projetos/site-team-link/editar` | Formulário longo populado com vagas e configuração de publicação | `editar-projeto-*.png`; nenhuma gravação |
| Sidebar/menus/notificações | Sidebar aberta, submenu de projetos e adaptação mobile; acionamento do sino | Capturas de dashboard/painel e snapshots; conteúdo populado do sino não confirmado |

Limites adicionais: não houve inspeção visual interna de GitHub/SAC/configuração de integrações, de todos os modais de gestão de integrantes, biblioteca com documentos, revisão pendente, anexos enviados, conversa individual aberta e grupo personalizado existente. Estados de erro de rede, upload, aprovação/recusa, exclusão, publicação e teclado virtual real não foram induzidos. Isso evita mutações ou exposição desnecessária em produção. A cobertura é abrangente das áreas principais, mas **não é validação de todos os estados existentes**.

### Rotas existentes apenas no inventário local

Foram mapeados os 18 `page.tsx`: `/`, `/login`, `/cadastro`, `/cadastro/confirmar-email`, `/explorar`, `/sobre`, `/ajuda`, `/contato`, `/perfil`, `/perfil/editar`, `/meus-projetos`, `/mensagens`, `/nova-ideia`, `/usuarios/[id]`, `/projetos/[id]`, `/projetos/[id]/editar`, `/projetos/[id]/painel`, `/github/setup`. Há também telas `not-found`. A revisão de código foi direcionada aos shells, tokens, controles comuns, autenticação, filtros, cards, criação/edição, mensagens e modais. Não foi uma leitura integral de todas as linhas do repositório.

## Pontos fortes a preservar

- Cards e listas refluem sem overflow horizontal de documento nas medições prontas do Meu Espaço e painel. Scroll interno não é medido por esse indicador.
- Sidebar organiza Principal, Conexões e Conta; projeto ativo tem contexto e submenu.
- Estados de atividade combinam texto, números e cor. Atraso não depende somente do vermelho.
- Detalhe de atividade abre com foco no fechamento e fecha com Escape; não generalizar o defeito do modal de grupos a todos os diálogos.
- Discussão da atividade usa log nomeado, composer identificado, limite de anexos e indicação de Enter.
- Cadastro possui progresso e mensagens auxiliares; criação de projeto publicada usa etapas.
- Perfis têm formação, bio, habilidades e projetos bem agrupados. Documentação explica o papel da IA e a exportação autorizada.

## Achados priorizados

Legenda: **V** = visual; **D** = DOM/interação real; **C** = código local; **E** = proposta estética/organizacional. Complexidade: B baixa, M média, A alta. Achados C não afirmam que produção tem a mesma implementação. Para V, os nomes de captura abaixo são relativos à pasta de evidências.

### UI-001 — P1 · Contraste insuficiente dos links pequenos [D, comprovado]

- **Área/dimensão:** breadcrumbs e voltar ao painel; acessibilidade. Evidência: `documentacao-desktop.png`, `medidas-estados.txt`.
- **Diagnóstico:** DOM retornou `rgb(37,99,235)` sobre `rgb(11,17,32)` em textos de 12–14px: contraste sRGB **3,643:1**, abaixo de 4,5:1 para texto normal. Não inferido apenas da captura.
- **Método:** Playwright + Web Design Guidelines + UXUI Audit. Relação local: `src/app/globals.css:99` mantém `--primary: #2563eb` no escuro; confirmar revisão antes de editar.
- **Recomendação/benefício:** separar azul de superfície de botão do azul de texto; usar tom mais claro para links no escuro, validando todos os estados. Facilita leitura em toda a plataforma. **Complexidade B/M.**

### UI-002 — P1 · Modal de grupo não administra teclado [D+C, comprovado]

- **Área/dimensão:** Novo grupo; acessibilidade/interação. Evidência: `modal-grupo-mobile.png`; snapshot manteve “Novo grupo” ativo atrás do modal. Depois de Escape: `open:true`, `focusInside:false`.
- **Método:** Playwright, UXUI Audit, Guidelines e UI UX Pro Max. `src/app/(marketing)/mensagens/_components/create-group-modal.tsx:44` só reinicia estado; `:105` declara diálogo modal sem gestão equivalente de foco/Escape.
- **Recomendação/benefício:** foco inicial interno, contenção do Tab, Escape, fundo inerte e restauração de foco. Aplicar um primitivo de diálogo compartilhado, preservando bloqueio durante gravação. Remove dificuldade de uso por teclado. **Complexidade M.**

### UI-004 — P1 · Chat flutuante cobre conteúdo operacional [V, comprovado]

- **Área/dimensão:** perfil, dashboard e listas; responsividade. Evidência: `perfil-desktop.png` mostra launcher sobre “Nova ideia”; `vagas-mobile.png` mostra sobreposição à descrição; `widget-*.png` mostra janela sobre o conteúdo.
- **Método:** Playwright + UXUI Audit. Não se considera defeito o simples fato de uma janela aberta cobrir a página: o problema recorrente é o launcher ocupar a área de controles/conteúdo sem reserva.
- **Recomendação/benefício:** área segura inferior/lateral, afastamento de ações e reposicionamento quando houver drawer/modal. Conferir também foco e teclado virtual. Mantém ações visíveis e utilizáveis. **Complexidade M.**

### UI-005 — P1 · Contato local confirma recebimento sem envio [C, comprovado no checkout]

- **Área/dimensão:** contato; confiança/recuperação. Código: `src/app/(marketing)/contato/contato-content.tsx:76` e final do arquivo. A submissão apenas abre `DemoBanner`, mas a mensagem afirma recebimento e futura resposta.
- **Método:** Guidelines + leitura do handler. `contato-desktop.png` documenta a superfície publicada, **não comprova seu backend**. Não foi submetido formulário em produção.
- **Recomendação/benefício:** no Prompt 41, confirmar implementação publicada; somente confirmar recebimento após resposta real, ou identificar demonstração antes de preencher. Evita perda de solicitações e promessa incorreta. **Complexidade B para copy de demonstração; M para fluxo real.**

### UI-003 — P2 · Controle sem nome no cabeçalho do Geral [D, comprovado]

- **Área/dimensão:** mensagens; acessibilidade. Snapshot do Geral mostrou botão sem nome entre título e “Fechar conversa”; `grupo-geral-mobile.png` preserva composer, com conteúdo privado mascarado.
- **Método:** Playwright/árvore acessível. Arquivo local equivalente não atribuído, pois as implementações diferem.
- **Recomendação/benefício:** nome acessível que descreva a ação e tooltip consistente. Facilita descoberta e leitura assistiva. **Complexidade B.**

### UI-006 — P2 · Cadastro mobile prioriza explicação antes dos campos [V+E]

- **Área/dimensão:** cadastro; jornada/carga cognitiva. `cadastro-mobile.png`: painel de progresso e três caixas antecedem o formulário; este começa perto da primeira dobra. Login já prioriza campos.
- **Método:** UXUI Audit + Taste (hierarquia).
- **Recomendação/benefício:** manter um resumo curto e progresso, colocar campos antes da orientação extensa no mobile. Reduz tempo até iniciar cadastro. Trata-se de melhoria de hierarquia, não falha funcional. **Complexidade B.**

### UI-007 — P2 · Dashboard mobile alonga indicadores e repete atividade [V+E]

- **Área/dimensão:** dashboard; composição. `dashboard-mobile.png`: quatro métricas grandes empilhadas antecedem “Precisa da minha atenção”; a atividade urgente reaparece em “Próximas atividades”. Desktop usa quatro colunas; Minhas atividades já usa duas no mobile.
- **Método:** UXUI Audit + padrões de produtividade do Pro Max.
- **Recomendação/benefício:** grid 2 × 2 quando rótulos couberem e resumo de atenção sem repetir todos os metadados. Aproxima a ação urgente da primeira tela. **Complexidade B/M.**

### UI-008 — P2 · Kanban exige muitas áreas independentes de rolagem [V, organização comprovada; impacto a validar]

- **Área/dimensão:** atividades; responsividade/interação. `painel-atividades-desktop.png`, `painel-atividades-mobile.png`, `atividades-tablet.png`: colunas limitadas em altura, várias listas e painel “Minhas atividades”; lista vazia de revisão mantém grande área no desktop.
- **Método:** Playwright + UXUI Audit. Não foi arrastada nenhuma atividade.
- **Recomendação/benefício:** oferecer lista ou uma etapa por vez no mobile; sinalizar scroll interno e contagens, reduzir altura de coluna vazia, deixar visão pessoal recolhível. Menos competição entre scroll da página e listas. **Complexidade M/A.**

### UI-009 — P2 · Filtros não compartilham largura e agrupamento [V, comprovado]

- **Área/dimensão:** atividades, projetos e explorar; consistência. `atividades-mobile.png` e `projetos-mobile.png`: alguns selects ocupam só parte da linha; em `vagas-mobile.png` os campos têm largura integral.
- **Método:** UXUI Audit + Taste + Guidelines.
- **Recomendação/benefício:** mesma grade de filtros, rótulos persistentes, controles alinhados e “Filtros” recolhível no mobile com resumo de ativos. Melhora varredura e preserva espaço para resultados. **Complexidade M.**

### UI-010 — P2 · Editor de projeto concentra texto longo e vagas na mesma página [V+E]

- **Área/dimensão:** editar projeto; carga cognitiva. `editar-projeto-mobile.png` tem mais de 10 mil pixels de altura no conjunto observado, com descrição longa e blocos de vagas entre os campos iniciais e publicação.
- **Método:** UXUI Audit + padrões SaaS/colaboração do Pro Max. Tamanho de página sozinho não constitui erro.
- **Recomendação/benefício:** separar seções “Informações”, “Vagas” e “Publicação”, resumo de alterações e acesso claro a salvar/cancelar. Garantir proteção contra saída com alterações. Reduz navegação repetida. **Complexidade M/A.**

### UI-011 — P2 · Dispositivos exibem user agent técnico [V, comprovado]

- **Área/dimensão:** configurações; linguagem. `configuracoes-mobile.png` e desktop: textos `Mozilla/5.0…AppleWebKit…` quebram em muitas linhas ao lado de “Remover dispositivo”.
- **Método:** UXUI Audit (conteúdo/carga cognitiva).
- **Recomendação/benefício:** nome legível como navegador + sistema, identificação do dispositivo atual e detalhes técnicos expansíveis. Facilita reconhecer qual dispositivo remover. **Complexidade M.**

### UI-012 — P2 · Estados vazios de candidaturas têm pouca orientação [V+E]

- **Área/dimensão:** painel de vagas/candidaturas; estados. `painel-candidaturas-mobile.png`: “Nenhuma candidatura neste filtro” sem contextualizar próximo passo; área de vagas tem criação, mas não explica relação com candidaturas.
- **Método:** UXUI Audit.
- **Recomendação/benefício:** distinguir filtro sem resultados de ausência de candidaturas, explicar como divulgar vaga e permitir limpar filtro. Evita dúvidas sem criar alertas artificiais. **Complexidade B.**

### UI-013 — P2 · Alturas iguais ampliam vazios em cards com pouco conteúdo [V+E]

- **Área/dimensão:** catálogo e dashboard; composição. `explorar-desktop.png`: card curto de Drone possui grande vazio até o rodapé; `dashboard-desktop.png`: Projetos recentes acompanha a altura da lista vizinha muito maior.
- **Método:** UXUI Audit + Taste. Alturas iguais têm benefício de alinhamento e não devem ser removidas indiscriminadamente.
- **Recomendação/benefício:** limitar resumo/tags e avaliar linhas de cards mais compactas; usar alinhamento pelo topo para painéis independentes. Melhora densidade preservando leitura comparativa. **Complexidade B/M.**

### UI-014 — P2 · Filtros locais carecem de rótulos persistentes específicos [C, comprovado]

- **Área/dimensão:** explorar; acessibilidade. `src/components/team-link/search-and-filters.tsx:69`, `:85`, `:101`, `:117`: triggers sem label/aria-label específica; valor selecionado não esclarece sempre qual dimensão é filtrada.
- **Método:** Guidelines + código. Pesquisa tem aria-label e deve ser preservada.
- **Recomendação/benefício:** associar Categoria, Status, Habilidade e Ordenação, mantendo o nome após seleção. Conferir árvore acessível no código publicado correspondente. **Complexidade B.**

### UI-015 — P2 · Autenticação possui dois títulos principais [C+D, comprovado]

- **Área/dimensão:** login; semântica/hierarquia. `src/components/team-link/auth-card.tsx:31` emite h1 e `src/app/(marketing)/login/login-client.tsx:96` também. Snapshot inicial e recuperação mostram dois títulos principais; `login-mobile.png` ilustra os dois painéis.
- **Método:** Guidelines + Playwright. Múltiplos h1 não são, isoladamente, prova de falha WCAG.
- **Recomendação/benefício:** título principal para a tarefa; chamada auxiliar em nível apropriado ou texto destacado. Facilita orientação por títulos e reduz competição. **Complexidade B.**

### UI-016 — P2 · Validação local do login é global e incompleta [C, comprovado]

- **Área/dimensão:** login; formulários/erros. `login-client.tsx:49–57` verifica presença, mas usa `noValidate` em `:119`; erros ficam em bloco global `:147`, sem associação aos campos nem foco no primeiro inválido.
- **Método:** Guidelines + código. Não foi feito login inválido em produção.
- **Recomendação/benefício:** validar formato de e-mail, vincular erro ao campo e mover foco quando adequado, preservando mensagem global para falha do serviço. Ajuda correção rápida. **Complexidade B/M.**

### UI-017 — P2 · Contato coloca orientação extensa antes da tarefa [V+C+E]

- **Área/dimensão:** contato; espaçamento/jornada. `contato-mobile.png`: formulário aparece após extensa introdução. Código local `contato-content.tsx:36–37` combina padding vertical do wrapper e do Container.
- **Método:** UXUI Audit + Taste + inspeção local; produção não é presumida idêntica.
- **Recomendação/benefício:** reduzir padding acumulado, aproximar formulário e tornar tópicos auxiliares compactos. Reduz rolagem sem eliminar orientação. **Complexidade B.**

### UI-018 — P2 · Primitivos não governam todos os raios e alturas [C+V, comprovado; proposta de consolidação]

- **Área/dimensão:** botões, cards, filtros e formulários; consistência. `button.tsx:22–27` usa alturas de 32–40px; `search-and-filters.tsx:61` usa input de 48px; cards usam `rounded-[1.65rem]`, filtros `1.75rem`, AuthCard `rounded-3xl`, controles alternam md/2xl/pill.
- **Método:** Guidelines, Taste e comparação de `explorar-desktop.png`, `login-mobile.png`, `projetos-mobile.png`.
- **Recomendação/benefício:** definir famílias com papéis claros, não tornar tudo idêntico: controle compacto, controle de toque e card/painel. Reduz overrides e aparência arbitrária. **Complexidade M.**

### UI-019 — P2 · Carregamento autenticado troca a estrutura por texto genérico [V+D, comprovado; duração variável]

- **Área/dimensão:** Meu Espaço e páginas com dados; percepção de desempenho. Primeira captura a 900ms exibia só “Carregando Meu Espaço…”; aguardar main e dados produziu dashboard completo. Algumas capturas públicas conservaram “Carregando conta…” no rodapé durante a resolução da sessão.
- **Método:** Playwright + UXUI Audit. Não se concluiu erro persistente nem se mediram LCP/CLS/INP.
- **Recomendação/benefício:** manter shell e skeleton dimensionalmente próximo, status acessível e recuperação em erro real. Evita sensação de tela vazia e salto de contexto. **Complexidade M.**

### UI-020 — P2 · Nome de documentação não antecipa toda a saída [V+E]

- **Área/dimensão:** ferramenta Documentação com IA; arquitetura/conteúdo. `documentacao-desktop.png`: ação “Gerar PDF para IA”, enquanto explicação inclui orientações e pacote ZIP. “Documentos anteriores” é uma biblioteca de legado, não necessariamente a biblioteca do novo fluxo.
- **Método:** UXUI Audit + clareza de ação da Guidelines.
- **Recomendação/benefício:** explicar o que a ação abre/gera e alinhar nomes de PDF, pacote e documentos anteriores ao próximo passo real. Não houve geração para confirmar o comportamento posterior. **Complexidade B/M.**

### UI-021 — P3 · Perfil pode oferecer leitura mais progressiva [E, subjetivo]

- **Área/dimensão:** perfil público e privado; densidade. `perfil-publico-mobile.png` e `perfil-mobile.png` mostram bio, formação e muitas tags antes dos projetos.
- **Método:** UXUI Audit + Taste.
- **Recomendação/benefício:** avaliar bio resumida expansível e limite inicial de interesses, preservando acesso ao conjunto. Não eliminar dados acadêmicos. **Complexidade B.**

### UI-022 — P3 · Consolidar política de movimento dos componentes [C, recomendação preventiva]

- **Área/dimensão:** cards/botões locais; movimento. `project-card.tsx:109` usa `whileHover`/layout do Framer; `button.tsx:8` usa `transition-all`. `globals.css:220` já reduz animações CSS, mas isso não demonstra redução de animações JS.
- **Método:** Guidelines + Taste. Não foi comprovada falha de movimento na versão publicada.
- **Recomendação/benefício:** transições explícitas; verificar preferência reduzida também em animações JS. Feedback curto, sem entrada obrigatória ou efeitos de marketing no ambiente de trabalho. **Complexidade B/M.**

### UI-023 — P3 · Reduzir competição decorativa em superfícies operacionais [E, subjetivo]

- **Área/dimensão:** cards, botões e painéis; acabamento. `explorar-desktop.png`, `perfil-desktop.png`, `painel-mobile.png`: bordas, fundos, anéis e elevações aparecem em múltiplos níveis.
- **Método:** Taste + UXUI Audit.
- **Recomendação/benefício:** reservar sombra forte para overlays, cor sólida para ação principal e borda forte para seleção/foco. Preservar azul, escuro e cantos arredondados. **Complexidade B/M.**

## Síntese das 13 dimensões

Cada achado é contado pela dimensão principal, para não duplicar totais.

| Dimensão UXUI Audit | IDs principais | Total/resultado |
|---|---|---:|
| Usabilidade/consistência | UI-018 | 1 |
| Acessibilidade | UI-001, 002, 003, 014, 015 | 5 |
| Design visual | UI-013, 023 | 2 |
| Conteúdo/linguagem | UI-011, 020 | 2 |
| Estados/dados | UI-012 | 1 |
| Responsividade | UI-004, 008 | 2 |
| Arquitetura da informação | — | Navegação principal clara; detalhes de gestão incompletamente cobertos |
| Interação | UI-009, 022 | 2 |
| Jornada | UI-006, 017 | 2 |
| Carga cognitiva | UI-007, 010, 021 | 3 |
| Confiança | UI-005 | 1, exclusivamente código local |
| Prevenção/recuperação | UI-016 | 1; operações destrutivas não exercitadas |
| Percepção de desempenho | UI-019 | 1; métricas de campo não aferidas |

Sem achado em uma dimensão não significa aprovação de todos os estados. Navegação por leitor de tela, auditoria axe completa, zoom/reflow a 200–400%, contraste de todas as cores e foco em todos os overlays permanecem verificações posteriores.

## Contribuição concreta da biblioteca UI UX Pro Max

Consultas executadas localmente, dois resultados por consulta, sem persistência automática:

| Consulta | Resultado e aplicação |
|---|---|
| `project management collaboration dashboard --domain product` | Remote Work/Collaboration Tool e Productivity Tool: azul calmo/neutros, hierarquia funcional, Flat Design e microinterações. Fundamenta refinamento sem mudar marca |
| `keyboard focus modal --domain ux` | Focus States e Focus Not Obscured (Enhanced). Aplicado a UI-002. O segundo é AAA; não foi apresentado como obrigação AA |
| `dashboard responsive layout --stack nextjs` | Resultados sobre imagens fill e fonte no layout. Fonte já centralizada. Catálogo cita Next 16.2 e repo usa 15.5.7: não foram transplantadas APIs ou regras de versão incompatível |
| `dark productivity SaaS --domain color` | Productivity Tool e Micro SaaS: paletas claras teal/indigo. Resultado não corresponde ao tema escuro exigido; cores foram rejeitadas, sem fingir que são uma paleta escura validada |
| `dashboard readable sans --domain typography` | Dashboard Data (Fira Code/Fira Sans) e Corporate Trust (Lexend/Source Sans 3). Não justificam migração de fonte; manter Inter, reservar mono a dados técnicos |

A escala de espaçamento e os tokens propostos no DESIGN.md são síntese adaptada ao Team Link e ao código existente, não saída literal da biblioteca.

## Cinco melhorias de maior impacto

1. Separar cor de links no escuro da cor de preenchimento dos botões (UI-001).
2. Padronizar diálogos acessíveis, começando por Novo grupo (UI-002/003).
3. Reservar área para o launcher do chat e coordenar overlays (UI-004).
4. Simplificar dashboard/Kanban/filtros no mobile (UI-007/008/009).
5. Reorganizar formulários longos e mensagens de resultado: cadastro, editor e contato (UI-005/006/010/016/017).

Componentes com maior dispersão: barras de filtros, diálogos próprios, famílias de cards e cabeçalhos de formulários. Mudanças compartilhadas em tokens de link, primitivo de diálogo, tamanhos de controle e shell do chat têm alcance maior que ajustes isolados em páginas.

## Agrupamento sugerido para o Prompt 41

| Lote | Escopo | Critério de revisão |
|---|---|---|
| 0 · Base correta | Associar revisão de produção ao checkout; aprovar proposta DESIGN.md e confirmar diferenças | Nenhum achado de produção recebe patch em arquivo apenas semelhante |
| 1 · Acesso e confiança | UI-001 a UI-005, UI-014 a UI-016 | Contraste medido; teclado/foco/Escape; controles nomeados; confirmação de contato verdadeira |
| 2 · Primitivos e shell | UI-009, UI-018, UI-022, UI-023 | Uma família documentada por papel; screenshots antes/depois em desktop/mobile |
| 3 · Trabalho diário | UI-007, UI-008, UI-011, UI-012, UI-013 | Prioridades encontráveis na primeira tela útil; listas e filtros compreensíveis |
| 4 · Formulários e conteúdo | UI-006, UI-010, UI-017, UI-019, UI-020, UI-021 | Menos rolagem até ação, estado de erro/vazio e feedback coerentes |

Validar cada lote com o mesmo estado e viewport das evidências; não fazer redesign simultâneo de toda a plataforma. Depois de corrigidos, testar manualmente os fluxos com conta de teste e dados adequados. Não foram criados testes ou guardas nesta etapa, nem alterados componentes da aplicação.


## Acompanhamento — Prompt 41 (10/11/2026)

Base reconciliada: `main` local e remota em `52013fb4679b3543785d6439a2aebbfadcc8d392`, também identificada no deployment de produção com estado READY. A cópia antiga e suas alterações permaneceram intactas. Implementação feita no checkout atualizado. Nenhum script, hook ou executável da Taste foi executado; suas referências foram usadas somente como critérios estáticos. As capturas privadas da auditoria original permanecem locais e não fazem parte desta publicação.

### Situação dos 23 achados

| ID | Situação | Resultado / limite |
|---|---|---|
| UI-001 | Implementado | Token de link separado, `#60a5fa` no escuro; links e hover independentes dos preenchimentos primários. Cor computada confirmada no navegador. |
| UI-002 | Implementado | Novo grupo usa diálogo nativo compartilhado, fundo inerte, Tab contido, Escape, clique externo, restauração do foco e bloqueio durante gravação. Reutiliza o bloqueio de scroll existente. |
| UI-003 | Implementado | Controle de membros nomeado inclusive quando seu texto está oculto no mobile. |
| UI-004 | Implementado | Launcher integrado ao header abaixo de 1024px; no desktop fica em portal no body com faixa reservada. Reserva permanece ao abrir o chat; oculto em modais/drawers. Safe areas e ajuste existente do painel pelo visualViewport preservados. |
| UI-005 | Implementado | Problema confirmado na revisão atual. Contato declara demonstração antes dos campos e não promete recebimento. Nenhum backend de envio foi inventado. |
| UI-006 | Implementado | Campos de cadastro precedem orientação no mobile; orientação permanece acessível depois. |
| UI-007 | Implementado | Métricas 2×2 no mobile; atenção antes do onboarding; próximas atividades omitem tarefas já em atenção, mantendo acesso à lista completa. |
| UI-008 | Implementado | Grid por largura do contêiner preservado; etapas adicionais continuam fluindo. Mobile oferece seletor com contagens e uma etapa de cada vez; todas acessíveis. Colunas vazias compactas, scroll interno apenas na área ampla e painel pessoal recolhível. |
| UI-009 | Implementado | Grade compartilhada e labels visíveis em projetos, vagas e atividades. Critérios, opções e consultas preservados. Filtros não foram escondidos automaticamente: continuam diretamente disponíveis. |
| UI-010 | Ajustado parcialmente | Editor agrupado em Informações, Vagas e Publicação, vagas recolhíveis, campos sempre montados e estado de alterações. Confirmação em links e beforeunload; salvar/cancelar preservados. Voltar/avançar na navegação SPA não tem interceptação universal: não foi adicionado histórico artificial, por risco de regressão no App Router. |
| UI-011 | Implementado | Navegador/sistema legíveis, detalhes técnicos expansíveis e dispositivo atual identificado somente pelo ID retornado para sua assinatura, nunca por comparação de user agent. |
| UI-012 | Implementado | Distingue ausência inicial de candidaturas e filtro vazio; orienta divulgar/criar vagas e oferece retorno a histórico/pendentes. |
| UI-013 | Implementado | Cards de projeto não impõem altura total; painéis independentes do dashboard e vagas alinhados ao topo. |
| UI-014 | Implementado | Categoria, Status, Tags e Ordenação com labels persistentes associados aos respectivos triggers. |
| UI-015 | Implementado | Um h1 para a tarefa de autenticação; orientação secundária em h2 no login e cadastro. |
| UI-016 | Implementado | E-mail/formato e senha com erros inline associados, aria-invalid e foco no primeiro inválido; mensagens genéricas do serviço e recuperação preservadas. |
| UI-017 | Implementado | Padding acumulado removido; tópicos auxiliares recolhíveis e formulário mais próximo da introdução honesta. |
| UI-018 | Implementado | Famílias compartilhadas: controles compactos no desktop, confortáveis no mobile/toque, busca ampla, cards e painéis com papéis distintos. Overrides locais de contextos existentes foram preservados quando necessários. |
| UI-019 | Implementado | Shell/skeleton com região lateral e header mantidos enquanto sessão/preferência resolve; dashboard mantém estrutura durante consulta/atualização. |
| UI-020 | Implementado | Ação “Preparar arquivos para IA”; explica ZIP, PDF e prompt e diferencia relatórios do fluxo anterior da biblioteca compartilhada. Exportadores e permissões intactos. |
| UI-021 | Implementado | Bio longa expansível e habilidades/interesses inicialmente resumidos, com acesso ao conjunto integral. Formação e privacidade preservadas. |
| UI-022 | Implementado | Transições explícitas de 150ms nos controles comuns, MotionConfig global respeita preferência reduzida, cards suspendem transformação/layout JS e atalhos de scroll respeitam a preferência. Sem efeitos novos. |
| UI-023 | Implementado | Menos sombras nos campos, filtros, formulários e cards; borda/fundo organizam superfícies operacionais, elevação forte reservada a overlays. |

**Contagem:** 22 implementados; 0 já corrigidos sem alteração; 1 parcial (UI-010); 0 não aplicáveis; 0 não implementados por falta de evidência. O parcial é uma limitação explícita de proteção de rascunho, não uma alteração das regras de dados.

### Verificações adicionais efetivas

Playwright CLI instalado, com API e banco exclusivamente sintéticos: desktop 1440×900, mobile 390×844, tablet 768×1024 e conferência de quatro colunas em 1920×1080. Verificados validação/foco do login, formulário de recuperação sem envio de e-mail, ordem do cadastro, labels, contato sem falso sucesso, métricas 2×2, modal de grupos (Tab/Escape/clique externo/retorno de foco), nome do controle Geral, etapas mobile, grid tablet/amplo, ausência de overflow, drag entre linhas, movimentação por select e restauração do dado sintético, painel pessoal, rascunho entre seções, confirmação de cancelamento, opções de documentação, expansão do perfil, detalhes de dispositivos, movimento reduzido, loading shell, filtros vazios e retorno ao histórico. A faixa do chat foi conferida antes/depois de abrir e no drawer. Não foram criadas contas, enviadas mensagens ou alterados dados reais de produção.

As capturas de conferência do Prompt 41 usam dados sintéticos e ficaram fora do Git. Não houve nova auditoria integral, medição de métricas de campo, teste em leitor de tela ou teclado virtual físico. O uso real destes dispositivos continua sendo uma limitação da validação, sem afirmar certificação universal de acessibilidade.

Lint direcionado dos arquivos alterados: sem erros/avisos. Três testes do rótulo de dispositivos aprovados, inclusive user agent truncado e nome personalizado. Guarda existente de tokens escuros/geometria da home aprovada. Um build final Next.js aprovado, com tipagem/lint e 34 páginas estáticas. Avisos existentes de lockfiles/Browserslist/WASM/Node não impediram o build. Testes SQL e baterias anteriores não foram repetidos: nenhuma alteração de banco, RLS, Auth, Storage, Edge Functions ou notificações no servidor.
