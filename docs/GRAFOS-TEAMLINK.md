# Grafos e recomendações do Team Link — PI III

Implementação do Prompt 42, sobre a main `1303a05` (Prompts 37–41 preservados).

## Objetivo e arquitetura

O sistema descobre colaboradores, oportunidades e amizades a partir de relações cadastradas. Não usa IA generativa, não prevê desempenho e não atribui proficiência. O PostgreSQL continua sendo a fonte de dados; não há banco de grafos, serviço pago ou nova dependência.

Fluxo: `recommendation_private.context` → DTO autorizado e limitado → repositório Next.js → construtor de listas de adjacência → BFS → restrições/pontuação → cards. O endpoint de dados não recebe um usuário arbitrário: usa `auth.uid()`. As Server Actions verificam o token com `getUser`; o banco repete a autorização. A interface recebe recomendações e justificativas, não as listas internas de adjacência. O recorte de demonstração tem um contrato separado de até 24 vértices autorizados.

Fontes do código:

- `src/lib/graph/graph.ts`: estruturas, BFS, DFS, caminhos, componentes fracos, Jaccard e vizinhos compartilhados.
- `src/lib/graph/engine.ts`: construção e três classificações; constantes `MODEL`.
- `src/lib/graph/repository.server.ts` e `actions.ts`: dados/autenticação e processamento no servidor.
- `src/lib/graph/demo.ts`: recorte didático com os mesmos algoritmos, inclusive exemplo sintético.
- `src/components/recommendations/`: cards, escolha de vaga, pesos e visualização.

## Modelo formal

G=(V,E,W), com IDs `tipo:identificador`, Map de vértices e Map de listas de adjacência. O tipo evita colisão quando entidades diferentes têm o mesmo UUID.

| Vértice | Fonte |
|---|---|
| Usuário | Campos públicos permitidos de profiles |
| Projeto | projects e project_tags |
| Vaga | project_vacancies, ocupação por join_request_vacancies |
| Conceito | conceitos, aliases validados e vínculos declarados |
| Curso | cursos |
| Instituição | instituicoes_ensino |
| Área CINE | cursos_cine e cursos_cine_areas |

| Aresta | Semântica |
|---|---|
| skill / interest | Declaração do perfil; usos distintos |
| tag / requirement | Tema do projeto / competência exigida; usos distintos |
| vacancy / member | Vaga do projeto / participação ativa |
| friend | Amizade aceita com consentimento de ambas as pessoas |
| course / institution | Formação efetivamente cadastrada em usuario_formacoes |
| cine / parent | Classificação e ancestralidade CINE |
| offer | Instituição oferece curso; nunca significa matrícula de um usuário |
| related | Relação validada relacionado_a, simétrica |
| specific | mais_especifico_que, direcionada do específico para o geral |
| specialization | Direção inversa identificada para descobrir especialistas; não equivale as competências |

Relações reversíveis são representadas por dois arcos tipados. A visualização informa essa contagem. O peso de requisito mede importância de 1 a 5; não é distância nem nível de conhecimento. BFS usa número de arestas, não soma de pesos. As arestas CINE alcançam classificações ancestrais conhecidas sem tornar cursos diferentes idênticos.

## Fontes e normalização

Reutilizados os catálogos nacionais, relações CINE, conceitos/aliases/fontes, formações, projetos, vagas, membros, candidaturas e amizades. Nenhum catálogo foi duplicado. Os identificadores revisados são preservados.

Conceitos revisados só entram como fatos do perfil quando seu nome está explicitamente nos campos públicos declarados. O resolvedor existente `concept_private.resolve_exact` complementa textos com alias validado e correspondência inequívoca. Termos ambíguos, pendentes ou não revisados não recebem uma identidade inventada. Não há correspondência aproximada silenciosa. Aliases convergem no mesmo ID e não multiplicam a pontuação. A origem textual de um alias só é exibida como tal quando ainda está disponível nos dados; caches antigos podem ter preservado apenas o nome canônico.

Formações canônicas opcionais são usadas sem inferir instituição a partir de oferta. Campos acadêmicos manuais sem identificação canônica ficam sem conexão acadêmica; continuam acessíveis no perfil. Todas as formações permitidas podem participar, com estado atual/histórico e principal preservados; o algoritmo não presume que estão em andamento e não transforma graduação em habilidade.

