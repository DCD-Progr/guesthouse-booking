create or replace function public.decide_request(p_request uuid,p_approve boolean,p_room uuid default null,p_comment text default '') returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.requests; old_q public.requests; r public.rooms; v_alloc uuid; v_room uuid;
begin
 perform public.booking_lock(); perform public.require_role();
 if not public.is_approver() then raise exception 'Designated approver required.'; end if;
 select * into q from public.requests where id=p_request for update;
 if not found then raise exception 'Request not found.'; end if;
 if p_approve is null then raise exception 'A decision is required.'; end if;
 if q.requester_id=auth.uid() and not p_approve then raise exception 'You cannot reject your own request. Cancel it instead.'; end if;
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
