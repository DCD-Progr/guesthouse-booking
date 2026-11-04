-- All operational writes run through authorized, transactional RPCs.
create extension if not exists btree_gist;
create table public.profiles (
 id uuid primary key references auth.users(id), full_name text not null check(length(full_name) between 1 and 150),
 email text not null, department text not null default '', active boolean not null default true,
 role text not null default 'requester' check(role in ('requester','approver','admin'))
);
create table public.settings (id boolean primary key default true check(id), approver_id uuid references public.profiles(id));
insert into public.settings(id) values(true);
create table public.guesthouses (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 150),
 code text not null unique, destination text not null, timezone text not null default 'Africa/Juba',
 active boolean not null default true, instructions text not null default ''
);
create table public.rooms (
 id uuid primary key default gen_random_uuid(), guesthouse_id uuid references public.guesthouses(id),
 code text not null unique, name text not null, unit_type text not null default 'accommodation' check(unit_type in ('accommodation','break')),
 mode text not null default 'whole_room' check(mode in ('whole_room','bed','unlimited')),
 physical_room text not null default '', active boolean not null default true,
 check((unit_type='break' and guesthouse_id is null and mode='unlimited') or (unit_type='accommodation' and guesthouse_id is not null and mode<>'unlimited'))
);
create unique index one_break_unit on public.rooms(unit_type) where unit_type='break';
insert into public.rooms(code,name,unit_type,mode) values('BREAK','Break','break','unlimited');
create table public.requests (
 id uuid primary key default gen_random_uuid(), reference bigint generated always as identity unique,
 requester_id uuid not null references public.profiles(id), request_type text not null check(request_type in ('accommodation','break')),
 guesthouse_id uuid references public.guesthouses(id), start_date date not null, end_date date not null check(end_date>start_date),
 destination text not null default '', purpose text not null check(length(purpose) between 1 and 2000), requirements text not null default '' check(length(requirements)<=2000),
 status text not null default 'pending' check(status in ('pending','confirmed','rejected','cancelled')),
 replaces_id uuid references public.requests(id), submitted_at timestamptz not null default now(),
 decided_at timestamptz, decided_by uuid references public.profiles(id), decision_comment text not null default '',
 client_token uuid not null unique,
 check((request_type='break' and guesthouse_id is null) or (request_type='accommodation' and guesthouse_id is not null))
);
create table public.room_allocations (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.requests(id), room_id uuid not null references public.rooms(id),
 active boolean not null default true, confirmed_at timestamptz not null default now(),
 movement text not null default 'expected' check(movement in ('expected','checked_in','checked_out','no_show','on_break','break_completed','cancelled')),
 actual_checkin timestamptz, actual_checkout timestamptz
);
create table public.room_blocks (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id), start_date date not null,
 end_date date not null check(end_date>start_date), reason text not null check(length(reason) between 1 and 2000), active boolean not null default true,
 created_by uuid not null references public.profiles(id)
);
create table public.occupancy_slots (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id),
 allocation_id uuid unique references public.room_allocations(id), block_id uuid unique references public.room_blocks(id),
 stay daterange not null check(not isempty(stay) and lower(stay) is not null and upper(stay) is not null),
 check(num_nonnulls(allocation_id,block_id)=1),
 exclude using gist (room_id with =, stay with &&)
);
create table public.activity_events (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
 request_id uuid references public.requests(id), event text not null, detail text not null default '', occurred_at timestamptz not null default now()
);
create index requests_requester on public.requests(requester_id);
create index requests_status_dates on public.requests(status,start_date,end_date);
create index allocations_room on public.room_allocations(room_id);
create index rooms_guesthouse on public.rooms(guesthouse_id);
create index blocks_room on public.room_blocks(room_id);
create index events_request on public.activity_events(request_id);

create function public.my_role() returns text language sql stable security definer set search_path=pg_catalog,public as $$
 select role from public.profiles where id=auth.uid() and active;
$$;
create function public.is_approver() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.settings s join public.profiles p on p.id=s.approver_id where p.id=auth.uid() and p.active and p.role in ('admin','approver'));
$$;
create function public.require_role(p_admin boolean default false) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if public.my_role() is null then raise exception 'An active staff account is required.'; end if;
 if p_admin and public.my_role()<>'admin' then raise exception 'Administrator access required.'; end if;
