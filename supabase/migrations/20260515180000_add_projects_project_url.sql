-- URL externa opcional (site, demo, etc.). Exposto nas views públicas após
-- incluir a coluna no SELECT delas (veja comentário no final).

alter table public.projects
  add column if not exists project_url text;

comment on column public.projects.project_url is 'Link externo opcional (http/https).';

-- ---------------------------------------------------------------------------
-- Passos manuais no Supabase (SQL Editor ou definição da view na UI):
--
-- 1) Incluir `p.project_url` (ou alias equivalente) no SELECT de:
--      public.project_public_cards
--      public.project_public_details
--
-- 2) Na função RPC `public.create_project_with_details`, adicionar parâmetro:
--      p_project_url text default null
--    e na INSERT em `public.projects`, coluna e valor:
--      project_url, nullif(trim(p_project_url), '')
--
-- Sem (1), o detalhe/listagem não recebem o campo via PostgREST.
-- Sem (2), a criação na Nova ideia falha ao enviar `p_project_url`.
-- ---------------------------------------------------------------------------
