-- Scope approver updates to the singleton settings row.
create or replace function public.set_staff(p_user uuid,p_name text,p_department text,p_role text,p_active boolean,p_designate boolean default false) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.booking_lock(); perform public.require_role(true);
 if p_user=auth.uid() and (p_role<>'admin' or not p_active) then raise exception 'You cannot remove your own admin access.'; end if;
 if p_role not in ('admin','approver','requester') then raise exception 'Invalid role.'; end if;
 if p_designate and (not p_active or p_role not in ('admin','approver')) then raise exception 'Approver must be active and authorized.'; end if;
 update public.profiles set full_name=trim(p_name),department=coalesce(p_department,''),role=p_role,active=p_active where id=p_user;
 if not found then raise exception 'Invite the user first.'; end if;
 if p_designate then update public.settings set approver_id=p_user where id=true;
 elsif not p_active or p_role='requester' then update public.settings set approver_id=null where approver_id=p_user; end if;
 perform public.log_event(null,'staff_updated',p_user::text);
end $$;
