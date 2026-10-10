-- Suppression explicite d’un bail encore en préparation.
-- La suppression directe reste interdite ; cette fonction vérifie le périmètre
-- et les dépendances dans une seule transaction, avant toute écriture.
create or replace function public.supprimer_bail_brouillon(p_org uuid, p_bail uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.baux%rowtype;
  v_bien uuid;
  v_table regclass;
  v_utilise boolean;
begin
  if auth.uid() is null or not exists (
    select 1 from public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]
    ) o where o = p_org
  ) then raise exception 'Accès refusé.'; end if;

  select * into v from public.baux
    where id = p_bail and organization_id = p_org for update;
  if not found then raise exception 'Ce brouillon est introuvable ou a déjà été supprimé.'; end if;
  if public.lot_hors_portefeuille(p_org, v.lot_id) then
    raise exception 'Accès refusé.';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seuls les baux en brouillon peuvent être supprimés.';
  end if;
  if v.document_signe is not null or v.signe_envoye_le is not null then
    raise exception 'Ce bail est signé ou a déjà été transmis : il ne peut pas être supprimé.';
  end if;

  -- Empêcher l’envoi simultané d’un PDF en signature ou son rattachement
  -- pendant le contrôle. Aucun appel réseau ne s’exécute sous ces verrous.
  lock table public.document_liens, public.demandes_signature in share row exclusive mode;
  if exists (
    select 1 from public.document_liens dl
    join public.demandes_signature ds on ds.document_id = dl.document_id
    where dl.organization_id = p_org and dl.entite = 'bail' and dl.entite_id = p_bail
  ) then raise exception 'Un document de ce bail a été envoyé en signature. Sa suppression est impossible.'; end if;

  perform 1 from public.etats_des_lieux where bail_id = p_bail for update;
  if exists (select 1 from public.etats_des_lieux
    where bail_id = p_bail and (etat <> 'brouillon' or signe_le is not null or preuve_signature_document is not null)) then
    raise exception 'Un état des lieux de ce bail est signé. Sa suppression est impossible.';
  end if;

  -- Seuls les éléments de préparation sont supprimables en cascade. Toute
  -- autre dépendance (comptabilité, incident, congé…) conserve le contrat.
  -- Le catalogue couvre aussi de futures tables sans leur ouvrir une cascade.
  for v_table in
    select distinct c.conrelid::regclass from pg_catalog.pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.baux'::regclass
      and c.conrelid not in ('public.bail_personnes'::regclass,
        'public.inventaire_lignes'::regclass, 'public.etats_des_lieux'::regclass)
  loop
    execute pg_catalog.format('select exists (select 1 from %s where bail_id = $1)', v_table)
      into v_utilise using p_bail;
    if v_utilise then raise exception 'Ce bail possède des opérations ou un suivi associé et ne peut pas être supprimé.'; end if;
  end loop;

  select bien_id into v_bien from public.lots where id = v.lot_id;
  -- Les fichiers restent dans la GED du logement, sans lien vers un bail disparu.
  insert into public.document_liens (organization_id, document_id, entite, entite_id)
    select p_org, dl.document_id, 'lot', v.lot_id from public.document_liens dl
    where dl.organization_id = p_org and dl.entite = 'bail' and dl.entite_id = p_bail
    on conflict (document_id, entite, entite_id) do nothing;
  delete from public.document_liens
    where organization_id = p_org and entite = 'bail' and entite_id = p_bail;
  delete from public.inventaire_lignes where bail_id = p_bail;
  delete from public.baux where id = p_bail and organization_id = p_org and etat = 'brouillon';

  update public.alerts set statut = 'fermee', closed_at = now(), closed_by = auth.uid(),
    closed_action = 'Brouillon de bail supprimé'
    where organization_id = p_org and statut = 'ouverte' and details ->> 'bail_id' = p_bail::text;
  insert into public.audit_log (account_id, organization_id, action, details)
    values (auth.uid(), p_org, 'bail_brouillon_supprime', jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id));
  return jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id, 'bien_id', v_bien);
end;
$$;
revoke all on function public.supprimer_bail_brouillon(uuid, uuid) from public, anon;
grant execute on function public.supprimer_bail_brouillon(uuid, uuid) to authenticated;
