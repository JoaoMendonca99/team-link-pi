-- The bucket stays private. Only the Edge Function uses the Storage API for these objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', false, 2097152, array['image/png']);

create schema project_media_private;
revoke all on schema project_media_private from public, anon, authenticated;
grant usage on schema project_media_private to authenticated;

create table project_media_private.images (
  project_id uuid primary key references public.projects(id) on delete cascade,
  path text not null unique
);
create table project_media_private.uploads (
  ticket uuid primary key,
  uploader uuid not null references public.profiles(id) on delete cascade,
  project_id uuid,
  path text unique,
  expected_path text,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table project_media_private.images enable row level security;
alter table project_media_private.uploads enable row level security;
revoke all on all tables in schema project_media_private from public, anon, authenticated;

-- Registration happens before upload. Discard competes safely with the transactional save.
create function public.manage_project_image_upload(
  p_ticket uuid, p_user uuid, p_project uuid, p_path text, p_expected_path text, p_discard boolean
) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_discard then
    delete from project_media_private.uploads where ticket=p_ticket and uploader=p_user;
    return found;
  end if;
  if p_path is not null and p_path !~ '^[a-f0-9-]{36}\.png$' then
    raise exception 'Imagem inválida.' using errcode='22023';
  end if;
  insert into project_media_private.uploads(ticket,uploader,project_id,path,expected_path)
  values (p_ticket,p_user,p_project,p_path,p_expected_path);
  return true;
end $$;
revoke all on function public.manage_project_image_upload(uuid,uuid,uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.manage_project_image_upload(uuid,uuid,uuid,text,text,boolean) to service_role;

create function project_media_private.apply(p_project uuid, p_original_project uuid, p_ticket uuid)
returns void language plpgsql security definer set search_path='' as $$
declare upload project_media_private.uploads; previous text;
begin
  if (p_original_project is not null and p_original_project <> p_project)
     or not coalesce(public.is_project_join_manager(p_project),false) then
    raise exception 'Acesso não permitido.' using errcode='42501';
  end if;
  -- The project save already holds this lock. Keep a common lock order for all callers.
  perform 1 from public.projects where id=p_project for update;
  delete from project_media_private.uploads where ticket=p_ticket and uploader=auth.uid()
    and project_id is not distinct from p_original_project and expires_at>now()
    returning * into upload;
  if not found then raise exception 'Imagem indisponível.' using errcode='22023'; end if;
  select path into previous from project_media_private.images where project_id=p_project;
  if previous is distinct from upload.expected_path then
    raise exception 'A imagem foi alterada por outra pessoa.' using errcode='40001';
  end if;
  if upload.path is null then
    delete from project_media_private.images where project_id=p_project;
  else
    if not exists(select 1 from storage.objects where bucket_id='project-images' and name=upload.path) then
      raise exception 'Imagem indisponível.' using errcode='22023';
    end if;
    insert into project_media_private.images(project_id,path) values(p_project,upload.path)
    on conflict(project_id) do update set path=excluded.path;
  end if;
end $$;
revoke all on function project_media_private.apply(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function project_media_private.apply(uuid,uuid,uuid) to authenticated;

create function public.get_project_image_ref(p_project uuid)
returns text language sql stable security definer set search_path='' as $$
  select image.path from project_media_private.images image join public.projects p on p.id=image.project_id
  where p.id=p_project and (
    (p.visibility='public' and p.status<>'archived') or
    (auth.uid() is not null and (p.owner_id=auth.uid() or public.is_project_join_manager(p.id)
      or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=auth.uid() and m.status='active')))
  )
$$;
revoke all on function public.get_project_image_ref(uuid) from public, anon, authenticated;
grant execute on function public.get_project_image_ref(uuid) to anon, authenticated;

-- One bounded query for the visible cards. Only the requesting user's like is returned.
create function public.get_project_card_state(p_projects uuid[])
returns table(project_id uuid, image_ref text, likes_count bigint, liked boolean)
language sql stable security definer set search_path='' as $$
  with requested as (
    select distinct p.id, (p.visibility='public' and p.status<>'archived') or
      (auth.uid() is not null and public.is_project_join_manager(p.id)) as may_read_likes
    from unnest(coalesce(p_projects[1:60],'{}')) target(id) join public.projects p on p.id=target.id
    where (p.visibility='public' and p.status<>'archived') or
      (auth.uid() is not null and (p.owner_id=auth.uid() or public.is_project_join_manager(p.id)
        or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=auth.uid() and m.status='active')))
  )
  select r.id, public.get_project_image_ref(r.id), case when r.may_read_likes then stats.total end,
    coalesce(stats.liked,false)
  from requested r
  left join lateral (
    select count(*) total, bool_or(l.user_id=auth.uid()) liked
    from public.project_likes l where r.may_read_likes and l.project_id=r.id
  ) stats on true
$$;
revoke all on function public.get_project_card_state(uuid[]) from public, anon, authenticated;
grant execute on function public.get_project_card_state(uuid[]) to anon, authenticated;

create or replace function public.save_project_concepts(p_form jsonb, p_academic jsonb, p_tag_choices jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f jsonb:=p_form; tags jsonb; vacancies jsonb:='[]'; v jsonb; vals jsonb; prior_skills text[]; prior_vacancies jsonb:='[]'; saved_slug text; wanted_status text:=p_form->>'p_status'; pid uuid:=nullif(p_form->>'p_project_id','')::uuid;
begin
 if pid is not null and wanted_status in ('completed','archived') then f:=jsonb_set(f,'{p_status}',to_jsonb((select status from public.projects where id=pid)));end if;
 tags:=concept_private.prepare('tag',pid,p_tag_choices);
 if pid is not null then prior_vacancies:=public.recruitment_vacancies(pid); end if;
 for v in select * from jsonb_array_elements(coalesce(p_form->'p_vacancies','[]')) loop
  vals:=concept_private.prepare('requirement',nullif(v->>'id','')::uuid,coalesce(v->'concept_refs','[]'));
  select array(select jsonb_array_elements_text(entry->'skills')) into prior_skills
  from jsonb_array_elements(prior_vacancies) entry where entry->>'id'=v->>'id';
  vacancies:=vacancies||jsonb_build_array(v||jsonb_build_object('skills',to_jsonb(coalesce(prior_skills,'{}')),'concept_refs',vals));
 end loop;
 f:=f||jsonb_build_object('p_tags',to_jsonb(concept_private.labels(tags)),'p_vacancies',vacancies);
 saved_slug:=public.save_project_form_with_academics(f,p_academic);
 select id into pid from public.projects where projects.slug=saved_slug;
 perform concept_private.apply_choices('tag',pid,tags);
 if p_form ? 'p_image_ticket' then
  perform project_media_private.apply(pid,nullif(p_form->>'p_project_id','')::uuid,(p_form->>'p_image_ticket')::uuid);
 end if;
 if pid is not null and wanted_status in ('completed','archived') then perform lifecycle_private.finalize(pid,wanted_status);end if;
 return saved_slug;
end $function$
;
