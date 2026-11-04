create table public.project_vacancies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  skills text[] not null default '{}' check (cardinality(skills) <= 30),
  positions integer not null check (positions between 1 and 1000000),
  open boolean not null default true,
  legacy boolean not null default false,
  created_at timestamptz not null default now()
);
create index project_vacancies_project_idx on public.project_vacancies(project_id);
create unique index project_vacancies_legacy_idx on public.project_vacancies(project_id) where legacy;
create table public.project_recruitment_roles (
  project_id uuid not null,
  user_id uuid not null,
  level text not null check (level in ('manager','reviewer','member')),
  primary key (project_id,user_id),
  foreign key (project_id,user_id) references public.project_members(project_id,user_id) on delete cascade
);
create table public.project_recruitment_role_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  actor_id uuid not null,
  previous_level text not null,
  level text not null,
  created_at timestamptz not null default now()
);
create table public.join_request_vacancies (
  request_id uuid not null references public.join_requests(id) on delete cascade,
  vacancy_id uuid not null references public.project_vacancies(id) on delete cascade,
  requested_title text not null,
  approved_at timestamptz,
  released_at timestamptz,
  primary key (request_id,vacancy_id)
);
create index join_request_vacancies_occupancy_idx on public.join_request_vacancies(vacancy_id) where approved_at is not null and released_at is null;
create table public.join_request_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.join_requests(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index join_request_messages_request_idx on public.join_request_messages(request_id,id);
create table public.join_request_message_reads (
  request_id uuid not null references public.join_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_message_id bigint not null,
  primary key (request_id,user_id)
);
alter table public.project_vacancies enable row level security;
alter table public.project_recruitment_roles enable row level security;
alter table public.project_recruitment_role_history enable row level security;
alter table public.join_request_vacancies enable row level security;
alter table public.join_request_messages enable row level security;
alter table public.join_request_message_reads enable row level security;
revoke all on public.project_vacancies, public.project_recruitment_roles, public.project_recruitment_role_history,
  public.join_request_vacancies, public.join_request_messages, public.join_request_message_reads from public,anon,authenticated;

insert into public.project_vacancies(project_id,title,description,skills,positions,legacy)
select p.id,'Vagas gerais',left(coalesce(p.desired_profile,''),4000),array(
  select s.skill from public.project_required_skills s where s.project_id=p.id order by s.id limit 30
),p.open_spots,true
from public.projects p where p.open_spots>0;

alter table public.join_requests add column recruitment_review_started_at timestamptz;

create or replace function public.is_project_join_manager(p_project_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
    or exists(select 1 from public.project_members m left join public.project_recruitment_roles r
      on (r.project_id,r.user_id)=(m.project_id,m.user_id)
      where m.project_id=p_project_id and m.user_id=auth.uid() and m.status='active'
      and coalesce(r.level,case when m.role in ('owner','admin') then 'manager' else 'member' end)='manager')
  );
$$;

create function public.recruitment_vacancies(p_project uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'description',v.description,
    'skills',v.skills,'positions',v.positions,'available',v.positions-occupied.total,'open',v.open,'legacy',v.legacy)
    order by v.created_at,v.id),'[]'::jsonb)
  from public.project_vacancies v
  join public.projects p on p.id=v.project_id
  cross join lateral (select count(*) as total from public.join_request_vacancies x
    where x.vacancy_id=v.id and x.approved_at is not null and x.released_at is null) occupied
  where v.project_id=p_project and (public.is_project_join_manager(p_project)
    or (p.visibility='public' and p.status='open' and v.open));
$$;

