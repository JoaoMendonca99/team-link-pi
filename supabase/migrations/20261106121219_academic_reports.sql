-- Documents are private to active project members, even on public projects.
alter table public.project_workspace_modules drop constraint project_workspace_modules_module_check;
alter table public.project_workspace_modules add constraint project_workspace_modules_module_check check(module in ('github','support','activities','reports'));
create or replace function public.set_workspace_module(p_project uuid,p_module text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for update;
 if not found or not public.is_project_join_manager(p_project) then raise exception 'Acesso negado'; end if;
 if p_module='activities' then
  if p_active is true then return; end if;
  raise exception 'Controle de Atividades é uma funcionalidade obrigatória.';
 end if;
 if p_module is null or p_module not in ('github','support','reports') or p_active is null then raise exception 'Funcionalidade inválida'; end if;
 if p_active then insert into public.project_workspace_modules values(p_project,p_module) on conflict do nothing;
 else delete from public.project_workspace_modules where project_id=p_project and module=p_module; end if;
end $$;

create table public.academic_documents(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id), title text not null check(length(title) between 1 and 240),
 status text not null default 'draft' check(status in ('draft','review','revised','final')),
 body jsonb not null check(jsonb_typeof(body)='object' and body->>'schema'='1' and octet_length(body::text)<=4000000),
 editors uuid[] not null default '{}', review_note text not null default '' check(length(review_note)<=10000),
 revision integer not null default 1, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create index academic_documents_project_idx on public.academic_documents(project_id,updated_at desc);
create table public.academic_document_versions(
 document_id uuid not null references public.academic_documents(id) on delete cascade,
 revision integer not null, body jsonb not null, title text not null,status text not null,
 review_note text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(document_id,revision)
);
alter table public.academic_documents enable row level security;
alter table public.academic_document_versions enable row level security;
revoke all on public.academic_documents,public.academic_document_versions from public,anon,authenticated;
-- All writes go through the checked, revision-aware RPC. No direct Data API writes.
create schema if not exists report_private;
revoke all on schema report_private from public;
grant usage on schema report_private to authenticated;
create function report_private.can_access(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.workspace_module_active(p_project,'reports') and exists(
 select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active');
$$;
revoke all on function report_private.can_access(uuid) from public,anon;
grant execute on function report_private.can_access(uuid) to authenticated;
grant select on public.academic_documents,public.academic_document_versions to authenticated;
create policy academic_document_read on public.academic_documents for select to authenticated using(report_private.can_access(project_id));
create policy academic_version_read on public.academic_document_versions for select to authenticated using(exists(
 select 1 from public.academic_documents d where d.id=document_id and report_private.can_access(d.project_id)));

create function public.get_report_workspace(p_slug text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects; begin
 select * into p from public.projects where slug=p_slug;
 if p.id is null or not report_private.can_access(p.id) then raise exception 'Funcionalidade indisponível ou acesso negado'; end if;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug),'manager',public.is_project_join_manager(p.id),
 'reviewer',exists(select 1 from public.project_recruitment_roles where project_id=p.id and user_id=auth.uid() and level='reviewer'),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',pr.full_name)) from public.project_members m left join public.profiles pr on pr.id=m.user_id where m.project_id=p.id and m.status='active'),'[]'::jsonb),
 'documents',coalesce((select jsonb_agg((to_jsonb(d)-'body')||jsonb_build_object('document_kind',d.body->>'kind','format_profile',d.body->>'profile') order by d.updated_at desc) from public.academic_documents d where d.project_id=p.id),'[]'::jsonb));
end $$;

create function public.save_academic_document(p_project uuid,p_id uuid,p_revision integer,p_body jsonb,p_status text,p_editors uuid[],p_note text)
returns public.academic_documents language plpgsql security definer set search_path='' as $$
declare d public.academic_documents; manager boolean; reviewer boolean; begin
 -- Serialize with module changes and membership management; recheck authorization server-side.
 perform 1 from public.projects where id=p_project for update;
 if not report_private.can_access(p_project) then raise exception 'Acesso negado'; end if;
 manager:=public.is_project_join_manager(p_project);
 reviewer:=exists(select 1 from public.project_recruitment_roles where project_id=p_project and user_id=auth.uid() and level='reviewer');
 if p_body is null or p_body->>'schema' is distinct from '1' or jsonb_typeof(p_body->'sections') is distinct from 'array' or jsonb_array_length(p_body->'sections')>150 or octet_length(p_body::text)>4000000 then raise exception 'Documento inválido ou muito grande'; end if;
 if p_revision is null or jsonb_typeof(p_body->'meta') is distinct from 'object' or jsonb_typeof(p_body->'style') is distinct from 'object' or jsonb_typeof(p_body->'references') is distinct from 'array' or jsonb_typeof(p_body->'rubric') is distinct from 'object' or jsonb_typeof(p_body->'imports') is distinct from 'array' or coalesce(p_body->>'kind','') not in ('academic','tap','abstract') or coalesce(p_body->>'profile','') not in ('abnt','uniso2023','custom') then raise exception 'Estrutura de documento inválida'; end if;
 if p_status is null or p_status not in ('draft','review','revised','final') or p_editors is null or p_note is null then raise exception 'Dados inválidos'; end if;
 if exists(select 1 from unnest(p_editors) e where not exists(select 1 from public.project_members m where m.project_id=p_project and m.user_id=e and m.status='active')) then raise exception 'Colaborador inválido'; end if;
 if p_id is null then
  if p_revision<>0 or p_status<>'draft' or cardinality(p_editors)>0 or p_note<>'' then raise exception 'Crie um rascunho'; end if;
  insert into public.academic_documents(project_id,owner_id,title,body,updated_by) values(p_project,auth.uid(),coalesce(nullif(btrim(p_body#>>'{meta,title}'),''),'Sem título'),p_body,auth.uid()) returning * into d;
 else
  select * into d from public.academic_documents where id=p_id and project_id=p_project for update;
  if not found then raise exception 'Documento indisponível'; end if;
  if d.revision is distinct from p_revision then raise exception 'Outra pessoa salvou uma versão. Seu texto foi mantido na tela; recarregue ou copie antes de continuar.'; end if;
  if not(manager or d.owner_id=auth.uid() or auth.uid()=any(d.editors) or reviewer) then raise exception 'Edição não autorizada'; end if;
  if not(manager or d.owner_id=auth.uid()) and p_editors is distinct from d.editors then raise exception 'Compartilhamento não autorizado'; end if;
  if not(manager or reviewer) and (p_status in ('revised','final') or p_note is distinct from d.review_note or d.status in ('revised','final')) then raise exception 'Revisão exige Líder/Gestor/Revisor'; end if;
  if reviewer and not(manager or d.owner_id=auth.uid() or auth.uid()=any(d.editors)) and p_body is distinct from d.body then raise exception 'Revisor deve registrar correções no parecer'; end if;
  update public.academic_documents set title=coalesce(nullif(btrim(p_body#>>'{meta,title}'),''),'Sem título'),body=p_body,status=p_status,editors=p_editors,review_note=p_note,revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into d;
 end if;
 insert into public.academic_document_versions values(d.id,d.revision,d.body,d.title,d.status,d.review_note,auth.uid(),now());
 return d;
end $$;

create function public.delete_academic_document(p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare d public.academic_documents; begin
 select * into d from public.academic_documents where id=p_id for update;
 if not found or not report_private.can_access(d.project_id) or not(public.is_project_join_manager(d.project_id) or d.owner_id=auth.uid()) then raise exception 'Acesso negado'; end if;
 if d.revision is distinct from p_revision then raise exception 'Documento alterado; atualize antes de excluir'; end if;
 delete from public.academic_documents where id=p_id;
end $$;
revoke all on function public.get_report_workspace(text),public.save_academic_document(uuid,uuid,integer,jsonb,text,uuid[],text),public.delete_academic_document(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_report_workspace(text),public.save_academic_document(uuid,uuid,integer,jsonb,text,uuid[],text),public.delete_academic_document(uuid,integer) to authenticated;
