create function public.prevent_push_device_transfer() returns trigger language plpgsql set search_path='' as $$
begin
 if old.user_id is distinct from new.user_id then raise exception 'Assinatura indisponível. Crie uma nova assinatura neste navegador.'; end if;
 return new;
end;
$$;
revoke all on function public.prevent_push_device_transfer() from public,anon,authenticated;
create trigger prevent_push_device_transfer before update of user_id on public.push_devices for each row execute function public.prevent_push_device_transfer();