## BFS real

Implementação própria com fila em array e cursor FIFO, conjunto visitado representado pelas chaves do Map de distâncias, profundidade, predecessores e reconstrução de caminho. Não usa `shift` nem consulta SQL como substituição da travessia. A construção finaliza as adjacências em ordem determinística antes de percorrer.

Colaboradores são descobertos a partir do projeto, por exemplo projeto → vaga → requisito → pessoa. Oportunidades partem do usuário → conceito → vaga/projeto. Amizades podem ser descobertas por conceitos, formação, projeto ou usuário → amigo → usuário quando os consentimentos permitem. Tipos de arestas são filtrados por finalidade; ofertas acadêmicas ficam fora da descoberta de pessoas.

A travessia tem limite explícito de cinco arestas e 15.000 visitados. Os caminhos são de descoberta; a pontuação exige evidência própria e não transfere a habilidade de outra pessoa para o candidato. A seleção SQL amplia conceitos em apenas um salto semântico; o crédito técnico também usa apenas uma relação direta.

## DFS real e demonstração

DFS usa pilha explícita com índice do próximo vizinho. Registra descobertas, profundidades, predecessores, retornos e chamadas ativas, sem repetir vértices em ciclos. A conectividade exibida é alcançabilidade direcionada no recorte. O número de componentes é calculado em uma projeção não direcionada e é explicitamente chamado de componentes fracos, não componentes fortemente conexos.

A área técnica fica no painel de Líderes/Gestores. O exemplo inicial é identificado como sintético. “Carregar contexto real autorizado” consulta o mesmo contexto do motor, limita o desenho a 24 vértices e executa os mesmos BFS/DFS nesse recorte. Fila, pilha, visitados por passo, níveis, ordem, backtracking, caminho, legenda, tipos e pesos são acessíveis. Os resultados do recorte não são apresentados como a classificação inteira. A interface usa SVG e controles comuns, com duas colunas de vértices no mobile e lista textual das arestas.

## Jaccard e projeções

J(A,B)=|A∩B|/|A∪B|, com Set para deduplicação. Dois conjuntos vazios retornam zero: ausência de evidência, não identidade perfeita. Comparações de habilidades, interesses e vizinhanças permanecem separadas. `sharedNeighbors` calcula projeções tipadas para habilidades, amizades e participação. Os cursos/instituições também são comparados por IDs canônicos distintos.

## Pesos e cobertura técnica

`peso` foi acrescentado a conceitos_vinculos e project_required_skills, default 3, intervalo inteiro 1–5. Apenas requisitos usam o peso no cálculo. Não há segunda cópia das habilidades. O escritor existente de referências preserva peso/ID/data para uma relação mantida durante edição.

Líderes e Gestores configuram a importância por seção de vaga ou requisitos gerais no painel. O servidor valida cada linha, seu projeto, tipo e peso; a gravação é transacional, bloqueia o projeto e rejeita IDs de outro projeto. Sem campos gerais legados, não são criados requisitos gerais fictícios: o formulário existente continua definindo habilidades das vagas.

Base: soma dos pesos identificados / soma dos pesos exigidos × 100. Requisitos canônicos repetidos são deduplicados pelo maior peso. Requisito textual não resolvido continua no denominador como evidência não identificada.

- Conceito exato ou alias canônico: fator 1.
- Relacionado direto validado: fator 0,35.
- Habilidade mais específica que o requisito: fator 0,50, somente nessa direção.
- Requisito essencial (5): relação semântica recebe fator zero; não supre a declaração exata.
- Sem requisitos: percentual null, mostrado como não calculável.

São retornados o percentual exato, o ajustado, os fatores, pesos, identificadas e não identificadas. Exemplo reproduzível: React=5, Supabase=3, UI/UX=2; perfil React+Supabase → 8/10=80% exatos. Isso não é probabilidade nem prova de desempenho. A cobertura de informação mede componentes disponíveis, incluindo proporção de requisitos resolvidos, e não completude/proficiência do perfil.