create function public.recruitment_save_vacancy(p_project uuid,p_vacancy uuid,p_title text,p_description text,p_skills text[],p_positions int,p_open boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform 1 from public.projects where id=p_project for update;
  if not public.is_project_join_manager(p_project) then raise exception 'Acesso negado'; end if;
  if p_vacancy is null then
    insert into public.project_vacancies(project_id,title,description,skills,positions,open)
      values(p_project,btrim(p_title),coalesce(p_description,''),coalesce(p_skills,'{}'),p_positions,p_open)
      returning id into v_id;
  else
    if p_positions < (select count(*) from public.join_request_vacancies
      where vacancy_id=p_vacancy and approved_at is not null and released_at is null) then
      raise exception 'Quantidade abaixo das posições ocupadas';
    end if;
    update public.project_vacancies set title=btrim(p_title),description=coalesce(p_description,''),
      skills=coalesce(p_skills,'{}'),positions=p_positions,open=p_open
      where id=p_vacancy and project_id=p_project returning id into v_id;
    if v_id is null then raise exception 'Vaga indisponível'; end if;
  end if;
  return v_id;
end;
$$;

create function public.recruitment_send_application(p_project uuid,p_vacancies uuid[],p_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count int;
begin
  if auth.uid() is null then raise exception 'Acesso negado'; end if;
  perform 1 from public.projects where id=p_project and visibility='public' and status='open' and owner_id<>auth.uid() for update;
  if not found or exists(select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active')
    then raise exception 'Projeto indisponível para candidatura'; end if;
  if exists(select 1 from public.join_requests where project_id=p_project and user_id=auth.uid() and status in ('pending','approved'))
    then raise exception 'Já existe uma candidatura ativa'; end if;
  v_count := coalesce(cardinality(p_vacancies),0);
  if v_count not between 1 and 50 or length(coalesce(p_message,''))>4000 then
    raise exception 'Selecione pelo menos uma vaga e confira a apresentação';
  end if;
  if v_count <> (select count(*) from public.project_vacancies v where v.project_id=p_project and v.open and v.id=any(p_vacancies)
    and v.positions>(select count(*) from public.join_request_vacancies j where j.vacancy_id=v.id and j.approved_at is not null and j.released_at is null))
    then raise exception 'Uma das vagas selecionadas está indisponível'; end if;
  insert into public.join_requests(project_id,user_id,message,status)
    values(p_project,auth.uid(),nullif(btrim(p_message),''),'pending') returning id into v_id;
  insert into public.join_request_vacancies(request_id,vacancy_id,requested_title)
    select v_id,id,title from public.project_vacancies where id=any(p_vacancies);
  return v_id;
end;
$$;

create function public.recruitment_applications(p_project uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'project_id',j.project_id,'project_title',p.title,'slug',p.slug,
    'user_id',j.user_id,'name',a.full_name,'avatar',a.avatar_url,'message',j.message,
    'created_at',j.created_at,'decided_at',j.decided_at,
    'status',case when j.status='pending' and j.recruitment_review_started_at is not null then 'review' else j.status end,
    'vacancies',(select coalesce(jsonb_agg(jsonb_build_object('id',x.vacancy_id,'title',x.requested_title,
      'approved',x.approved_at is not null) order by x.requested_title,x.vacancy_id),'[]'::jsonb)
      from public.join_request_vacancies x where x.request_id=j.id),
    'unread',(select count(*) from public.join_request_messages m where m.request_id=j.id and m.sender_id is distinct from auth.uid()
      and m.id>coalesce((select last_message_id from public.join_request_message_reads
        where request_id=j.id and user_id=auth.uid()),0))
  ) order by j.created_at desc,j.id),'[]'::jsonb)
  from public.join_requests j join public.projects p on p.id=j.project_id
    left join public.profiles a on a.id=j.user_id
  where auth.uid() is not null and ((p_project is null and j.user_id=auth.uid()) or
    (j.project_id=p_project and (j.user_id=auth.uid() or public.is_project_join_manager(p_project))));
$$;

create function public.recruitment_messages(p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.join_requests%rowtype; v_messages jsonb; v_last bigint;
begin
  select * into j from public.join_requests where id=p_request;
  if not found or auth.uid() is null or (j.user_id<>auth.uid() and not public.is_project_join_manager(j.project_id))
    then raise exception 'Acesso negado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'name',p.full_name,
    'avatar',p.avatar_url,'content',m.content,'created_at',m.created_at) order by m.id),'[]'::jsonb),max(m.id)
    into v_messages,v_last from public.join_request_messages m left join public.profiles p on p.id=m.sender_id where m.request_id=p_request;
  if v_last is not null then
    insert into public.join_request_message_reads as r(request_id,user_id,last_message_id) values(p_request,auth.uid(),v_last)
    on conflict(request_id,user_id) do update set last_message_id=greatest(r.last_message_id,excluded.last_message_id);
  end if;
  return v_messages;
end;
$$;

create function public.recruitment_notify_managers(p_project uuid,p_request uuid,p_title text)
returns void language sql security definer set search_path='' as $$
  insert into public.notifications(recipient_id,actor_id,project_id,join_request_id,notification_type,title,body,href)
  select r.id,auth.uid(),p_project,p_request,'join_request',p_title,'Abra o painel para ver os detalhes.',
    '/projetos/'||p.slug||'/painel#candidaturas'
  from public.projects p cross join lateral (
    select p.owner_id as id union
    select m.user_id from public.project_members m left join public.project_recruitment_roles rr
      on (rr.project_id,rr.user_id)=(m.project_id,m.user_id)
      where m.project_id=p.id and m.status='active'
      and coalesce(rr.level,case when m.role in ('owner','admin') then 'manager' else 'member' end)='manager'
  ) r where p.id=p_project and r.id is distinct from auth.uid();
$$;
create or replace function public.notify_join_request_created()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.recruitment_notify_managers(new.project_id,new.id,'Nova candidatura');
  return new;
end;
$$;

