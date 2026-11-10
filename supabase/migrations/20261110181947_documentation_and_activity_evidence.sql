-- Private uploads are validated by the Edge Function; clients cannot create Storage objects or manifests.
create schema documentation_private;
revoke all on schema documentation_private from public,anon,authenticated;
grant usage on schema documentation_private to authenticated,service_role;
alter default privileges in schema documentation_private revoke execute on functions from public;

create table public.reference_documents(
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 180),
 description text not null default '' check(length(description)<=2000),document_type text not null default 'Orientações',
 institution text not null default '',version text not null default '1',uploader_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','published','rejected')),
 path text unique,filename text,mime text,size integer check(size between 1 and 10485760),sha256 text,
 builtin boolean not null default false,reviewed_at timestamptz,review_note text not null default '',
 check((builtin and path is null) or (not builtin and path is not null))
);
create index reference_documents_status_name on public.reference_documents(status,name);
create index reference_documents_uploader on public.reference_documents(uploader_id);
alter table public.reference_documents enable row level security;
revoke all on public.reference_documents from public,anon,authenticated;
grant select on public.reference_documents to authenticated;
create policy reference_read on public.reference_documents for select to authenticated using(status='published' or uploader_id=(select auth.uid()));
insert into public.reference_documents(name,description,document_type,version,status,builtin) values
 ('Guia ABNT — Team Link','Guia prático original; não reproduz normas protegidas. Referências verificadas em novembro de 2026.','Guia ABNT','2026.1','published',true);

create table documentation_private.upload_batches(
 id uuid primary key default gen_random_uuid(),actor_id uuid not null,client_id uuid not null,
 scope text not null check(scope in ('activity','reference')),target uuid,body text not null default '',reply_to uuid, historical_edit boolean not null default false,
 files jsonb not null,metadata jsonb not null default '{}',state text not null default 'pending' check(state in ('pending','ready','expired')),
 created_at timestamptz not null default now(),cleanup_claimed_at timestamptz,cleaned boolean not null default false,result uuid,
 unique(actor_id,client_id)
);
alter table documentation_private.upload_batches enable row level security;
create policy upload_admin on documentation_private.upload_batches to service_role using(true) with check(true);
revoke all on documentation_private.upload_batches from public,anon,authenticated;
create index upload_batches_cleanup on documentation_private.upload_batches(state,created_at) where not cleaned;

alter table public.activity_comments add column reply_to uuid references public.activity_comments(id) on delete restrict;
alter table public.activity_comments drop constraint activity_comments_body_check;
alter table public.activity_comments add constraint activity_comments_body_check check(char_length(btrim(body))<=4000);
create table public.activity_comment_attachments(
 id uuid primary key default gen_random_uuid(),comment_id uuid not null references public.activity_comments(id) on delete restrict,
 task_id uuid not null references public.activity_tasks(id) on delete restrict,project_id uuid not null references public.projects(id) on delete restrict,
 path text not null unique,filename text not null,mime text not null,size integer not null check(size between 1 and 10485760),sha256 text not null,
 created_at timestamptz not null default now()
);
create index activity_attachments_comment on public.activity_comment_attachments(comment_id);
create index activity_attachments_project on public.activity_comment_attachments(project_id);
create index activity_attachments_task on public.activity_comment_attachments(task_id);
create index activity_comment_reply on public.activity_comments(reply_to) where reply_to is not null;
alter table public.activity_comment_attachments enable row level security;
revoke all on public.activity_comment_attachments from public,anon,authenticated;
grant select on public.activity_comment_attachments to authenticated;
create policy evidence_read on public.activity_comment_attachments for select to authenticated using(public.can_use_activities(project_id));
create trigger project_history_write_guard before insert or update or delete on public.activity_comment_attachments for each row execute function lifecycle_private.write_guard('project_id');

create function documentation_private.comment_integrity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select from public.activity_comments where id=new.id) then return null;end if;
 if new.reply_to is not null and not exists(select from public.activity_comments where id=new.reply_to and task_id=new.task_id) then raise exception 'Resposta inválida.';end if;
 if length(btrim(new.body))=0 and not exists(select from public.activity_comment_attachments where comment_id=new.id) then raise exception 'Escreva uma mensagem ou envie anexos.';end if;
 return null;
