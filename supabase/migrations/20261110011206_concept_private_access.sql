-- Internal author/rate-limit/audit data is never an API resource.
-- Explicit restrictive policies document the default deny, even if future grants are changed.
create policy concept_proposals_internal on concept_private.propostas as restrictive for all to anon,authenticated using(false) with check(false);
create policy concept_reviews_internal on concept_private.revisoes as restrictive for all to anon,authenticated using(false) with check(false);
create policy concept_migrations_internal on concept_private.migracoes as restrictive for all to anon,authenticated using(false) with check(false);
create index conceitos_consolidado_em on public.conceitos(consolidado_em);
create index concept_reviews_source on concept_private.revisoes(conceito_id);
create index concept_reviews_target on concept_private.revisoes(destino_id);
