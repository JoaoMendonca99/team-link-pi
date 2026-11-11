CREATE OR REPLACE FUNCTION concept_private.write_cache(p_type text, p_target uuid, p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare labels text[]:=concept_private.labels(p_values);
begin
 if p_type='skill' then update public.profiles set skills=labels where id=p_target and skills is distinct from labels;
 elsif p_type='interest' then update public.profiles set interests=labels where id=p_target and interests is distinct from labels;
 elsif p_type='requirement' then update public.project_vacancies set skills=labels where id=p_target and skills is distinct from labels;
 elsif p_type='tag' then
  delete from public.project_tags where project_id=p_target and not(tag=any(labels));
  insert into public.project_tags(project_id,tag) select p_target,t from unnest(labels) t on conflict (project_id, lower(tag)) do nothing;
 end if;
end $function$;