## Três classificações distintas

Constantes estão em `MODEL`, não escondidas na interface. Denominadores não são renormalizados pela ausência de campos.

**Colaboradores:** 90% cobertura técnica ajustada + 5% Jaccard de interesses/tags + 5% relação acadêmica com o contexto cadastrado do projeto. As formações do gestor não são usadas como requisitos do projeto. Participantes ativos e pessoas com candidatura pendente são excluídos; somente vagas públicas abertas, com capacidade e projeto open/in_progress são oportunidades de entrada. Há escolha de vaga para evitar que uma vaga ocupe todo o recorte de classificação.

**Oportunidades:** 60% cobertura técnica + 20% Jaccard de interesses/tags + 10% Jaccard de habilidades/tags + 5% categoria explicitamente entre os interesses + 3% conexão acadêmica com projeto/equipe acessível + 2% amizade autorizada com integrante. O projeto e a vaga precisam estar disponíveis. Participação ativa e candidatura pendente excluem novas sugestões para o projeto. Busca, filtros e candidatura a múltiplas vagas continuam nos fluxos existentes.

**Amizades:** 25% Jaccard de habilidades + 25% Jaccard de interesses + 20% Jaccard de amizades autorizadas + 10% mesmo curso + 5% relação CINE + 5% instituição declarada + 10% Jaccard de projetos acessíveis. Exclui a própria pessoa, amizades aceitas e solicitações pendentes. O sistema atual não tem tabela de bloqueios; não foi inventado esse mecanismo. Uma única habilidade compartilhada contribui no máximo com sua dimensão, sem produzir 100% por renormalização.

Acadêmico: curso canônico igual=1 na dimensão curso. Para cursos distintos, CINE igual=0,8; área detalhada=0,6; estreita=0,35; geral=0,1 na dimensão CINE. Instituição só coincide com identidade efetivamente cadastrada. Múltiplas formações usam a melhor correspondência comprovada; não acumulam pontos repetidos.

Desempate técnico: percentual exato, pontuação combinada, Jaccard, nome e ID. Amizades: pontuação, nome e ID. A lista é determinística para entradas equivalentes. Nada cria candidatura, convite ou solicitação automaticamente. O contato passa pelo perfil e pelos controles existentes; não foi criado um fluxo paralelo de convites.

## Segurança e privacidade

A nova graph_preferences tem RLS e grants limitados a leitura/inserção/atualização da própria linha. `share_connections` começa false. Só uma amizade aceita com ambas as pessoas optantes entra no grafo social. O consentimento pode ser revogado; a consulta seguinte já o aplica. As permissões anteriores de friendships não foram ampliadas.

Funções privilegiadas ficam no schema privado, com search_path vazio, autenticação e autorização explícitas. Helpers internos não são executáveis por clientes. Os wrappers públicos são SECURITY INVOKER e não executáveis por anon. O contexto aceita somente modos fechados, o usuário da sessão e projeto administrado quando necessário. Os dados-fonte limitados expostos pela RPC são fatos autorizados, sem adjacências, tokens, e-mails, mensagens, telefones, pendências privadas de conceitos ou projetos inacessíveis. O grafo completo é montado e processado no Next.js.

No estado inspecionado, os campos de perfil usados são públicos e formações seguem a visibilidade do perfil. E-mail continua sem SELECT para anon/authenticated. Se a plataforma futuramente adicionar perfis restritos ou bloqueios, a extração precisará acompanhar essa nova política antes de usar tais dados. Não há chave administrativa no navegador nem serviço elevado necessário às Server Actions.

## Limites e custo

A consulta usa índices existentes de conceitos_vinculos, curso/instituição das formações, amizades, requisitos e IDs de catálogos. Retorna até 120 pessoas candidatas + ator, 48 projetos, 160 vagas e 300 ofertas pertinentes; não consulta todos os catálogos nacionais no cliente. Há um DTO em lote por contexto, sem chamada HTTP por candidato. A RPC tem orçamento configurado de 5s e o repositório aborta sua espera em 7s.