end $$;
create function public.log_event(p_request uuid,p_event text,p_detail text default '') returns void language sql security definer set search_path=pg_catalog,public as $$
 insert into public.activity_events(actor_id,request_id,event,detail) values(auth.uid(),p_request,p_event,left(p_detail,2000));
$$;
-- Serialize operational mutations at this small installation. The exclusion constraint
-- independently guarantees room capacity even if callers race or retry.
create function public.booking_lock() returns void language sql set search_path=pg_catalog as $$ select pg_advisory_xact_lock(741852963); $$;

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.guesthouses enable row level security;
alter table public.rooms enable row level security;
alter table public.requests enable row level security;
alter table public.room_allocations enable row level security;
alter table public.room_blocks enable row level security;
alter table public.occupancy_slots enable row level security;
alter table public.activity_events enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(public.my_role() is not null and (id=auth.uid() or public.my_role()='admin' or public.is_approver()));
create policy settings_read on public.settings for select to authenticated using(public.my_role() is not null);
create policy houses_read on public.guesthouses for select to authenticated using(public.my_role() is not null);
create policy rooms_read on public.rooms for select to authenticated using(public.my_role()='admin' or public.is_approver() or exists(select 1 from public.room_allocations a join public.requests q on q.id=a.request_id where a.room_id=rooms.id and q.requester_id=auth.uid() and public.my_role() is not null));
create policy requests_read on public.requests for select to authenticated using(public.my_role() is not null and (requester_id=auth.uid() or public.my_role()='admin' or public.is_approver()));
create policy allocations_read on public.room_allocations for select to authenticated using(public.my_role() is not null and exists(select 1 from public.requests q where q.id=request_id));
create policy blocks_read on public.room_blocks for select to authenticated using(public.my_role()='admin' or public.is_approver());
create policy slots_read on public.occupancy_slots for select to authenticated using(public.my_role()='admin' or public.is_approver());
create policy events_read on public.activity_events for select to authenticated using(public.my_role()='admin' or public.is_approver() or (public.my_role() is not null and request_id in (select id from public.requests where requester_id=auth.uid())));

create function public.room_free(p_room uuid,p_start date,p_end date) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from public.occupancy_slots where room_id=p_room and stay && daterange(p_start,p_end,'[)'))
 and not exists(select 1 from public.room_allocations a where a.room_id=p_room and a.active and a.movement='checked_in' and a.actual_checkout is null);
$$;
create function public.availability(p_house uuid,p_start date,p_end date) returns table(guesthouse_id uuid,available_count bigint) language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 perform public.require_role();
 if p_start is null or p_end is null or p_end<=p_start then raise exception 'Departure must be after arrival.'; end if;
 return query select h.id,count(r.id) from public.guesthouses h left join public.rooms r on r.guesthouse_id=h.id and r.active and r.unit_type='accommodation' and public.room_free(r.id,p_start,p_end) where h.id=p_house and h.active group by h.id;
end $$;
create function public.candidate_rooms(p_request uuid) returns setof public.rooms language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare q public.requests;
begin
 perform public.require_role();
 if not public.is_approver() then raise exception 'Designated approver required.'; end if;
 select * into q from public.requests where id=p_request and status='pending';
 if not found then raise exception 'Pending request not found.'; end if;
 -- For replacement requests, the approver can retain the original room, subject
 -- to the same transaction replacing its occupancy slot during confirmation.
 return query select r.* from public.rooms r join public.guesthouses h on h.id=r.guesthouse_id where q.request_type='accommodation' and h.id=q.guesthouse_id and h.active and r.active
 and not exists(select 1 from public.occupancy_slots s left join public.room_allocations a on a.id=s.allocation_id where s.room_id=r.id and s.stay && daterange(q.start_date,q.end_date,'[)') and (a.request_id is distinct from q.replaces_id or q.replaces_id is null))
 and not exists(select 1 from public.room_allocations a where a.room_id=r.id and a.active and a.movement='checked_in' and a.actual_checkout is null);
