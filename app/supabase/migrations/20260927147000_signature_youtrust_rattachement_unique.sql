-- AUDIT SÉCURITÉ DU 27/09 — MINEUR : IDENTIFIANTS YOUTRUST RÉÉCRIVABLES.
--
-- `rattacher_signature_youtrust` laissait tout gérant (agent compris)
-- réécrire, par l'API, les identifiants prestataire d'une demande en attente
-- (`external_request_id`, `external_document_id`, `external_signer_id`,
-- `external_status`). C'est par eux que le webhook rattache le PDF signé et
-- la preuve : un mauvais identifiant rattache le mauvais document.
--
-- LA CORRECTION. Le rattachement se fait UNE fois, par le gérant qui vient
-- d'envoyer la demande (`created_by`), juste après sa création chez Youtrust
-- (parcours de l'écran, inchangé). Réécrire des identifiants déjà posés, ou
-- rattacher la demande d'un autre, est réservé au responsable de
-- l'organisation (admin d'agence ou propriétaire en direct), et journalisé.
--
-- Idempotent : CREATE OR REPLACE, même signature et mêmes droits.

create or replace function public.rattacher_signature_youtrust(
  p_org uuid, p_demande uuid, p_request text, p_document text, p_signer text, p_statut text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v record;
  v_responsable boolean;
begin
  if not (p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select ds.id, ds.created_by, ds.external_request_id into v
  from public.demandes_signature ds
  where ds.id = p_demande and ds.organization_id = p_org and ds.signee_le is null
  for update;
  if not found then raise exception 'Demande de signature introuvable'; end if;

  v_responsable := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','proprietaire_direct']::public.membership_role[]));
  if not v_responsable
     and (v.external_request_id is not null or v.created_by is distinct from (select auth.uid())) then
    raise exception 'Seul le responsable de l''organisation peut modifier le rattachement de cette signature'
      using errcode = '42501';
  end if;

  update public.demandes_signature set
    prestataire='youtrust', external_request_id=p_request,
    external_document_id=p_document, external_signer_id=p_signer,
    external_status=p_statut, external_updated_at=now()
  where id=p_demande and organization_id=p_org and signee_le is null;

  if v.external_request_id is not null then
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), p_org, 'signature_rattachement_modifie',
            jsonb_build_object('demande_id', p_demande, 'avant', v.external_request_id,
                               'apres', p_request));
  end if;
end $function$;

revoke execute on function public.rattacher_signature_youtrust(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.rattacher_signature_youtrust(uuid, uuid, text, text, text, text) to authenticated;

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