end $$;
create constraint trigger comment_integrity after insert or update on public.activity_comments deferrable initially deferred for each row execute function documentation_private.comment_integrity();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('activity-evidence','activity-evidence',false,10485760,array['image/png','image/jpeg','image/webp','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
 ('academic-references','academic-references',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
-- Deliberately no browser write/read policies on Storage. All access is authorized by the Edge Function.

create function documentation_private.begin_upload(p_actor uuid,p_scope text,p_target uuid,p_client uuid,p_body text,p_reply uuid,p_files jsonb,p_metadata jsonb,p_historical boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare b documentation_private.upload_batches;context jsonb;project uuid;f jsonb;
begin
 if p_actor is null or p_client is null or not exists(select from public.profiles where id=p_actor) or p_scope not in ('activity','reference') then raise exception 'Envio indisponível.';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if p_scope='activity' then
  select project_id into project from public.activity_tasks where id=p_target;
  perform 1 from public.projects where id=project for update;
  context:=activity_private.dialog(p_target,project,null);
  if not coalesce((context->'permissions'->>'comment')::boolean,false) or (context->>'projectReadOnly')::boolean or
    ((context->>'readOnly')::boolean and not ((context->>'manager')::boolean and p_historical)) then raise exception 'Atividade em somente leitura ou envio não autorizado.';end if;
  if p_reply is not null and not exists(select from public.activity_comments where id=p_reply and task_id=p_target) then raise exception 'Resposta inválida.';end if;
 elsif not coalesce((p_metadata->>'distribution_authorized')::boolean,false) or length(btrim(p_metadata->>'name')) not between 1 and 180 or length(coalesce(p_metadata->>'description',''))>2000 then raise exception 'Confirme o nome e a autorização de distribuição do documento.';end if;
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and (case when p_scope='reference' then 1 else 5 end) or length(coalesce(p_body,''))>4000 then raise exception 'Envie até cinco anexos de até 10 MB por mensagem.';end if;
 for f in select value from jsonb_array_elements(p_files) loop
  if (f->>'size')::bigint not between 1 and 10485760 or length(f->>'name') not between 1 and 150 or (f->>'name')~'[\\/]' or (f->>'sha256')!~'^[0-9a-f]{64}$' or
    f->>'mime' not in ('image/png','image/jpeg','image/webp','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document') or
    (p_scope='reference' and f->>'mime' not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')) then raise exception 'Arquivo inválido.';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_client::text,0));
 select * into b from documentation_private.upload_batches where actor_id=p_actor and client_id=p_client for update;
 if found then
  if b.scope<>p_scope or b.target is distinct from p_target or b.body<>coalesce(p_body,'') or b.reply_to is distinct from p_reply or b.files<>p_files or b.metadata<>p_metadata or b.historical_edit<>p_historical or b.state='expired' then raise exception 'Este envio expirou ou foi alterado. Tente um novo envio.';end if;
 else
  if (select count(*) from documentation_private.upload_batches where actor_id=p_actor and created_at>now()-interval '1 hour')>=60 then raise exception 'Muitos envios. Aguarde antes de tentar novamente.';end if;
  insert into documentation_private.upload_batches(actor_id,client_id,scope,target,body,reply_to,files,metadata,historical_edit) values(p_actor,p_client,p_scope,p_target,coalesce(p_body,''),p_reply,p_files,p_metadata,p_historical) returning * into b;
 end if;
 return jsonb_build_object('id',b.id,'state',b.state,'result',b.result);
end $$;

create function documentation_private.complete_upload(p_actor uuid,p_client uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare b documentation_private.upload_batches;project uuid;f jsonb;path text;bucket text;idx integer:=0;completed_id uuid;context jsonb;
begin
 select * into b from documentation_private.upload_batches where actor_id=p_actor and client_id=p_client for update;
 if not found or b.state='expired' then raise exception 'Envio indisponível.';end if;
 if b.state='ready' then return b.result;end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 bucket:=case when b.scope='activity' then 'activity-evidence' else 'academic-references' end;
 for f in select value from jsonb_array_elements(b.files) loop
  path:=b.actor_id||'/'||b.id||'/'||idx;
  if not exists(select from storage.objects where bucket_id=bucket and name=path and (metadata->>'size')::bigint=(f->>'size')::bigint and metadata->>'mimetype'=f->>'mime') then raise exception 'Arquivo não recebido integralmente.';end if;
  idx:=idx+1;
 end loop;
 if b.scope='activity' then
  select project_id into project from public.activity_tasks where id=b.target;
  perform 1 from public.projects where id=project for update;
  -- Existing mutation checks permissions, period, idempotency, notifications and audit; nothing bypasses the review workflow.
  perform public.mutate_activity(project,'comment',jsonb_build_object('id',b.target,'body',case when b.body='' then 'Anexos da atividade' else b.body end,'comment_id',b.client_id,'historical_edit',b.historical_edit));
  update public.activity_comments set body=b.body,reply_to=b.reply_to where id=b.client_id and author_id=p_actor and task_id=b.target;
  idx:=0;
  for f in select value from jsonb_array_elements(b.files) loop
   insert into public.activity_comment_attachments(comment_id,task_id,project_id,path,filename,mime,size,sha256) values(b.client_id,b.target,project,b.actor_id||'/'||b.id||'/'||idx,f->>'name',f->>'mime',(f->>'size')::integer,f->>'sha256');idx:=idx+1;
  end loop;
  completed_id:=b.client_id;
 else
  f:=b.files->0;
  insert into public.reference_documents(name,description,document_type,institution,version,uploader_id,path,filename,mime,size,sha256) values
   (b.metadata->>'name',coalesce(b.metadata->>'description',''),left(coalesce(b.metadata->>'document_type','Orientações'),100),left(coalesce(b.metadata->>'institution',''),300),left(coalesce(b.metadata->>'version','1'),80),p_actor,b.actor_id||'/'||b.id||'/0',f->>'name',f->>'mime',(f->>'size')::integer,f->>'sha256') returning id into completed_id;
 end if;
 update documentation_private.upload_batches set state='ready',result=completed_id where id=b.id;
 return completed_id;
end $$;

create function public.begin_document_upload(p_actor uuid,p_scope text,p_target uuid,p_client uuid,p_body text,p_reply uuid,p_files jsonb,p_metadata jsonb,p_historical boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select documentation_private.begin_upload(p_actor,p_scope,p_target,p_client,p_body,p_reply,p_files,p_metadata,p_historical) $$;
create function public.complete_document_upload(p_actor uuid,p_client uuid) returns uuid language sql security invoker set search_path='' as $$ select documentation_private.complete_upload(p_actor,p_client) $$;
revoke all on function public.begin_document_upload(uuid,text,uuid,uuid,text,uuid,jsonb,jsonb,boolean),public.complete_document_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_document_upload(uuid,text,uuid,uuid,text,uuid,jsonb,jsonb,boolean),public.complete_document_upload(uuid,uuid),documentation_private.begin_upload(uuid,text,uuid,uuid,text,uuid,jsonb,jsonb,boolean),documentation_private.complete_upload(uuid,uuid) to service_role;

-- Global moderation uses the Supabase administrative role, never project ownership.
create function documentation_private.send_discussion(p_task uuid,p_body text,p_client uuid,p_reply uuid,p_historical boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare project uuid;
begin
 if auth.uid() is null or p_client is null or length(btrim(p_body)) not between 1 and 4000 then raise exception 'Escreva uma mensagem de até 4000 caracteres.';end if;
 select project_id into project from public.activity_tasks where id=p_task;
 perform 1 from public.projects where id=project for update;
 if p_reply is not null and not exists(select from public.activity_comments where id=p_reply and task_id=p_task) then raise exception 'Resposta inválida.';end if;
 if exists(select from public.activity_comments where id=p_client and (author_id<>auth.uid() or task_id<>p_task or reply_to is distinct from p_reply)) then raise exception 'Envio inválido.';end if;
 perform public.mutate_activity(project,'comment',jsonb_build_object('id',p_task,'body',btrim(p_body),'comment_id',p_client,'historical_edit',p_historical));
 update public.activity_comments set reply_to=p_reply where id=p_client;
 return p_client;
end $$;
create function public.send_activity_discussion(p_task uuid,p_body text,p_client uuid,p_reply uuid default null,p_historical boolean default false) returns uuid language sql security invoker set search_path='' as $$select documentation_private.send_discussion(p_task,p_body,p_client,p_reply,p_historical)$$;
revoke all on function public.send_activity_discussion(uuid,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.send_activity_discussion(uuid,text,uuid,uuid,boolean),documentation_private.send_discussion(uuid,text,uuid,uuid,boolean) to authenticated;

create function documentation_private.review_reference(p_id uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('published','rejected') or length(coalesce(p_note,''))>2000 then raise exception 'Decisão inválida.';end if;
 update public.reference_documents set status=p_status,review_note=coalesce(p_note,''),reviewed_at=now() where id=p_id and not builtin;
 if not found then raise exception 'Documento indisponível.';end if;
end $$;
create function public.review_reference_document(p_id uuid,p_status text,p_note text default '') returns void language sql security invoker set search_path='' as $$select documentation_private.review_reference(p_id,p_status,p_note)$$;
revoke all on function public.review_reference_document(uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_reference_document(uuid,text,text),documentation_private.review_reference(uuid,text,text) to service_role;

create function documentation_private.claim_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with candidates as(select id from documentation_private.upload_batches where not cleaned and state<>'ready' and created_at<now()-interval '1 hour' and (cleanup_claimed_at is null or cleanup_claimed_at<now()-interval '10 minutes') order by created_at limit 10 for update skip locked),claimed as
 (update documentation_private.upload_batches b set state='expired',cleanup_claimed_at=now() from candidates c where b.id=c.id returning b.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',case when scope='activity' then 'activity-evidence' else 'academic-references' end,'paths',(select jsonb_agg(actor_id||'/'||id||'/'||(n-1)) from generate_series(1,jsonb_array_length(files))n))),'[]') into result from claimed;
 return result;
end $$;
create function public.claim_document_upload_cleanup() returns jsonb language sql security invoker set search_path='' as $$select documentation_private.claim_cleanup()$$;
create function documentation_private.finish_cleanup(p_id uuid) returns void language sql security definer set search_path='' as $$update documentation_private.upload_batches set cleaned=true where id=p_id and state='expired'$$;
create function public.finish_document_upload_cleanup(p_id uuid) returns void language sql security invoker set search_path='' as $$select documentation_private.finish_cleanup(p_id)$$;
revoke all on function public.claim_document_upload_cleanup(),public.finish_document_upload_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.claim_document_upload_cleanup(),public.finish_document_upload_cleanup(uuid),documentation_private.claim_cleanup(),documentation_private.finish_cleanup(uuid) to service_role;

-- Scheduled maintenance has no user-supplied target and can only remove expired, uncommitted uploads.
select cron.schedule('team-link-document-upload-cleanup','17 * * * *',$cron$
 select net.http_post(url:='https://yjvtjqvkclkujcttvtwi.supabase.co/functions/v1/project-documents',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"action":"cleanup"}'::jsonb);
$cron$);

create function documentation_private.project_data(p_slug text,p_period uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.projects;period public.activity_periods;activities boolean;
begin
 select * into p from public.projects where slug=p_slug;
 if p.id is null or not report_private.can_access(p.id) then raise exception 'Acesso indisponível.';end if;
 select * into period from public.activity_periods where project_id=p.id and (case when p_period is null then is_active else id=p_period end) order by created_at desc limit 1;
 if p_period is not null and period.id is null then raise exception 'Período indisponível.';end if;
 activities:=public.can_use_activities(p.id);
 return jsonb_build_object('extracted_at',clock_timestamp(),'project',jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug,'description',p.description,'summary',p.short_description,'category',p.category,'secondary_categories',p.secondary_categories,'created_at',p.created_at,'status',p.status,'closed_at',p.closed_at,'context',p.project_context,
  'tags',(select coalesce(jsonb_agg(tag order by tag),'[]') from public.project_tags where project_id=p.id),
  'skills',(select coalesce(jsonb_agg(skill order by skill),'[]') from public.project_required_skills where project_id=p.id)),
 'academics',jsonb_build_object('institution',coalesce(nullif(period.institution,''),p.academic_institution),'course',coalesce(nullif(period.course,''),p.academic_course),'city',coalesce(nullif(period.city,''),p.academic_city),'discipline',period.discipline,'advisor',period.advisor,'period',period.name,'year',period.academic_year,'semester',period.academic_semester),
 'periods',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active) order by is_active desc,created_at desc),'[]') from public.activity_periods where project_id=p.id),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',pr.full_name,'role',coalesce(r.level,m.role),'display_role',m.display_role,'status',m.status,'joined_at',m.joined_at) order by m.joined_at),'[]') from public.project_members m left join public.profiles pr on pr.id=m.user_id left join public.project_recruitment_roles r using(project_id,user_id) where m.project_id=p.id),
 'tasks',case when activities then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'assignees',t.assignees,'stage',s.name,'kind',s.kind,'due_at',t.due_at,'requires_review',t.requires_review,'reviewer_id',t.reviewer_id,'created_at',t.created_at,'updated_at',t.updated_at) order by t.created_at,t.id),'[]') from public.activity_tasks t left join public.activity_stages s on s.id=t.stage_id where t.project_id=p.id and t.period_id=period.id) else '[]'::jsonb end,
 'goals',case when activities then (select coalesce(jsonb_agg(jsonb_build_object('title',title,'description',description,'due_at',due_at,'kind',kind,'target',target,'actual',actual,'unit',unit) order by title),'[]') from public.activity_goals where project_id=p.id and period_id=period.id) else '[]'::jsonb end,
 'events',case when activities then (select coalesce(jsonb_agg(jsonb_build_object('action',h.action,'name',pr.full_name,'task',t.title,'reason',h.details->>'reason','from',h.details->>'from','to',h.details->>'to','created_at',h.created_at) order by h.created_at,h.id),'[]') from public.activity_history h join public.activity_tasks t on t.id=h.task_id left join public.profiles pr on pr.id=h.actor_id where h.project_id=p.id and t.period_id=period.id and h.action in ('move','approve','return','save_task','transfer_task')) else '[]'::jsonb end,
 'activities_authorized',activities,'missing',jsonb_build_array('Objetivos específicos: não há campo estruturado registrado. Consulte a descrição sem inferir objetivos.','Resultados, metodologia, recursos e marcos: use somente descrições e registros existentes; dados não registrados devem ser solicitados.','Histórico de reaberturas: não registrado; reabertura comum é bloqueada.','Data de encerramento ausente não deve ser estimada.'));
end $$;
create function public.get_documentation_data(p_slug text,p_period uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select documentation_private.project_data(p_slug,p_period)$$;
revoke all on function public.get_documentation_data(text,uuid) from public,anon,authenticated;
grant execute on function public.get_documentation_data(text,uuid),documentation_private.project_data(text,uuid) to authenticated;

CREATE OR REPLACE FUNCTION activity_private.dialog(p_task uuid, p_project uuid, p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.activity_tasks; p public.projects; a public.activity_periods; manager boolean;assigned boolean;reviewer boolean;level text;assigner uuid;detail jsonb;
begin
 if auth.uid() is null then raise exception 'Acesso indisponível.';end if;
 select * into t from public.activity_tasks where id=p_task;
 if not found then raise exception 'Atividade indisponível.';end if;
 select * into p from public.projects where id=t.project_id;
 if (p_project is null and nullif(p_slug,'') is null) or (p_project is not null and p.id<>p_project) or (nullif(p_slug,'') is not null and p.slug<>p_slug)
   or not public.can_use_activities(p.id) then raise exception 'Atividade indisponível.';end if;
 select * into a from public.activity_periods where id=t.period_id and project_id=p.id;
 manager:=public.is_project_join_manager(p.id);assigned:=auth.uid()=any(t.assignees);
 select r.level into level from public.project_recruitment_roles r join public.project_members m using(project_id,user_id) where r.project_id=p.id and r.user_id=auth.uid() and m.status='active';
 reviewer:=manager or (t.reviewer_id=auth.uid() and level='reviewer');
 -- Only trustworthy assignment audit records; never infer the creator from the current leader.
 select h.actor_id into assigner from public.activity_history h where h.project_id=p.id and h.task_id=t.id and h.action='save_task'
  and jsonb_typeof(h.details->'input'->'assignees')='array'
  and (select array_agg(u order by u) from jsonb_array_elements_text(coalesce(h.details->'before'->'assignees','[]'))u)
      is distinct from (select array_agg(u order by u) from jsonb_array_elements_text(h.details->'input'->'assignees')u) order by h.id desc limit 1;
 detail:=public.get_activity_details(p.id,t.id,null);
 detail:=jsonb_set(detail,'{comments}',coalesce((select jsonb_agg(jsonb_build_object(
 'id',c.id,'author_id',c.author_id,'name',pr.full_name,'avatar',pr.avatar_url,'body',c.body,'reply_to',c.reply_to,'created_at',c.created_at,
 'attachments',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'filename',f.filename,'mime',f.mime,'size',f.size) order by f.created_at,f.id),'[]') from public.activity_comment_attachments f where f.comment_id=c.id)
 ) order by c.created_at,c.id) from public.activity_comments c left join public.profiles pr on pr.id=c.author_id where c.task_id=t.id),'[]'));
 detail:=jsonb_set(detail,'{history}',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',pr.full_name,'action',h.action,'details',h.details||jsonb_build_object('to_kind',s.kind,'to_label',s.name),'created_at',h.created_at) order by h.created_at,h.id)
  from public.activity_history h left join public.profiles pr on pr.id=h.actor_id left join public.activity_stages s on s.project_id=p.id and s.id=nullif(h.details->'input'->>'stage_id','')::uuid where h.task_id=t.id and h.project_id=p.id),'[]'));
 return jsonb_build_object(
  'project',jsonb_build_object('id',p.id,'slug',p.slug,'title',p.title),'manager',manager,
  'projectReadOnly',p.status in ('completed','archived'),'selectedPeriod',t.period_id,'readOnly',not coalesce(a.is_active,false) or p.status in ('completed','archived'),'periods',jsonb_build_array(to_jsonb(a)),
  'tasks',jsonb_build_array(to_jsonb(t)),
  'stages',(select coalesce(jsonb_agg(s order by position,id),'[]') from public.activity_stages s where project_id=p.id),
  'goals',(select coalesce(jsonb_agg(g order by title,id),'[]') from public.activity_goals g where project_id=p.id and (manager and period_id=t.period_id or id=t.goal_id)),
  'checklist',(select coalesce(jsonb_agg(c order by created_at,id),'[]') from public.activity_checklist c where task_id=t.id),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',pr.full_name,'avatar',pr.avatar_url,'level',coalesce(r.level,'member')) order by pr.full_name,m.user_id),'[]')
   from public.project_members m join public.profiles pr on pr.id=m.user_id left join public.project_recruitment_roles r using(project_id,user_id)
   where m.project_id=p.id and m.status='active' and (manager or m.user_id=any(t.assignees) or m.user_id=t.reviewer_id or m.user_id=assigner)),
  'assigned_by',(select jsonb_build_object('id',pr.id,'name',pr.full_name,'avatar',pr.avatar_url) from public.profiles pr where pr.id=assigner),
  'permissions',jsonb_build_object('move',manager or assigned,'review',coalesce(reviewer,false),'comment',manager or assigned or coalesce(level='reviewer',false),'check',manager or assigned),
  'details',detail);
end $function$
;