end $$;
create function public.submit_request(p_type text,p_house uuid,p_start date,p_end date,p_destination text,p_purpose text,p_requirements text,p_token uuid,p_replaces uuid default null) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; old_q public.requests;
begin
 perform public.booking_lock(); perform public.require_role();
 select id into v_id from public.requests where client_token=p_token and requester_id=auth.uid();
 if found then return v_id; end if;
 if p_type is null or p_type not in ('accommodation','break') or p_start is null or p_end is null or p_end<=p_start or p_start<(now() at time zone coalesce((select timezone from public.guesthouses where id=p_house),'Africa/Juba'))::date then raise exception 'Choose a valid future date range and request type.'; end if;
 if p_type='accommodation' and not exists(select 1 from public.guesthouses where id=p_house and active) then raise exception 'Select an active guesthouse.'; end if;
 if p_replaces is not null then
 select * into old_q from public.requests where id=p_replaces and requester_id=auth.uid() and status='confirmed';
 if not found or old_q.request_type<>p_type or exists(select 1 from public.room_allocations where request_id=p_replaces and movement not in ('expected','on_break')) then raise exception 'Only an unstarted confirmed stay can be replaced.'; end if;
 if exists(select 1 from public.requests where replaces_id=p_replaces and status='pending') then raise exception 'A change request is already pending.'; end if;
 end if;
 insert into public.requests(requester_id,request_type,guesthouse_id,start_date,end_date,destination,purpose,requirements,client_token,replaces_id)
 values(auth.uid(),p_type,case when p_type='break' then null else p_house end,p_start,p_end,left(coalesce(p_destination,''),300),trim(p_purpose),coalesce(p_requirements,''),p_token,p_replaces) returning id into v_id;
 perform public.log_event(v_id,'submitted'); return v_id;
end $$;
create function public.decide_request(p_request uuid,p_approve boolean,p_room uuid default null,p_comment text default '') returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.requests; old_q public.requests; r public.rooms; v_alloc uuid; v_room uuid;
begin
 perform public.booking_lock(); perform public.require_role();
 if not public.is_approver() then raise exception 'Designated approver required.'; end if;
 select * into q from public.requests where id=p_request for update;
 if not found then raise exception 'Request not found.'; end if;
 if p_approve is null then raise exception 'A decision is required.'; end if;
 if q.requester_id=auth.uid() then raise exception 'You cannot approve or reject your own request.'; end if;
 if q.status='confirmed' and p_approve then
 select id into v_alloc from public.room_allocations where request_id=q.id and active; return v_alloc;
 end if;
 if q.status='rejected' and not p_approve then return q.id; end if;
 if q.status<>'pending' then raise exception 'Request is no longer pending.'; end if;
 if not p_approve then
 if length(trim(p_comment))=0 then raise exception 'Give a reason for rejection.'; end if;
 update public.requests set status='rejected',decided_by=auth.uid(),decided_at=now(),decision_comment=left(p_comment,2000) where id=q.id;
 perform public.log_event(q.id,'rejected',p_comment); return q.id;
 end if;
 if not exists(select 1 from public.profiles where id=q.requester_id and active) then raise exception 'Requester account is inactive.'; end if;
 if q.start_date<(now() at time zone coalesce((select timezone from public.guesthouses where id=q.guesthouse_id),'Africa/Juba'))::date then raise exception 'Request dates have passed. Ask for a new request.'; end if;
 if q.replaces_id is not null then
 select * into old_q from public.requests where id=q.replaces_id and status='confirmed' for update;
 if not found or old_q.requester_id<>q.requester_id or exists(select 1 from public.room_allocations where request_id=old_q.id and movement not in ('expected','on_break')) then raise exception 'Original stay is no longer eligible for replacement.'; end if;
 delete from public.occupancy_slots where allocation_id in (select id from public.room_allocations where request_id=old_q.id);
 update public.room_allocations set active=false,movement='cancelled' where request_id=old_q.id;
 update public.requests set status='cancelled' where id=old_q.id;
 perform public.log_event(old_q.id,'replaced',q.id::text);
 end if;
 if q.request_type='break' then select id into v_room from public.rooms where unit_type='break' and active;
 else
 select * into r from public.rooms where id=p_room and active and unit_type='accommodation' and guesthouse_id=q.guesthouse_id;
 if not found or not exists(select 1 from public.guesthouses where id=q.guesthouse_id and active) then raise exception 'Choose an active room in the requested guesthouse.'; end if;
 if not public.room_free(r.id,q.start_date,q.end_date) then raise exception 'Room no longer available. Refresh and select another room.'; end if;
 v_room:=r.id;
 end if;
 if v_room is null then raise exception 'The booking unit is unavailable.'; end if;
 insert into public.room_allocations(request_id,room_id,movement) values(q.id,v_room,case when q.request_type='break' then 'on_break' else 'expected' end) returning id into v_alloc;
 if q.request_type='accommodation' then insert into public.occupancy_slots(room_id,allocation_id,stay) values(v_room,v_alloc,daterange(q.start_date,q.end_date,'[)')); end if;
 update public.requests set status='confirmed',decided_at=now(),decided_by=auth.uid(),decision_comment=left(p_comment,2000) where id=q.id;
 perform public.log_event(q.id,'confirmed',v_room::text); return v_alloc;
