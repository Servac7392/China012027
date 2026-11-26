create table public.hotel_mail_sync (
 id boolean primary key default true check(id),
 state text not null default 'idle', request_id uuid,
 requested_at timestamptz, worker_seen_at timestamptz,
 checked_at timestamptz, counts jsonb not null default '{}'
);
insert into public.hotel_mail_sync(id) values(true);
alter table public.hotel_mail_sync enable row level security;
revoke all on public.hotel_mail_sync from public,anon,authenticated;
grant all on public.hotel_mail_sync to service_role;

create function public.request_hotel_mail_refresh() returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.hotel_mail_sync;
begin
 select * into s from public.hotel_mail_sync where id=true for update;
 -- A single coalesced request prevents a public button from flooding the mailbox.
 if s.state in ('queued','running') or s.requested_at>now()-interval '30 seconds' then return to_jsonb(s)-'id'; end if;
 update public.hotel_mail_sync set state='queued',request_id=gen_random_uuid(),requested_at=now() where id=true returning * into s;
 return to_jsonb(s)-'id';
end;$$;
revoke all on function public.request_hotel_mail_refresh() from public,anon,authenticated;
grant execute on function public.request_hotel_mail_refresh() to service_role;

create function public.hotel_mail_worker_control(p_operation text,p_request_id uuid default null,p_ok boolean default true,p_counts jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.hotel_mail_sync;
begin
 select * into s from public.hotel_mail_sync where id=true for update;
 update public.hotel_mail_sync set worker_seen_at=now() where id=true;
 if p_operation='started' then
   if (p_request_id is not null and s.request_id=p_request_id) or (p_request_id is null and s.state<>'queued') then
     update public.hotel_mail_sync set state='running' where id=true;
   end if;
 elsif p_operation='complete' then
   update public.hotel_mail_sync set checked_at=now(),counts=p_counts,
     state=case when (p_request_id is not null and s.request_id=p_request_id) or (p_request_id is null and s.state<>'queued')
       then case when p_ok then 'complete' else 'error' end else state end where id=true;
 elsif p_operation<>'poll' then raise exception 'invalid operation'; end if;
 select * into s from public.hotel_mail_sync where id=true;
 return to_jsonb(s)-'id';
end;$$;
revoke all on function public.hotel_mail_worker_control(text,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.hotel_mail_worker_control(text,uuid,boolean,jsonb) to service_role;