São retornados até 12 resultados; quatro aparecem inicialmente e os demais podem ser expandidos. O desenho didático tem 24 vértices. Não há cache persistente do grafo; foco, retorno de visibilidade, mudanças locais de perfil/amizades/pesos e Atualizar acionam nova consulta. Respostas obsoletas são descartadas pelo controle de sequência; uma falha não mantém o recorte antigo na tela. Alterações remotas aparecem na próxima consulta, não por um novo canal Realtime.

BFS/DFS sobre adjacências prontas: O(V+E), espaço O(V). A ordenação das adjacências é etapa separada, O(Σ d log d). Construção, consultas e classificação não estão incluídas nesse custo. O registro de fila/pilha por passo copia fronteiras e pode custar O(V²), por isso é usado apenas no recorte didático. Classificação combina candidatos, vagas e requisitos e acrescenta ordenação O(C log C); os limites evitam trabalho ilimitado. Nenhum benchmark de escala ou impacto experimental foi inventado.

## Verificação executada

- `node --test tests/graph.test.cjs`: 15 testes determinísticos aprovados; níveis, caminhos, ciclos, profundidade, desconexão, pilha/retornos, Jaccard vazio, 80%, aliases, semântica, essenciais, filtros de elegibilidade, empates, seleção por vaga, suficiência, CINE, múltiplas formações e oferta sem matrícula inferida.
- `tests/graph-security.sql`: transação em base isolada, com rollback. Valida RLS, consentimento/revogação, anonimato, manipulação de IDs, pesos 1–5, escrita de terceiros, acesso entre projetos, persistência em edição e ausência de e-mail/projeto privado.
- Interface local: motor Next.js → RPC real sobre banco sintético → cards; oportunidades e colaboradores; gravação de pesos; exemplo sintético e contexto autorizado; passos BFS/DFS; ação de amizade sem envio; consentimento alterado/restaurado; mobile 390×844 sem overflow. Desktop 1440×900.
- Erros identificados na adaptação da fixture foram corrigidos nela. Um problema de feedback do checkbox foi corrigido no componente. Não foram utilizados dados reais de produção para submissões de teste.

## Evolução N1 → N2 e disciplinas

N1 permanece intacto. BFS descobre, DFS demonstra percursos/conectividade e Jaccard mede similaridade; pesos evoluem a classificação para diferenciar importância. O relatório N2 pode reproduzir o exemplo de 80%, os testes e os passos da demonstração com este código.

Teoria dos Grafos: heterogeneidade, direção, projeções e travessias. Compiladores: normalização e resolução de símbolos/aliases, sem afirmar a existência de um compilador completo. Estrutura de Dados: Map, Set, fila e pilha. Banco de Dados: relações canônicas, índices, transações e RLS. Arquitetura de Computadores: custo de processamento/memória e limites. Segurança por Definição: autorização em camadas, minimização e consentimento. Engenharia de Software: testes e migração compatível. IHC/UX: explicabilidade, acesso por teclado e responsividade.

A proposta se relaciona aos ODS 4 (aprendizagem e colaboração acadêmica), 9 (infraestrutura de software) e 17 (formação de parcerias). São vínculos conceituais do projeto, sem alegar aumento medido de inclusão, aprendizagem ou produtividade.

## Publicação e conferência administrativa

Migração versionada `20261111015442_weighted_graph_recommendations.sql`, aplicada pelo mecanismo oficial do Supabase. Nome/versão do arquivo foram alinhados ao histórico remoto. Confirmados após aplicação: RLS da preferência ativo, execução anônima das duas RPCs negada, wrappers SECURITY INVOKER, e-mail sem SELECT para anon/authenticated e nenhum novo apontamento no comparativo do advisor de segurança. Os avisos legados fora deste escopo não foram alterados.

Build final Next.js aprovado, com tipagem/lint e geração das 34 páginas estáticas. Permaneceram apenas avisos conhecidos do ambiente sobre lockfiles, Browserslist, WASM e Node. Nenhuma chave nova, serviço pago, Edge Function ou alteração de autenticação foi necessária.

## Prompt 43 — Recomendações na interface

