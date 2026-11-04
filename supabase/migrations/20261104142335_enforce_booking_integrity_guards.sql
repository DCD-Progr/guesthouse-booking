-- Defense in depth: enforce invariants even if a future privileged API omits its checks.
create function public.guard_staff_commitments() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare parent public.requests;
begin
 perform public.booking_lock();
 if TG_OP='UPDATE' and (new.requester_id,new.request_type,new.guesthouse_id,new.start_date,new.end_date,new.replaces_id) is distinct from (old.requester_id,old.request_type,old.guesthouse_id,old.start_date,old.end_date,old.replaces_id)
 and exists(select 1 from public.room_allocations where request_id=old.id) then
 raise exception 'Allocated request identity and dates are immutable. Submit a change request.';
 end if;
 if new.status not in ('pending','confirmed') then return new; end if;
 if new.replaces_id is not null then
 select * into parent from public.requests where id=new.replaces_id;
 if parent.id is null or parent.id=new.id or parent.requester_id<>new.requester_id or parent.request_type<>new.request_type then
 raise exception 'Replacement must reference another request of the same traveler and type.';
 end if;
 end if;
 if exists(select 1 from public.requests x where x.id<>new.id and x.requester_id=new.requester_id and x.status in ('pending','confirmed') and x.start_date<new.end_date and x.end_date>new.start_date
 and not coalesce((new.status='pending' and x.status='confirmed' and new.replaces_id=x.id),false)
 and not coalesce((new.status='confirmed' and x.status='pending' and x.replaces_id=new.id),false)) then
 raise exception 'Staff dates overlap another room or Break request.';
 end if;
 return new;
end $$;
revoke all on function public.guard_staff_commitments() from public,anon,authenticated;
create trigger staff_commitments_guard before insert or update on public.requests for each row execute function public.guard_staff_commitments();
create unique index one_pending_replacement on public.requests(replaces_id) where replaces_id is not null and status='pending';

create function public.guard_booking_integrity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.booking_lock();
 -- Deferred until COMMIT, so atomic approval/replacement/cancellation can update all related rows.
 if exists(select 1 from public.requests q where q.status='confirmed' and not exists(select 1 from public.room_allocations a where a.request_id=q.id and a.active)) then
 raise exception 'Booking integrity: a confirmed request requires an active allocation.'; end if;
 if exists(select 1 from public.room_allocations a join public.requests q on q.id=a.request_id join public.rooms r on r.id=a.room_id
 where (a.active and q.status<>'confirmed') or q.request_type<>r.unit_type or (q.request_type='accommodation' and r.guesthouse_id is distinct from q.guesthouse_id)) then
 raise exception 'Booking integrity: allocation does not match its request and guesthouse.'; end if;
 if exists(select 1 from public.room_allocations a join public.requests q on q.id=a.request_id
 where a.active and q.request_type='accommodation' and a.movement in ('expected','checked_in') and not exists(select 1 from public.occupancy_slots s where s.allocation_id=a.id and s.room_id=a.room_id and s.stay=daterange(q.start_date,q.end_date,'[)'))) then
 raise exception 'Booking integrity: an open room allocation requires a matching capacity slot.'; end if;
 if exists(select 1 from public.occupancy_slots s join public.room_allocations a on a.id=s.allocation_id join public.requests q on q.id=a.request_id
 where not a.active or q.status<>'confirmed' or q.request_type<>'accommodation' or a.movement not in ('expected','checked_in') or s.room_id<>a.room_id or s.stay<>daterange(q.start_date,q.end_date,'[)')) then
 raise exception 'Booking integrity: reservation slot does not match an open stay.'; end if;
 if exists(select 1 from public.room_blocks b where b.active and not exists(select 1 from public.occupancy_slots s where s.block_id=b.id and s.room_id=b.room_id and s.stay=daterange(b.start_date,b.end_date,'[)'))) then
 raise exception 'Booking integrity: active closure requires a matching capacity slot.'; end if;
 if exists(select 1 from public.occupancy_slots s join public.room_blocks b on b.id=s.block_id where not b.active or s.room_id<>b.room_id or s.stay<>daterange(b.start_date,b.end_date,'[)')) then
 raise exception 'Booking integrity: closure slot does not match its closure.'; end if;
 if exists(select 1 from public.room_allocations a join public.requests q on q.id=a.request_id where a.active and ((q.request_type='break' and a.movement not in ('on_break','break_completed')) or (q.request_type='accommodation' and a.movement in ('on_break','break_completed','cancelled')))) then
 raise exception 'Booking integrity: movement is invalid for this unit type.'; end if;
 return null;
end $$;
revoke all on function public.guard_booking_integrity() from public,anon,authenticated;
create constraint trigger requests_integrity after insert or update or delete on public.requests deferrable initially deferred for each row execute function public.guard_booking_integrity();
create constraint trigger allocations_integrity after insert or update or delete on public.room_allocations deferrable initially deferred for each row execute function public.guard_booking_integrity();
create constraint trigger slots_integrity after insert or update or delete on public.occupancy_slots deferrable initially deferred for each row execute function public.guard_booking_integrity();
create constraint trigger blocks_integrity after insert or update or delete on public.room_blocks deferrable initially deferred for each row execute function public.guard_booking_integrity();
create constraint trigger rooms_integrity after update on public.rooms deferrable initially deferred for each row execute function public.guard_booking_integrity();
