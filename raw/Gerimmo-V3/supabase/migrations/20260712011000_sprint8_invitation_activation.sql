-- GERIMMO V3 Sprint 8 - atomic invitation activation.

create or replace function public.accept_user_invitation()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_email citext := nullif(auth.jwt() ->> 'email', '')::citext;
  invitation public.user_invitations%rowtype;
  member_id uuid;
  selected_role_id uuid;
begin
  if auth.uid() is null or current_email is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into invitation
  from public.user_invitations
  where email = current_email
    and status = 'pending'
    and archived_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if invitation.id is null then
    return null;
  end if;

  insert into public.profiles (id, email, full_name)
  values (auth.uid(), current_email, invitation.full_name)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();

  select id into member_id
  from public.organization_members
  where organization_id = invitation.organization_id
    and profile_id = auth.uid()
    and archived_at is null
  limit 1
  for update;

  if member_id is null then
    insert into public.organization_members (
      organization_id, profile_id, member_type, status, invited_by, joined_at
    ) values (
      invitation.organization_id, auth.uid(), invitation.member_type, 'active', invitation.invited_by, now()
    ) returning id into member_id;
  else
    update public.organization_members
    set member_type = invitation.member_type,
        status = 'active',
        joined_at = coalesce(joined_at, now()),
        updated_at = now()
    where id = member_id;
  end if;

  select id into selected_role_id
  from public.roles
  where key = invitation.role_key and archived_at is null;

  if selected_role_id is null then
    raise exception 'INVITATION_ROLE_NOT_FOUND';
  end if;

  insert into public.member_role_assignments (organization_member_id, role_id, assigned_by)
  values (member_id, selected_role_id, invitation.invited_by)
  on conflict (organization_member_id, role_id) where archived_at is null do nothing;

  update public.user_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = invitation.id;

  insert into public.user_activity_logs (organization_id, profile_id, actor_profile_id, action, metadata)
  values (
    invitation.organization_id,
    auth.uid(),
    auth.uid(),
    'INVITATION_ACCEPTED',
    jsonb_build_object('invitation_id', invitation.id, 'role_key', invitation.role_key)
  );

  return member_id;
end;
$$;

revoke all on function public.accept_user_invitation() from public;
grant execute on function public.accept_user_invitation() to authenticated, service_role;