Explorar vagas conserva a listagem, os filtros, a candidatura e a paginação existentes. O motor do Prompt 42 continua calculando afinidade com BFS, Jaccard, pesos e vínculos autorizados. A classificação é feita no servidor com o recorte de até 48 projetos e 160 vagas, sem depender da página solicitada. A consulta de catálogo filtra todo o conjunto elegível, aplica a ordem recomendada e só então pagina. Vagas fora do recorte continuam listadas; a ordem por nome ou data, quando escolhida, prevalece. A etiqueta permanece nas ordenações explícitas.

O selo exige pontuação de pelo menos 12 e cobertura ponderada exata de pelo menos 20%, ou pontuação de pelo menos 15 e uma tag exata em comum com o projeto. Posição na lista, vínculo acadêmico, relação semântica e conexão social, por si sós, não geram selo. A interface comum não mostra notas, caminhos nem cálculos. O dashboard mantém as vagas recentes sem um bloco separado. Amigos e gestão de colaboradores exibem sugestões compactas, com motivos públicos quando disponíveis e as ações existentes; solicitações de amizade não são enviadas automaticamente.

O recálculo reutiliza os eventos disponíveis de perfil, amizades, recrutamento e edição de projeto. Preferência e alterações locais de acesso invalidam o resultado anterior, inclusive em outras abas. Foco, retorno à página e reabertura permitem consultar alterações remotas quando não há evento autorizado. A atualização normal mantém o conteúdo, limita pedidos concorrentes e ignora respostas obsoletas. Mudança de usuário ou contexto, acesso negado e revogação descartam o resultado anterior. Uma falha transitória só mantém dados previamente considerados seguros para essa situação. Não há polling novo.

Em Configurações → Privacidade → Recomendações, a opção para amizades aceitas continua desligada por padrão e preserva as escolhas existentes. A RPC do grafo continua exigindo autorização das duas pessoas para incluir uma conexão privada. O DTO comum não divulga amizades de terceiros, seus caminhos ou contagens, e a demonstração real também exclui essas arestas. Mensagens privadas não são consultadas. Habilidades, interesses, formação e participações autorizadas para descoberta continuam gerando sugestões sem um aceite para ativar o algoritmo. A escolha de ordem por nome ou data muda a exibição, sem desativar o cálculo.

A análise da LGPD é preliminar. A revisão não encontrou aviso específico anterior sobre recomendações; o texto de privacidade identificado cobria presença online. Dados acessíveis ao público ainda são dados pessoais. Para a descoberta interna, o legítimo interesse pode ser avaliado pelo controlador considerando finalidade, necessidade, expectativa, impacto e salvaguardas. Cabe ao controlador documentar o teste de balanceamento, atualizar o aviso geral e disponibilizar um canal para exercício de direitos e oposição quando aplicável. A opção relativa às amizades é separada, voluntária e revogável. As sugestões não tomam decisões de aprovação, ingresso ou contratação. Referências: [LGPD](https://bibliotecadigital.mj.gov.br/bitstream/1/1642/4/LEI_2018_13709.html) e [Guia da ANPD sobre legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse).

No painel de gestão do projeto, **Análise técnica do projeto** guarda os pesos e a demonstração de BFS, DFS e Jaccard, com exemplo sintético e recorte real autorizado. O acesso é verificado pelas permissões existentes. A migração do catálogo substitui apenas a função de consulta privada, sem ampliar grants ou mudar regras de elegibilidade.

Verificação direcionada: oito testes de apresentação e filtros; SQL transacional em banco isolado para testar ranking entre páginas, filtros, modos explícitos, deduplicação, vagas fechadas/privadas e permissões.
No navegador com banco sintético, a validação cobriu dashboard, vagas marcadas e comuns, ordenação explícita, pesquisa, modal, sugestões de amizade, atualização sem piscar, gravação e revogação da preferência, desktop e mobile (390 px). A gestão abriu a demonstração com Jaccard e DFS; um integrante sem gestão acessou o painel sem ver as ferramentas técnicas.
Build final do Next.js aprovado. A migração 20261111023712 foi aplicada e alinhada ao histórico do Supabase. Em produção, a RPC continua acessível a autenticados e vedada a anônimos, sem SELECT direto na visão privada nem acesso ao e-mail por esse papel. RLS das preferências permanece ativo; o advisor não registrou novos apontamentos de segurança.
