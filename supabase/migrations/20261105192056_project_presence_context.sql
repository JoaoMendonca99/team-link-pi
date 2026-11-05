-- Reuse the same membership checks, timestamps and throttle for explicit project chat contexts.
create or replace function public.panel_heartbeat(p_slug text,p_active_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare project uuid; stamp timestamptz:=clock_timestamp();
begin
 select id into project from public.projects where case when left(p_slug,3)='id:' then id::text=substr(p_slug,4) else slug=p_slug end;
 if project is null or not public.can_use_activities(project) then raise exception 'Acesso negado'; end if;
 if p_active_at is null or not isfinite(p_active_at) or p_active_at<stamp-interval '2 minutes' then return; end if;
 insert into public.project_panel_presence(project_id,user_id,last_active_at,written_at)
 values(project,auth.uid(),least(p_active_at,stamp),stamp)
 on conflict(project_id,user_id) do update set last_active_at=greatest(project_panel_presence.last_active_at,excluded.last_active_at),written_at=stamp
 where project_panel_presence.written_at<=stamp-interval '55 seconds' and project_panel_presence.last_active_at<excluded.last_active_at;
end;
$$;