end $$;
create function public.cancel_request(p_request uuid,p_reason text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.requests;
begin
 perform public.booking_lock(); perform public.require_role();
 select * into q from public.requests where id=p_request for update;
 if not found or (q.requester_id<>auth.uid() and public.my_role()<>'admin') then raise exception 'Request unavailable.'; end if;
 if q.status='cancelled' then return; end if;
 if q.status not in ('pending','confirmed') then raise exception 'This request cannot be cancelled.'; end if;
 if length(trim(p_reason))=0 then raise exception 'A cancellation reason is required.'; end if;
 if exists(select 1 from public.room_allocations where request_id=q.id and movement in ('checked_in','checked_out','break_completed')) then raise exception 'Contact the administrator to close an active or completed stay.'; end if;
 delete from public.occupancy_slots where allocation_id in(select id from public.room_allocations where request_id=q.id);
 update public.room_allocations set active=false,movement='cancelled' where request_id=q.id;
 update public.requests set status='cancelled' where id=q.id;
 perform public.log_event(q.id,'cancelled',p_reason);
end $$;
create function public.save_guesthouse(p_id uuid,p_name text,p_code text,p_destination text,p_timezone text,p_active boolean,p_instructions text) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
 perform public.booking_lock(); perform public.require_role(true);
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
 insert into public.guesthouses(id,name,code,destination,timezone,active,instructions) values(coalesce(p_id,gen_random_uuid()),trim(p_name),trim(p_code),trim(p_destination),p_timezone,p_active,coalesce(p_instructions,''))
 on conflict(id) do update set name=excluded.name,code=excluded.code,destination=excluded.destination,timezone=excluded.timezone,active=excluded.active,instructions=excluded.instructions returning id into v_id;
 perform public.log_event(null,'guesthouse_saved',v_id::text);return v_id;
end $$;
create function public.save_room(p_id uuid,p_house uuid,p_name text,p_code text,p_mode text,p_physical text,p_active boolean) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
 perform public.booking_lock(); perform public.require_role(true);
 if p_id is not null and exists(select 1 from public.rooms where id=p_id and unit_type='break') then raise exception 'Break is a protected unlimited unit.'; end if;
 if p_id is not null and exists(select 1 from public.rooms where id=p_id and guesthouse_id is distinct from p_house) and exists(select 1 from public.room_allocations where room_id=p_id) then raise exception 'A room with booking history cannot move guesthouses.'; end if;
 insert into public.rooms(id,guesthouse_id,name,code,mode,physical_room,active) values(coalesce(p_id,gen_random_uuid()),p_house,trim(p_name),trim(p_code),p_mode,coalesce(p_physical,''),p_active)
 on conflict(id) do update set guesthouse_id=excluded.guesthouse_id,name=excluded.name,code=excluded.code,mode=excluded.mode,physical_room=excluded.physical_room,active=excluded.active returning id into v_id;
 perform public.log_event(null,'room_saved',v_id::text); return v_id;
end $$;
create function public.create_block(p_room uuid,p_start date,p_end date,p_reason text) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
 perform public.booking_lock(); perform public.require_role(true);
 if p_start is null or p_end is null or p_end<=p_start then raise exception 'Choose a valid closure interval.'; end if;
 if not exists(select 1 from public.rooms where id=p_room and unit_type='accommodation') then raise exception 'Select an accommodation room.'; end if;
 if not public.room_free(p_room,p_start,p_end) then raise exception 'Closure conflicts with a reservation, existing closure or unresolved check-in. Resolve the affected stays first.'; end if;
 insert into public.room_blocks(room_id,start_date,end_date,reason,created_by) values(p_room,p_start,p_end,trim(p_reason),auth.uid()) returning id into v_id;
 insert into public.occupancy_slots(room_id,block_id,stay) values(p_room,v_id,daterange(p_start,p_end,'[)'));
 perform public.log_event(null,'closure_created',v_id::text);return v_id;
end $$;
create function public.release_block(p_block uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.booking_lock(); perform public.require_role(true);
 update public.room_blocks set active=false where id=p_block;
 if not found then raise exception 'Closure not found.'; end if;
 delete from public.occupancy_slots where block_id=p_block;
 perform public.log_event(null,'closure_released',p_block::text);
end $$;
create function public.set_movement(p_request uuid,p_movement text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.room_allocations; q public.requests; local_today date;
begin
 perform public.booking_lock(); perform public.require_role(true);
 select * into q from public.requests where id=p_request and status='confirmed';
 select * into a from public.room_allocations where request_id=p_request and active for update;
 if q.id is null or a.id is null then raise exception 'Confirmed stay not found.'; end if;
 if a.movement=p_movement then return; end if;
 select (now() at time zone coalesce(h.timezone,'Africa/Juba'))::date into local_today from public.rooms r left join public.guesthouses h on h.id=r.guesthouse_id where r.id=a.room_id;
 if p_movement='checked_in' and a.movement='expected' and q.request_type='accommodation' then
 if local_today<q.start_date or local_today>=q.end_date then raise exception 'Check-in must occur within the booked stay.'; end if;
 if exists(select 1 from public.room_allocations where room_id=a.room_id and id<>a.id and active and movement='checked_in' and actual_checkout is null) then raise exception 'Room is still occupied.'; end if;
 update public.room_allocations set movement=p_movement,actual_checkin=now() where id=a.id;
 elsif p_movement='checked_out' and a.movement='checked_in' then
 update public.room_allocations set movement=p_movement,actual_checkout=now() where id=a.id;
 -- Checkout releases remaining nights, including an early departure.
 delete from public.occupancy_slots where allocation_id=a.id;
 elsif p_movement='no_show' and a.movement='expected' and local_today>=q.start_date then
 update public.room_allocations set movement=p_movement where id=a.id;
 delete from public.occupancy_slots where allocation_id=a.id;
 elsif p_movement='break_completed' and a.movement='on_break' and local_today>=q.start_date then
 update public.room_allocations set movement=p_movement,actual_checkout=now() where id=a.id;
 else raise exception 'Invalid movement transition.'; end if;
 perform public.log_event(q.id,p_movement);
end $$;
create function public.set_staff(p_user uuid,p_name text,p_department text,p_role text,p_active boolean,p_designate boolean default false) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.booking_lock(); perform public.require_role(true);
 if p_user=auth.uid() and (p_role<>'admin' or not p_active) then raise exception 'You cannot remove your own admin access.'; end if;
 if p_role not in ('admin','approver','requester') then raise exception 'Invalid role.'; end if;
 if p_designate and (not p_active or p_role not in ('admin','approver')) then raise exception 'Approver must be active and authorized.'; end if;
 update public.profiles set full_name=trim(p_name),department=coalesce(p_department,''),role=p_role,active=p_active where id=p_user;
 if not found then raise exception 'Invite the user first.'; end if;
 if p_designate then update public.settings set approver_id=p_user;
 elsif not p_active or p_role='requester' then update public.settings set approver_id=null where approver_id=p_user; end if;
 perform public.log_event(null,'staff_updated',p_user::text);
end $$;
-- Auth accounts are provisioned through invite-only administration. No signup trigger
-- grants access. The invite function creates a profile only after admin authorization.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.settings,public.guesthouses,public.rooms,public.requests,public.room_allocations,public.room_blocks,public.occupancy_slots,public.activity_events to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.my_role(),public.is_approver() to authenticated;
grant execute on function public.availability(uuid,date,date),public.candidate_rooms(uuid),public.submit_request(text,uuid,date,date,text,text,text,uuid,uuid),public.decide_request(uuid,boolean,uuid,text),public.cancel_request(uuid,text),public.save_guesthouse(uuid,text,text,text,text,boolean,text),public.save_room(uuid,uuid,text,text,text,text,boolean),public.create_block(uuid,date,date,text),public.release_block(uuid),public.set_movement(uuid,text),public.set_staff(uuid,text,text,text,boolean,boolean) to authenticated;

create function public.provision_invited_staff(p_user uuid,p_name text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_email text;
begin
 perform public.booking_lock();perform public.require_role(true);
 select lower(email) into v_email from auth.users where id=p_user;
 if v_email is null then raise exception 'Invited account not found.';end if;
 insert into public.profiles(id,email,full_name,role) values(p_user,v_email,trim(p_name),'requester') on conflict(id) do nothing;
 perform public.log_event(null,'staff_invited',p_user::text);
end $$;
revoke execute on function public.provision_invited_staff(uuid,text) from public,anon;
grant execute on function public.provision_invited_staff(uuid,text) to authenticated;
