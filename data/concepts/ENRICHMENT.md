# Catálogo complementar — ESCO 1.2.0

Dados © União Europeia, reutilizados de ESCO sob [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). O Team Link não é endossado pela Comissão Europeia. As seleções, classificações locais e adaptações de descrição são do Team Link.

Fonte primária: [ESCO API](https://ec.europa.eu/esco/api/doc/esco_api_doc.html), parâmetros `language=pt`, `selectedVersion=v1.2.0`, tipo `skill`. A [declaração oficial de direitos](https://esco.ec.europa.eu/uk/node/456) distingue a licença dos dados (CC BY 4.0) da licença EUPL do software. O*NET foi avaliado, mas não foi importado diretamente. Não foram importadas ocupações nem copiadas classificações de terceiros como conceitos.

Foram examinados 707 recursos classificados como conhecimento, obtidos por buscas de diferentes áreas. A seleção final contém 534 recursos em português, com URI oficial, rótulo original, versão e licença em cada linha. Foram excluídos termos sem contexto suficiente, conteúdos clínicos alternativos não apropriados e recortes excessivamente específicos. A descrição foi limpa de marcação HTML e limitada a 400 caracteres; o domínio é uma classificação editorial local. Não houve tradução automática para fabricar equivalências.

517 identidades são novas; 17 correspondências explícitas reaproveitam conceitos existentes após comparação do rótulo e da definição. Os aliases importados são nomes portugueses revisados e rótulos ingleses do mesmo URI; não foram promovidas listas amplas de sinônimos sem revisão. As 92 relações `mais_especifico_que` vêm exclusivamente de `broaderSkill` entre recursos selecionados. A direção filho → pai é preservada; essas relações não representam equivalência. As três relações simétricas anteriores permanecem.

As nove propostas originais — CBA; Modelagem; Redes; Oxido; Inteligente Artificial; “Design,programação”; UX/UI; Webdev; Automatização — continuam provisórias: texto isolado não estabelece uma identidade confiável. Cada registro permanece separado, sem consolidar por aproximação. Nenhum vínculo de usuário foi alterado por inferência.

## Reimportação

Executar `node scripts/concept-enrichment-sql.mjs` para emitir a transação revisável. Aplicar pelo acesso administrativo do banco, após a migration `concept_enrichment`. A importação é idempotente pelo URI externo; não substitui UUIDs, nomes ou datas dos conceitos existentes. Não executar como usuário da aplicação. Arquivos JSON versionados são o lote revisado, não consultas remotas mutáveis.

## Histórico acadêmico

`usuario_formacoes` mantém pares completos, identificadores estáveis, ordem de apresentação e situação atual independente da formação principal. `false` significa apenas “Não cursando atualmente”; registros migrados têm situação desconhecida. Dados originais ficam no backup privado `education_private.legacy`, inclusive informações incompletas recuperáveis exclusivamente pelo proprietário.

As quatro colunas acadêmicas antigas de `profiles` são projeções somente do servidor: uma formação única ou a principal explicitamente escolhida. Várias formações sem principal produzem projeção vazia, sem misturar curso e instituição. O histórico não altera os dados acadêmicos dos projetos. Escrita atômica usa autenticação, checagem de proprietário e revisão otimista; RLS limita a leitura ao perfil visível e backups nunca são públicos. Não há novos algoritmos de recomendação.

## Resultado da aplicação em 10/11/2026

- Conceitos: 99 → 616 (+517); 607 validados e 9 provisórios. Aliases: 113 → 1.142 (+1.029). Relações: 3 → 95 (+92). Proveniência: 534 identificadores ESCO, incluindo as 17 correspondências revisadas.
- Histórico: 1 formação completa migrada, com situação desconhecida; 1 registro incompleto preservado privadamente; zero erros. Os 12 perfis foram preservados. Nenhum reset ou notificação em massa foi executado.
- Migrations aplicadas: `20261110122734_concept_enrichment`, `20261110123302_user_education_history`, `20261110123615_education_public_catalog_labels`. A terceira concede apenas ID, nome e sigla de instituições referenciadas por formações visíveis a leitores anônimos.
- Validação: duas suítes SQL em banco isolado com escritas sintéticas e rollback; reimportação estável; 26 testes Node; lint sem erros (um aviso anterior em `academic-reports.test.cjs`); build Next.js aprovado. Navegador: chips, manuais confirmar/cancelar/voltar, múltiplas formações atuais, edição/remoção, recuperação de legado, recarga e cadastro sem formação; desktop, tablet e celular. Leituras reais de produção confirmaram o embed de formações, a busca de conceitos e a negação de e-mail/estado privado anônimo.
- Comparações transacionais preservaram os demais campos dos perfis, projetos, períodos, notificações e backups anteriores. Os hashes dos 99 conceitos originais, vínculos de conceitos e requisitos de vagas permaneceram iguais após a importação. Nenhum alerta de segurança novo foi introduzido nos objetos alterados.

As nove propostas provisórias permanecem pendentes de revisão de significado; isso não impede o uso do catálogo nem cria equivalências automáticas. Não foram implementados grafos de recomendação, classificações de usuários ou avisos coletivos.
