-- Audit agence du 27/09 — un refus ne laisse plus de pièce orpheline en GED.
--
-- CONSTAT. « Régularisation annuelle » et « Enregistrer le congé » déposaient
-- le justificatif en GED (fiche + rattachement) AVANT d'appeler la fonction
-- métier. Quand celle-ci refusait — exercice déjà régularisé, charges au
-- forfait, « le bail ne couvre aucun jour de l'exercice », préavis mal
-- justifié… — la pièce restait, rattachée à rien. Au nouvel essai avec le même
-- fichier, l'anti-doublon par empreinte répondait « un fichier au contenu
-- strictement identique existe déjà » : l'agent était bloqué par son propre
-- premier essai. Le même défaut avait été corrigé pour les retenues de
-- restitution (20260910…, `ajouter_retenue_avec_justificatif`).
--
-- CORRECTION, même schéma que les retenues : l'octet monte au Storage (non
-- transactionnel, il précède forcément), puis UNE fonction crée la fiche et
-- son rattachement ET appelle la fonction métier, dans la même transaction.
-- Si la règle métier refuse, son exception annule aussi la fiche ; l'action
-- serveur envoie alors l'octet orphelin à la purge (`purger_fichier_sans_fiche`).
-- Les fonctions métier restent les juges de paix : elles ne sont pas
-- recopiées ici, seulement appelées.
--
-- Idempotent : create or replace.

-- Fiche GED d'un justificatif, dans la transaction de l'appelant. Interne :
-- appelée par les deux fonctions ci-dessous, jamais par un client.
create or replace function public.creer_fiche_justificatif(
  p_org uuid, p_titre text, p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_doc uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  perform public.controler_fichier_ged(p_org, p_storage_path, p_mime);
  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values
      (p_org, 'justificatif', p_titre, p_storage_path, p_mime, p_taille,
       p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Un fichier au contenu strictement identique existe déjà dans la GED';
  end;
  -- Rattachement minimal (module 12) : l'agence, comme tout dépôt GED.
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org);
  return v_doc;
end $function$;

revoke execute on function public.creer_fiche_justificatif(uuid, text, text, text, bigint, text)
  from public, anon, authenticated;

-- Régularisation annuelle des charges avec son décompte.
create or replace function public.regulariser_charges_avec_justificatif(
  p_bail uuid, p_annee integer, p_charges_reelles numeric, p_note text,
  p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare v_org uuid; v_doc uuid;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  v_doc := public.creer_fiche_justificatif(
    v_org, 'Décompte de charges ' || p_annee, p_storage_path, p_mime, p_taille, p_empreinte);
  -- Si `regulariser_charges` refuse, son exception annule aussi la fiche.
  return public.regulariser_charges(p_bail, p_annee, p_charges_reelles, v_doc, p_note);
end $function$;

revoke execute on function public.regulariser_charges_avec_justificatif(uuid, integer, numeric, text, text, text, bigint, text)
  from public, anon;
grant execute on function public.regulariser_charges_avec_justificatif(uuid, integer, numeric, text, text, text, bigint, text)
  to authenticated;

-- Congé avec justificatif (préavis réduit du locataire…).
create or replace function public.enregistrer_conge_avec_justificatif(
  p_bail uuid, p_par public.conge_par, p_date_presentation date, p_preavis_mois smallint,
  p_motif text, p_storage_path text, p_mime text, p_taille bigint, p_empreinte text,
  p_prix_vente numeric default null, p_beneficiaire text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_org uuid; v_doc uuid;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  v_doc := public.creer_fiche_justificatif(
    v_org, 'Justificatif de préavis réduit', p_storage_path, p_mime, p_taille, p_empreinte);
  perform public.enregistrer_conge(
    p_bail => p_bail, p_par => p_par, p_date_presentation => p_date_presentation,
    p_preavis_mois => p_preavis_mois, p_motif => p_motif, p_justificatif => v_doc,
    p_prix_vente => p_prix_vente, p_beneficiaire => p_beneficiaire);
end $function$;

revoke execute on function public.enregistrer_conge_avec_justificatif(uuid, public.conge_par, date, smallint, text, text, text, bigint, text, numeric, text)
  from public, anon;
grant execute on function public.enregistrer_conge_avec_justificatif(uuid, public.conge_par, date, smallint, text, text, text, bigint, text, numeric, text)
  to authenticated;

select public.fermer_fonctions_a_anon();
