# Gerador de Relatórios — regras e limites da primeira versão

Documento estruturado `schema: 1`: metadados, estilos, seções com níveis 1–3 e elementos pré/textuais/pós-textuais, conteúdo ProseMirror, referências identificadas por UUID, citações vinculadas, figuras PNG/JPEG embutidas, tabelas/quadros, rubrica manual e retratos de importações. Não há geração de conteúdo por IA. Alterações no projeto não alteram os retratos inseridos.

## Fontes conferidas

- Manual Eduniso/UNISO, *Normalização de trabalhos acadêmicos*, 2ª edição revista, 2023, 97 páginas, fornecido pelo usuário. Regras de apresentação nas páginas 36–43; citações 44–60; referências 61–88. O perfil UNISO preserva identificação histórica e sinaliza revisão institucional para 2026.
- ABNT NBR 14724:2024, versão corrigida 01/04/2025, disponibilizada pela UFES: https://engenhariaedesenvolvimentosustentavel.ufes.br/sites/engenhariaedesenvolvimentosustentavel.ufes.br/files/field/anexo/abnt_nbr_14724.pdf
- Registro de edições e atualizações da Biblioteca UFES: https://biblioteca.ufes.br/normalizacao
- Relatório N1 de 30 páginas e TAP de 10 páginas fornecidos pelo usuário: referências de estruturas diferentes; não são autoridades normativas.
- Slide NP1: lista opcional de conferência humana, com oito critérios distintos. O último está identificado como N2 no slide; não constitui especificação completa de N2. Sem notas automáticas.

## Regras efetivamente aplicadas

A4, anverso; margens superior/esquerda 30 mm e inferior/direita 20 mm; corpo 12 pt, entrelinhas 1,5; recuo inicial 12,5 mm como escolha institucional UNISO; referências em 12 pt/espaço simples; fontes/legendas e citações longas em 10 pt/espaço simples; citação longa recuada 40 mm. Arial ou Times New Roman no Word; famílias padrão Helvetica/Times no PDF (substituição informada na interface). Não há perfil frente/verso.

Contagem acadêmica exclui capa; pré-textuais são contados sem número visível. Números aparecem no canto superior direito a partir da parte textual. Seções primárias acadêmicas começam em nova página. Seções não numeradas ficam centralizadas. Sumário PDF calcula páginas reais em passagens sucessivas; Word contém campo TOC atualizável e campos PAGE. **O usuário precisa atualizar o sumário e conferir a paginação no Word/LibreOffice.** Quebras e fontes entre os formatos podem diferir.

Numeração 1/1.1/1.1.1 e sumário seguem orientações de 6024/6027:2012 presentes no manual; não são implementações integrais dessas normas. Títulos inseridos dentro do editor recebem estilo, mas devem ser promovidos a seções na navegação para entrar no sumário e na numeração.

Citações autor-data seguem os casos simples de 10520:2023 descritos no manual; autor e chamada são informados pelo usuário, sem inferência de sobrenomes compostos/institucionais. Citações diretas exigem localização. Casos especiais e desambiguação exigem conferência humana. Referências geradas por metadados são **preliminares**, baseadas nos exemplos do manual; a edição atual 6023:2025 foi identificada, mas não há implementação integral validada. Nenhuma referência é inventada.

Resumo tem limite configurável, sem avaliação automática de qualidade. NBR 6028:2021 é referência institucional para esse controle, sem certificação completa. NBR 15287:2025 e 10719:2015 não têm perfis específicos implementados. TAP e resumo de publicação são modelos próprios configuráveis, sem falsa equivalência a TCC ou template oficial de periódico.

## Segurança e colaboração

Documentos e versões são consultáveis somente pela equipe ativa do projeto com módulo ativo, mesmo quando o projeto é público. Dentro da equipe, todos podem consultar; apenas autor, Líder/Gestor e editores explicitamente selecionados editam conteúdo. Revisor registra parecer/estado sem alterar texto não compartilhado. Autor e Líder/Gestor administram compartilhamento/exclusão. Estado Revisado/Finalizado não é certificação e deve ser devolvido a Rascunho por gestor/revisor antes de nova edição por membro.

Escritas são exclusivas de RPC autenticada com revisão esperada, autorização no banco e transação. Conflitos preservam o texto na tela. Salvamento manual explícito; aviso ao sair com alterações. Restauração carrega uma versão no rascunho, sem apagar histórico. Desativação preserva dados. Figuras privadas são embutidas no JSON, sem bucket/URL público; documento limitado a 4 MB. Exportação ocorre no dispositivo sem transmitir o conteúdo a terceiros.

## Limites visíveis

- Importação GitHub, cargos detalhados e atualização vinculada de retratos ficam para evolução; informações gerais, integrantes, períodos, atividades, metas e checklists possuem seleção individual e prévia.
- PDF aceita o conjunto WinAnsi das fontes padrão; caracteres não suportados bloqueiam exportação, em vez de desaparecer. DOCX preserva Unicode.
- Linhas de tabela maiores que uma página bloqueiam PDF e precisam ser divididas. Cabeçalho repete nas continuações; quadros usam moldura; tabelas numéricas não usam bordas verticais.
- Não há listas automáticas de figuras/tabelas, notas de rodapé estruturadas ou edição simultânea em tempo real. Apêndices/anexos são seções pós-textuais configuradas manualmente.
- Validação é estrutural e parcial; revisão normativa, acadêmica e institucional continua humana. Renderização DOCX depende de editor compatível; testes XML não substituem conferência visual.


## Assistente guiado

Criação e edição comum usam cinco etapas: Documento, Informações, Dados, Conteúdo e Finalizar. A edição avançada continua disponível sobre o mesmo objeto `schema: 1`. O campo opcional `assistant` guarda etapa, etapa mais avançada visitada, seção e retratos de registros confirmados. Não há migração ou alteração de permissões. Documentos antigos são abertos sem modificação automática; a posição inicial é derivada de seu estado quando não existe metadado do assistente.

A seleção de fontes não insere texto. Somente uma segunda escolha explícita, no modal da seção atual, insere os registros desejados. A lista confirmada é preservada ao salvar o rascunho e não muda se a origem mudar. Campos acadêmicos sugeridos também exigem ação explícita. Tipo de documento exige escolha na criação; título é exigido para avançar da identificação, mas o salvamento de rascunho incompleto continua permitido. Todas as exigências de exportação permanecem no validador existente.

Salvamento manual disponível no cabeçalho e no rodapé; não há autosave. Mudanças de etapa e de seção não apagam texto. O mesmo número de revisão esperado continua sendo enviado à RPC; falhas e conflitos mantêm os dados locais. A finalização continua sujeita às permissões de revisão existentes e não certifica conformidade ABNT.
