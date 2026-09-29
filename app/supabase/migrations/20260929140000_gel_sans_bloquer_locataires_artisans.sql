-- Audit du 29/09 (parcours métier, constat 9) : le gel d'une organisation qui
-- ne paie plus bloquait AUSSI ses locataires et ses artisans — plus de
-- signalement de fuite, plus d'attestation d'assurance, plus d'annonce de
-- départ, plus de facture pour un travail déjà fait. La situation commerciale
-- de l'agence ne les regarde pas : seules les saisies des gérants (admin
-- d'agence, agent, propriétaire direct) sont refusées. Ce que les autres
-- rôles peuvent écrire reste borné par la RLS de chaque table.
create or replace function public.refuser_ecriture_si_fermee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  if v_org is null then
    return coalesce(new, old);
  end if;

  -- Refus pour le gérant, et pour tout contexte non identifié (aucun tiers
  -- n'écrit sans session) ; un compte identifié qui n'est pas gérant de
  -- l'organisation — locataire, artisan, mandant — passe, borné par la RLS.
  if not public.org_ecriture_ouverte(v_org)
     and (auth.uid() is null
          or v_org in (select public.org_ids_avec_roles(
            array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception
      'Abonnement suspendu : vos données restent consultables et exportables, mais aucune nouvelle saisie n''est possible. Réactivez l''abonnement depuis « Mon abonnement ».'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;
revoke execute on function public.refuser_ecriture_si_fermee() from public, anon, authenticated;
