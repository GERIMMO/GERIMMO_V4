-- LOC008 : ne jamais annoncer une annulation après une réponse concurrente.
create or replace function public.annuler_invitation_locataire(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i public.invitations_locataires%rowtype;
begin
 select * into i from public.invitations_locataires where id=p_id for update;
 if not found or auth.uid() is null or not(i.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if i.etat='annulee' then return; end if;
 if i.etat='acceptee' then raise exception 'Cette invitation a déjà été acceptée. L’accès locataire reste actif'; end if;
 if i.etat='refusee' then raise exception 'Cette invitation a déjà été refusée. Aucun accès n’a été accordé'; end if;
 if i.etat='expiree' or i.expire_le<=now() then raise exception 'Cette invitation a expiré. Aucun accès n’a été accordé'; end if;
 update public.invitations_locataires set etat='annulee',repondu_le=now() where id=p_id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),i.organization_id,'invitation_locataire_annulee',jsonb_build_object('invitation',p_id));
end $$;
revoke all on function public.annuler_invitation_locataire(uuid) from public,anon;
grant execute on function public.annuler_invitation_locataire(uuid) to authenticated;
