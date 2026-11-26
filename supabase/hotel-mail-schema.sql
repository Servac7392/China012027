create table public.hotel_import_devices (
  id text primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true
);
create table public.hotel_mail_events (event_id text primary key, processed_at timestamptz not null default now());
create table public.hotel_mail_bookings (
  booking_key text primary key, source_at timestamptz not null,
  hotel jsonb not null, state text not null, target_key text,
  applied_revision uuid, locked_fields text[] not null default '{}', reason text not null default ''
);
create table public.hotel_mail_meta (key text primary key, info jsonb not null);
alter table public.hotel_import_devices enable row level security;
alter table public.hotel_mail_events enable row level security;
alter table public.hotel_mail_bookings enable row level security;
alter table public.hotel_mail_meta enable row level security;
revoke all on public.hotel_import_devices, public.hotel_mail_events, public.hotel_mail_bookings, public.hotel_mail_meta from public,anon,authenticated;
grant all on public.hotel_import_devices, public.hotel_mail_events, public.hotel_mail_bookings, public.hotel_mail_meta to service_role;

create function public.hotel_mail_value(h jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('name',h->>'name','address',coalesce(h->>'address',''),
 'addressZh',coalesce(h->>'addressZh',''),'stay',(h->>'checkin')||' — '||(h->>'checkout'),
 'price',((h->>'totalMinor')::numeric/100)::numeric(12,2)::text||' '||(h->>'currency'), 'url','');
$$;
revoke all on function public.hotel_mail_value(jsonb) from public,anon,authenticated;
grant execute on function public.hotel_mail_value(jsonb) to service_role;

create function public.import_mail_hotel(e jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 h jsonb:=e->'hotel'; old public.hotel_mail_bookings; current public.shared_trip_records;
 target text; vals jsonb; locks text[]:='{}'; rev uuid; reason text:=''; info jsonb;
 kind text:=e->>'kind'; source_time timestamptz:=(e->>'sourceAt')::timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext('china2027-hotel-mail'));
 insert into public.hotel_mail_events(event_id) values(e->>'eventId') on conflict do nothing;
 if not found then return jsonb_build_object('action','duplicate'); end if;
 select * into old from public.hotel_mail_bookings where booking_key=e->>'bookingKey';
 if found and old.source_at>=source_time then return jsonb_build_object('action','skipped'); end if;
 if (e->>'complete')::boolean and old.booking_key is null and
 ((h->>'checkout')<'2027-01-15' or (h->>'checkin')>'2027-01-26') then return jsonb_build_object('action','skipped'); end if;
 if kind='cancelled' and old.booking_key is not null then h:=old.hotel; end if;
 select v.key into target from (values
 ('beijing','2027-01-15','2027-01-16','15:hotel'),
 ('changzhou','2027-01-16','2027-01-17','16:hotel'),
 ('hangzhou','2027-01-17','2027-01-18','17:hotel'),
 ('shanghai','2027-01-18','2027-01-20','18–20:hotel'),
 ('zhangjiajie','2027-01-20','2027-01-23','20:hotel'),
 ('chongqing','2027-01-23','2027-01-25','23–24:hotel'),
 ('beijing','2027-01-25','2027-01-26','25:hotel')) v(city,ci,co,key)
 where v.city=h->>'city' and v.ci=h->>'checkin' and v.co=h->>'checkout';
 if not (e->>'verified')::boolean then reason:='Не удалось подтвердить отправителя';
 elsif kind<>'cancelled' and not (e->>'complete')::boolean then reason:='В письме не хватает данных бронирования';
 elsif target is null then reason:='Город или даты не совпали с участком маршрута'; end if;
 if old.applied_revision is not null and old.target_key is distinct from target then
   reason:='Даты или город бронирования изменились; проверьте маршрут';target:=old.target_key;
 end if;
 select * into current from public.shared_trip_records where key=target for update;
 if reason='' and current.key is not null then
   if old.applied_revision is not null then
     if old.target_key<>target or old.applied_revision<>current.revision then reason:='Карточка изменена вручную; проверьте новые данные'; end if;
     locks:=old.locked_fields;
   elsif lower(trim(current.value->>'name'))=lower(trim(h->>'name')) then
     select coalesce(array_agg(j.key),'{}') into locks from jsonb_each_text(current.value) j where length(trim(j.value))>0;
   else reason:='На эти даты уже указан другой отель'; end if;
 end if;
 if reason='' and kind='cancelled' and old.applied_revision is null then reason:='Отмена брони требует проверки'; end if;
 if reason='' then
   vals:=public.hotel_mail_value(h);
   if current.key is not null then
     select current.value||coalesce(jsonb_object_agg(j.key,j.value),'{}') into vals from jsonb_each(vals) j where not (j.key=any(locks));
   end if;
   rev:=gen_random_uuid();
   insert into public.shared_trip_records(key,value,revision) values(target,vals,rev)
   on conflict(key) do update set value=excluded.value,revision=excluded.revision;
   info:=jsonb_build_object('source','Trip.com','sourceAt',source_time,'state',kind,
     'room',h->>'room','checkinTime',h->>'checkinTime','checkoutTime',h->>'checkoutTime',
     'paid',h->'paid','needsAttention',kind='cancelled','reason',case when kind='cancelled' then 'Бронирование отменено' else '' end);
 else
   rev:=old.applied_revision;
   info:=jsonb_build_object('source','Trip.com','sourceAt',source_time,'state','review',
     'needsAttention',true,'reason',reason,'proposal',h);
 end if;
 insert into public.hotel_mail_bookings(booking_key,source_at,hotel,state,target_key,applied_revision,locked_fields,reason)
 values(e->>'bookingKey',source_time,h,case when reason='' then kind when kind='cancelled' then 'review_cancelled' else 'review' end,target,rev,locks,reason)
 on conflict(booking_key) do update set source_at=excluded.source_at,hotel=excluded.hotel,state=excluded.state,
 target_key=excluded.target_key,applied_revision=excluded.applied_revision,locked_fields=excluded.locked_fields,reason=excluded.reason;
 if target is not null then
   insert into public.hotel_mail_meta(key,info) values(target,info) on conflict(key) do update set info=excluded.info;
 end if;
 return jsonb_build_object('action',case when reason='' then 'applied' else 'review' end,'target',target);
end;
$$;
revoke all on function public.import_mail_hotel(jsonb) from public,anon,authenticated;
grant execute on function public.import_mail_hotel(jsonb) to service_role;

create function public.resolve_mail_hotel(p_key text,p_revision uuid,p_accept boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.hotel_mail_bookings; current public.shared_trip_records; rev uuid;
begin
 perform pg_advisory_xact_lock(hashtext('china2027-hotel-mail'));
 select * into current from public.shared_trip_records where key=p_key for update;
 if current.revision is distinct from p_revision then return jsonb_build_object('error','conflict'); end if;
 select * into b from public.hotel_mail_bookings where target_key=p_key and state in ('review','review_cancelled') order by source_at desc limit 1;
 if not found then return jsonb_build_object('error','conflict'); end if;
 if p_accept then
   if b.hotel->>'name' is null or b.hotel->>'totalMinor' is null then return jsonb_build_object('error','invalid'); end if;
   rev:=gen_random_uuid();
   insert into public.shared_trip_records(key,value,revision) values(p_key,public.hotel_mail_value(b.hotel),rev)
   on conflict(key) do update set value=excluded.value,revision=excluded.revision;
   update public.hotel_mail_bookings set state=case when b.state='review_cancelled' then 'cancelled' else 'confirmed' end,applied_revision=rev,locked_fields='{}',reason='' where booking_key=b.booking_key;
   update public.hotel_mail_meta set info=jsonb_build_object('source','Trip.com','sourceAt',b.source_at,'state',case when b.state='review_cancelled' then 'cancelled' else 'confirmed' end,
     'room',b.hotel->>'room','checkinTime',b.hotel->>'checkinTime','checkoutTime',b.hotel->>'checkoutTime',
     'paid',b.hotel->'paid','needsAttention',b.state='review_cancelled','reason',case when b.state='review_cancelled' then 'Бронирование отменено' else '' end) where key=p_key;
 else
   update public.hotel_mail_bookings set state='ignored',reason='' where booking_key=b.booking_key;
   update public.hotel_mail_meta set info=jsonb_build_object('state','manual','needsAttention',false,'reason','') where key=p_key;
 end if;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.resolve_mail_hotel(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.resolve_mail_hotel(text,uuid,boolean) to service_role;
