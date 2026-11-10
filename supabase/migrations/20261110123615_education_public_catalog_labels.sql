-- Only catalog labels referenced by a visible profile are needed by anonymous readers.
grant select(id,nome,sigla) on public.instituicoes_ensino to anon;
create policy education_institution_labels on public.instituicoes_ensino for select to anon
 using(exists(select 1 from public.usuario_formacoes f where f.instituicao_id=instituicoes_ensino.id));
