# Catálogo compartilhado de conceitos

## Diagnóstico e migração inicial — 09/11/2026

| Uso | Entradas | Textos distintos |
|---|---:|---:|
| Habilidades de perfis | 22 | 19 |
| Interesses de perfis | 20 | 19 |
| Tags de projetos | 29 | 27 |
| Requisitos de vagas | 31 | 30 |
| Requisitos legados adicionais | 6 | 6 |

São 102 usos atuais e 6 registros legados adicionais. Considerando todos: 92 grafias, 84 formas normalizadas; 9 termos compartilhados entre os quatro usos atuais, 13 incluindo os legados. Há 7 grupos com diferenças apenas de caixa, 1 de acento e 3 pares candidatos a equivalência ainda não aceita. Não há arrays nulos nos perfis; 6 perfis têm habilidades vazias e 6 têm interesses vazios.

O catálogo contém 90 conceitos validados, 9 provisórios, 113 aliases e 3 relações revisadas `relacionado_a`, simétricas e sem pesos. A migração associou 90 usos atuais e 5 registros legados. Preservou sem associação 12 textos atuais (9 ambíguos, 3 sem revisão) e 1 legado; não houve erros. Os estados completos estão em `data/concepts/diagnosis.json` e `migration-report.json`.

## Identidade e compatibilidade

`conceitos.id` é a identidade estável. Nomes iguais podem pertencer a conceitos/domínios diferentes. A normalização preserva `+`, `#` e `.`; C, C++, C#, Java/JavaScript, React/React Native e UX/UI não são fundidos. Busca tolerante a pontuação não é resolução automática de identidade. Somente alias validado, único e sem exigência de confirmação é associado automaticamente. Fontes e decisões estão no seed, incluindo a documentação oficial de JavaScript/React/React Native, NN/g, IBM e NIST.

`conceitos_vinculos.tipo` distingue `skill`, `interest`, `tag` e `requirement`, com FKs e constraints de destino. Não existe inferência entre os tipos. Campos antigos continuam disponíveis; triggers cobrem escritores antigos, e RPCs salvam UUIDs e projeções na mesma transação. Textos ambíguos permanecem marcados para confirmação, sem escolha arbitrária. A migração não reescreveu os textos originais.

O guard de aplicação comparou contagens e hashes dos registros completos de perfis, projetos, tags, vagas, requisitos legados (exceto a nova FK), integrantes, candidaturas, vínculos com vagas, notificações e períodos dentro da mesma transação. Todos permaneceram iguais; a segunda execução foi idempotente. Não houve reset de perfis ou aviso em massa.

## Autocomplete e sugestões

Seletor compartilhado nos cadastros de perfil, criação/edição de projetos e vagas, incluindo o modal de recrutamento. Busca de até 12 resultados, debounce de 250 ms, cancelamento, cache limitado, domínio/alias/estado visíveis, teclado, Escape e portal responsivo. Chips legados oferecem confirmação. Sugestões podem ficar no rascunho antes do login; só são criadas no banco ao salvar com uma sessão autenticada.

Novos termos são provisórios, com domínio explícito, texto válido e até 120 caracteres (40 para nova sugestão em perfil/tag). Limites: 16 habilidades e 16 interesses, 10 tags, 30 requisitos por vaga. Propostas têm quotas por conta no servidor: 40/minuto, 100/dia, 200 provisórias ativas; reuso de proposta própria não consome uma nova entrada. Termos de domínio diferente não são fundidos automaticamente.

## Administração e segurança

Sem painel administrativo novo. Rotinas em schema privado, executáveis somente pelo administrador SQL:

- `concept_private.review(id, 'validado'|'inativo', nome, justificativa)`: valida, renomeia ou rejeita, preservando vínculos e histórico.
- `concept_private.consolidate(origem, destino_validado, justificativa)`: exige revisão de identidade/domínio; deduplica vínculos, mantém UUID antigo como redirecionamento, aliases, auditoria e projeções. Não usa similaridade textual para decidir fusões.
- `concept_private.import_seed(jsonb)`: importação idempotente por chave de origem; não sobrescreve revisões posteriores. `node scripts/concept-seed-sql.mjs` gera o SQL administrativo a partir dos JSONs versionados.
- `concept_private.migrate_legacy()`: execução inicial protegida por marcador; reexecuções não sobrescrevem escolhas atuais.

RLS e grants impedem alterações de catálogo/aliases por usuários comuns. Vínculos são consultados apenas pelo titular ou gestor do projeto e gravados por limites privilegiados privados com verificação explícita de propriedade, transação e lock do destino. RPCs públicas são `SECURITY INVOKER`. Autocomplete retorna somente metadados do catálogo; nunca pessoas associadas. E-mails permanecem sem SELECT público/autenticado. Dados internos de autoria, quotas, auditoria e migração possuem negação explícita para papéis da aplicação. Não há novos alertas de segurança para os objetos desta entrega.

As relações ficam preparadas para uso futuro por UUID/tipo; qualquer recomendação futura deve considerar somente identidades e relações revisadas conforme sua política. Não há motor de grafos, ranking, BFS/DFS ou pesos nesta entrega.

## Verificação

`tests/concepts.sql` exige `team_link.test_environment=isolated`, executa em transação com rollback e cobre aliases, ambiguidades, pesquisas, tipos independentes, perfis vazios, projetos/vagas, limites, escritores legados, RLS, e-mail privado, revisão/consolidação e falha atômica da migração. Executado em PostgreSQL local isolado com as migrations reais e dados sintéticos.

11 testes Node de conceitos/assistente passaram. Testes pelo navegador cobriram perfil com salvamento/reload, alias por teclado, confirmação de ambiguidade, proposta, criação/edição de projeto, edição pelo modal de vaga, seletores opcionais do cadastro, remoção de chips, Escape, erro/recuperação da busca, temas claro/escuro e larguras 1366/768/390 sem rolagem horizontal. O banco local confirmou os UUIDs gravados por esses formulários. Nenhum usuário/projeto/vaga artificial foi criado em produção. Lint aprovado com um aviso preexistente em `academic-reports.test.cjs`; build Next.js aprovado. REST de produção confirmou aliases, normalização, limites e negação de leitura anônima de vínculos/e-mail.

Migrations aplicadas e alinhadas ao histórico do Supabase: `20261109235632_concept_catalog.sql`, `20261110010817_concept_references.sql`, `20261110011206_concept_private_access.sql`.
