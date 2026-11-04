create or replace function public.save_guesthouse(p_id uuid,p_name text,p_code text,p_destination text,p_timezone text,p_active boolean,p_instructions text) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
 perform public.booking_lock(); perform public.require_role(true);
 if coalesce(length(trim(p_name)),0) not between 1 and 150 or coalesce(length(trim(p_code)),0) not between 1 and 100 or coalesce(length(trim(p_destination)),0) not between 1 and 300 then raise exception 'Enter a name, unique code and destination within their length limits.'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
 insert into public.guesthouses(id,name,code,destination,timezone,active,instructions) values(coalesce(p_id,gen_random_uuid()),trim(p_name),trim(p_code),trim(p_destination),p_timezone,p_active,coalesce(p_instructions,''))
 on conflict(id) do update set name=excluded.name,code=excluded.code,destination=excluded.destination,timezone=excluded.timezone,active=excluded.active,instructions=excluded.instructions returning id into v_id;
 perform public.log_event(null,'guesthouse_saved',v_id::text);return v_id;
end $$;
create or replace function public.save_room(p_id uuid,p_house uuid,p_name text,p_code text,p_mode text,p_physical text,p_active boolean) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
 perform public.booking_lock(); perform public.require_role(true);
 if coalesce(length(trim(p_name)),0) not between 1 and 150 or coalesce(length(trim(p_code)),0) not between 1 and 100 then raise exception 'Enter a room name and unique code within their length limits.'; end if;
 if p_id is not null and exists(select 1 from public.rooms where id=p_id and unit_type='break') then raise exception 'Break is a protected unlimited unit.'; end if;
 if p_id is not null and exists(select 1 from public.rooms where id=p_id and guesthouse_id is distinct from p_house) and exists(select 1 from public.room_allocations where room_id=p_id) then raise exception 'A room with booking history cannot move guesthouses.'; end if;
 insert into public.rooms(id,guesthouse_id,name,code,mode,physical_room,active) values(coalesce(p_id,gen_random_uuid()),p_house,trim(p_name),trim(p_code),p_mode,coalesce(p_physical,''),p_active)
 on conflict(id) do update set guesthouse_id=excluded.guesthouse_id,name=excluded.name,code=excluded.code,mode=excluded.mode,physical_room=excluded.physical_room,active=excluded.active returning id into v_id;
 perform public.log_event(null,'room_saved',v_id::text); return v_id;
end $$;
create or replace function public.set_staff(p_user uuid,p_name text,p_department text,p_role text,p_active boolean,p_designate boolean default false) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.booking_lock(); perform public.require_role(true);
 if p_user=auth.uid() and (p_role<>'admin' or not p_active) then raise exception 'You cannot remove your own admin access.'; end if;
 if p_role is null or p_active is null or p_designate is null then raise exception 'Role, active status and designation are required.'; end if;
 if coalesce(length(trim(p_name)),0) not between 1 and 150 then raise exception 'Enter a staff name within 150 characters.'; end if;
 if p_role not in ('admin','approver','requester') then raise exception 'Invalid role.'; end if;
 if p_designate and (not p_active or p_role not in ('admin','approver')) then raise exception 'Approver must be active and authorized.'; end if;
 update public.profiles set full_name=trim(p_name),department=coalesce(p_department,''),role=p_role,active=p_active where id=p_user;
 if not found then raise exception 'Invite the user first.'; end if;
 if p_designate then update public.settings set approver_id=p_user where id=true;
 else update public.settings set approver_id=null where approver_id=p_user; end if;
 perform public.log_event(null,'staff_updated',p_user::text);
end $$;