create function public.recruitment_send_message(p_request uuid,p_content text)
returns void language plpgsql security definer set search_path='' as $$
declare j public.join_requests%rowtype;
begin
  select * into j from public.join_requests where id=p_request for update;
  if not found or auth.uid() is null or (j.user_id<>auth.uid() and not public.is_project_join_manager(j.project_id))
    then raise exception 'Acesso negado'; end if;
  if j.status<>'pending' then raise exception 'Conversa encerrada'; end if;
  insert into public.join_request_messages(request_id,sender_id,content) values(j.id,auth.uid(),btrim(p_content));
  if j.user_id=auth.uid() then
    perform public.recruitment_notify_managers(j.project_id,j.id,'Nova mensagem na candidatura');
  else
    update public.join_requests set recruitment_review_started_at=coalesce(recruitment_review_started_at,now()) where id=j.id;
    insert into public.notifications(recipient_id,actor_id,project_id,join_request_id,notification_type,title,body,href)
      values(j.user_id,auth.uid(),j.project_id,j.id,'join_request','Nova mensagem na candidatura',
        'Abra seu perfil para ver a mensagem.','/perfil#minhas-candidaturas');
  end if;
end;
$$;

create function public.recruitment_decide(p_request uuid,p_action text,p_vacancies uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.join_requests%rowtype; v_project uuid; v_count int; v_status text;
begin
  select project_id into v_project from public.join_requests where id=p_request;
  if not found or auth.uid() is null then raise exception 'Acesso negado'; end if;
  perform 1 from public.projects where id=v_project for update;
  select * into j from public.join_requests where id=p_request for update;
  if not found or (p_action='cancel' and j.user_id<>auth.uid()) or
    (p_action is distinct from 'cancel' and not public.is_project_join_manager(j.project_id))
    then raise exception 'Acesso negado'; end if;
  if j.status<>'pending' then raise exception 'Candidatura encerrada'; end if;
  if p_action='review' then
    update public.join_requests set recruitment_review_started_at=coalesce(recruitment_review_started_at,now()) where id=j.id;
    return jsonb_build_object('ok',true,'status','review');
  elsif p_action='approve' then
    if exists(select 1 from public.project_members where project_id=j.project_id and user_id=j.user_id and status='active')
      then raise exception 'O candidato já integra a equipe'; end if;
    if not exists(select 1 from public.join_request_vacancies where request_id=j.id) then
      insert into public.join_request_vacancies(request_id,vacancy_id,requested_title)
        select j.id,v.id,v.title from public.project_vacancies v where v.project_id=j.project_id and v.legacy and v.open;
      if coalesce(cardinality(p_vacancies),0)=0 then
        select array_agg(vacancy_id) into p_vacancies from public.join_request_vacancies where request_id=j.id;
      end if;
    end if;
    v_count:=coalesce(cardinality(p_vacancies),0);
    if v_count=0 or v_count<>(select count(*) from public.join_request_vacancies x join public.project_vacancies v on v.id=x.vacancy_id
      where x.request_id=j.id and v.project_id=j.project_id and v.id=any(p_vacancies) and v.open
      and v.positions>(select count(*) from public.join_request_vacancies a where a.vacancy_id=v.id and a.approved_at is not null and a.released_at is null))
      then raise exception 'Selecione vagas solicitadas que ainda tenham posições disponíveis'; end if;
    update public.join_request_vacancies set approved_at=now() where request_id=j.id and vacancy_id=any(p_vacancies);
    v_status:='approved';
  elsif p_action='reject' then v_status:='rejected';
  elsif p_action='cancel' then v_status:='canceled';
  else raise exception 'Ação inválida';
  end if;
  update public.join_requests set status=v_status,decided_by=case when p_action<>'cancel' then auth.uid() end,
    decided_at=case when p_action<>'cancel' then now() end where id=j.id;
  return jsonb_build_object('ok',true,'request_id',j.id,'status',v_status,'project_id',j.project_id,'user_id',j.user_id);
end;
$$;
create or replace function public.handle_join_request(p_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_action is null or p_action not in ('approve','reject') then raise exception 'Ação inválida'; end if;
  return public.recruitment_decide(p_request_id,p_action);
end;
$$;

-- All new requests and decisions must go through the vacancy-aware RPCs.
revoke insert, update, delete on public.join_requests from public,anon,authenticated;

create function public.recruitment_member_levels(p_project uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(m.user_id,case when m.user_id=p.owner_id then 'owner'
    else coalesce(r.level,case when m.role in ('owner','admin') then 'manager' else 'member' end) end),'{}'::jsonb)
  from public.projects p join public.project_members m on m.project_id=p.id
    left join public.project_recruitment_roles r on (r.project_id,r.user_id)=(m.project_id,m.user_id)
  where p.id=p_project and m.status='active' and ((p.visibility='public' and p.status<>'archived')
    or p.owner_id=auth.uid() or m.user_id=auth.uid() or public.is_project_join_manager(p.id));
$$;
create function public.recruitment_set_access(p_project uuid,p_user uuid,p_level text,p_display_role text,p_badge_color text)
returns void language plpgsql security definer set search_path='' as $$
declare previous text; p_owner uuid;
begin
  select owner_id into p_owner from public.projects where id=p_project for update;
  if p_owner is null or p_owner is distinct from auth.uid() or p_user=p_owner then raise exception 'Acesso negado'; end if;
  if p_level is null or p_level not in ('manager','reviewer','member') then raise exception 'Nível inválido'; end if;
  select coalesce(r.level,case when m.role in ('owner','admin') then 'manager' else 'member' end)
    into previous from public.project_members m left join public.project_recruitment_roles r
      on (r.project_id,r.user_id)=(m.project_id,m.user_id)
    where m.project_id=p_project and m.user_id=p_user and m.status='active' for update of m;
  if not found then raise exception 'Integrante indisponível'; end if;
  update public.project_members set display_role=nullif(btrim(p_display_role),''),badge_color=p_badge_color
    where project_id=p_project and user_id=p_user;
  if previous is distinct from p_level then
    insert into public.project_recruitment_roles(project_id,user_id,level) values(p_project,p_user,p_level)
      on conflict(project_id,user_id) do update set level=excluded.level;
    insert into public.project_recruitment_role_history(project_id,user_id,actor_id,previous_level,level)
      values(p_project,p_user,auth.uid(),previous,p_level);
    insert into public.notifications(recipient_id,actor_id,project_id,notification_type,title,body,href)
      values(p_user,auth.uid(),p_project,'join_request','Nível de acesso alterado',
        'Seu nível de acesso no projeto mudou.','/projetos/'||p_project::text);
  end if;
end;
$$;

create function public.recruitment_release_positions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.status='active' then return new; end if;
  end if;
  if old.status='active' then
    update public.join_request_vacancies x set released_at=now() from public.join_requests j
      where x.request_id=j.id and j.project_id=old.project_id and j.user_id=old.user_id
      and x.approved_at is not null and x.released_at is null;
    delete from public.project_recruitment_roles where project_id=old.project_id and user_id=old.user_id;
  end if;
  return null;
end;
$$;
create trigger recruitment_release_positions after update of status or delete on public.project_members
for each row execute function public.recruitment_release_positions();

-- A visual role never controls authorization, and existing member management cannot remove the owner.
create function public.recruitment_protect_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.projects where id=old.project_id and owner_id=old.user_id) then
    if tg_op='DELETE' then raise exception 'O dono do projeto não pode ser removido'; end if;
    if (new.project_id,new.user_id,new.role,new.status) is distinct from (old.project_id,old.user_id,old.role,old.status)
      then raise exception 'O nível de acesso do dono não pode ser alterado'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger recruitment_protect_owner before update or delete on public.project_members
for each row execute function public.recruitment_protect_owner();

revoke execute on function public.recruitment_vacancies(uuid), public.recruitment_member_levels(uuid),
 public.recruitment_save_vacancy(uuid,uuid,text,text,text[],integer,boolean),
 public.recruitment_send_application(uuid,uuid[],text), public.recruitment_applications(uuid),
 public.recruitment_messages(uuid), public.recruitment_send_message(uuid,text),
 public.recruitment_decide(uuid,text,uuid[]), public.recruitment_set_access(uuid,uuid,text,text,text),
 public.recruitment_notify_managers(uuid,uuid,text),
 public.recruitment_release_positions(), public.recruitment_protect_owner() from public,anon,authenticated;
grant execute on function public.recruitment_vacancies(uuid),public.recruitment_member_levels(uuid) to anon,authenticated;
grant execute on function public.recruitment_save_vacancy(uuid,uuid,text,text,text[],integer,boolean),
 public.recruitment_send_application(uuid,uuid[],text),public.recruitment_applications(uuid),
 public.recruitment_messages(uuid),public.recruitment_send_message(uuid,text),
 public.recruitment_decide(uuid,text,uuid[]),public.recruitment_set_access(uuid,uuid,text,text,text) to authenticated;

create function public.recruitment_init_legacy_vacancy()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.open_spots > 0 then
    insert into public.project_vacancies(project_id,title,description,positions,legacy)
      values(new.id,'Vagas gerais',left(coalesce(new.desired_profile,''),4000),new.open_spots,true);
  end if;
  return new;
end;
$$;
create trigger recruitment_init_legacy_vacancy after insert on public.projects
for each row execute function public.recruitment_init_legacy_vacancy();
revoke execute on function public.recruitment_init_legacy_vacancy() from public,anon,authenticated;
