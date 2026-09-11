-- Retenue de restitution : le justificatif ne doit exister que si la retenue existe.
--
-- Constat. Le formulaire de restitution déposait le devis/facture en GED
-- (fiche `documents` + rattachement) AVANT d'appeler `ajouter_retenue`. Or ce
-- refus est courant et parfaitement légitime : « Élément entièrement amorti
-- (9 ans sur 7 ans) : aucune retenue possible » (RM-2.4.5, décote linéaire —
-- wiki/regles-metier/Vétusté et décote.md), ou « Sans état des lieux d'entrée,
-- aucune retenue n'est possible » (RM-2.4.3). Le dépôt et la RPC étant deux
-- requêtes PostgREST donc deux transactions, la fiche survivait au refus :
--   · une pièce rattachée à rien, portant le nom du locataire dans son titre,
--     conservée sans finalité écrite (RM-A2.1/2, wiki/regles-metier/RGPD.md) ;
--   · pire, l'empreinte anti-doublon de cette pièce fantôme INTERDIT ensuite
--     à l'agent de redéposer le même devis après avoir corrigé l'âge : le
--     geste légitime se retrouve bloqué par les débris du geste refusé.
--
-- Correction. Le patron existe déjà dans le produit (`joindre_photo_incident`,
-- `remplacer_document_ged`) : l'octet monte au Storage, puis UNE fonction
-- definer écrit la fiche, ses rattachements et la ligne métier dans UNE SEULE
-- transaction. Si la règle métier refuse, l'exception remonte et tout est
-- annulé — la GED n'a jamais rien vu.
--
-- La règle métier, elle, ne bouge pas d'un iota et n'est pas recopiée : ces
-- fonctions délèguent à `ajouter_retenue` / `justifier_retenue`, qui restent
-- les seules à trancher. Un seul énoncé de la règle, donc aucune dérive
-- possible entre le chemin « avec pièce » et le chemin « sans pièce ».

-- ============================================================
-- 1. Contrôles communs du fichier confié par le serveur applicatif
-- ============================================================
-- Reprend mot pour mot les garde-fous de `remplacer_document_ged` : formats
-- acceptés (RM-A4.9 — le type RÉEL est vérifié côté serveur applicatif avant
-- l'envoi, ici on refuse simplement ce qui n'est pas annoncé PDF/JPEG/PNG) et
-- chemin de Storage obligatoirement sous le préfixe de l'agence, qui porte
-- l'isolation du bucket.
-- Volontairement VOLATILE (défaut) : une fonction qui ne sert qu'à lever une
-- exception ne doit pas pouvoir être pré-évaluée ni escamotée par le planneur.
create function public.controler_fichier_ged(p_org uuid, p_storage_path text, p_mime text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Format refusé : PDF, JPEG ou PNG uniquement';
  end if;
  if p_storage_path is null or p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de fichier invalide';
  end if;
end $$;
revoke execute on function public.controler_fichier_ged(uuid, text, text) from public, anon, authenticated;

-- ============================================================
-- 2. Retenue + son justificatif, en un seul geste indivisible
-- ============================================================
create function public.ajouter_retenue_avec_justificatif(
  p_restitution uuid,
  p_libelle text,
  p_cout numeric,
  p_duree_vie numeric,
  p_age numeric,
  p_storage_path text,
  p_mime text,
  p_taille bigint,
  p_empreinte text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_doc uuid;
begin
  select organization_id into v_org from public.restitutions where id = p_restitution;
  if v_org is null then raise exception 'Restitution introuvable'; end if;

  -- Le contrôle d'accès est refait ici bien qu'`ajouter_retenue` le refasse :
  -- la fiche s'insère AVANT que la règle métier ne tranche, et une fonction
  -- definer écrit sans RLS. Sans ce contrôle, un membre d'une autre agence
  -- pourrait sonder l'unicité d'empreinte de celle-ci.
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  perform public.controler_fichier_ged(v_org, p_storage_path, p_mime);

  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values
      (v_org, 'justificatif', 'Devis/facture — ' || p_libelle, p_storage_path,
       p_mime, p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Un fichier au contenu strictement identique existe déjà dans la GED';
  end;

  -- Rattachement minimal (module 12) : l'agence. Le lien métier de la pièce,
  -- c'est `retenues.justificatif_document` posé juste en dessous. On ne la
  -- rattache PAS au bail : la matrice de consultation (RM-12.5.5) réserve les
  -- pièces du dossier au gérant, un devis de remise en état n'a rien à faire
  -- dans l'espace du locataire ni dans celui du mandant.
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, v_org, 'organisation', v_org);

  -- Le juge de paix reste `ajouter_retenue` (RM-2.4.3, RM-2.4.5, décompte
  -- finalisé, coût invalide…). S'il refuse, son exception remonte et annule
  -- la fiche et son rattachement ci-dessus : c'est tout l'objet de ce détour.
  return public.ajouter_retenue(p_restitution, p_libelle, p_cout, p_duree_vie, p_age, v_doc);
end $$;
revoke execute on function public.ajouter_retenue_avec_justificatif(uuid, text, numeric, numeric, numeric, text, text, bigint, text)
  from public, anon;
grant execute on function public.ajouter_retenue_avec_justificatif(uuid, text, numeric, numeric, numeric, text, text, bigint, text)
  to authenticated;

-- ============================================================
-- 3. Justificatif fourni après coup : même indivisibilité
-- ============================================================
-- `justifier_retenue` refuse déjà « Cette retenue a déjà un justificatif » —
-- un double-clic, ou deux agents sur le même dossier, suffisait à laisser une
-- seconde pièce fantôme derrière soi.
create function public.justifier_retenue_avec_piece(
  p_retenue uuid,
  p_storage_path text,
  p_mime text,
  p_taille bigint,
  p_empreinte text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_doc uuid;
begin
  select organization_id, libelle into v from public.retenues where id = p_retenue;
  if v.organization_id is null then raise exception 'Retenue introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  perform public.controler_fichier_ged(v.organization_id, p_storage_path, p_mime);

  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values
      (v.organization_id, 'justificatif', 'Devis/facture — ' || v.libelle,
       p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Un fichier au contenu strictement identique existe déjà dans la GED';
  end;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, v.organization_id, 'organisation', v.organization_id);

  -- Idem : si le rattachement est refusé, la fiche déposée juste au-dessus
  -- disparaît avec lui.
  perform public.justifier_retenue(p_retenue, v_doc);
end $$;
revoke execute on function public.justifier_retenue_avec_piece(uuid, text, text, bigint, text)
  from public, anon;
grant execute on function public.justifier_retenue_avec_piece(uuid, text, text, bigint, text)
  to authenticated;

-- ============================================================
-- 4. L'octet monté au Storage quand la règle refuse
-- ============================================================
-- Le Storage n'est pas transactionnel : l'objet monte forcément AVANT la RPC
-- (l'ordre inverse produirait une fiche pointant sur du vide, c'est-à-dire une
-- retenue dont le justificatif ne s'ouvre pas — pire encore devant un juge).
-- Sans fiche, cet objet est déjà inaccessible : la policy `ged_select` du
-- bucket exige un `documents` vivant. Mais il porte des données du locataire,
-- donc il doit PARTIR, pas seulement devenir invisible.
--
-- Supabase interdit le DELETE SQL sur storage.objects (correctif du 28/07) :
-- la suppression physique passe par la file `purge_fichiers`, vidée par
-- l'action Super Admin « Lancer la purge ». On y met le chemin — sans jamais
-- accorder au gérant le droit de supprimer quoi que ce soit.
create function public.purger_fichier_sans_fiche(p_storage_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  -- Le 1er segment du chemin porte l'isolation du bucket : on n'accepte que
  -- les chemins des agences que l'appelant gère.
  begin
    v_org := (string_to_array(p_storage_path, '/'))[1]::uuid;
  exception when others then
    return false;
  end;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    return false;
  end if;

  -- Garde-fou central : on ne met en file QUE ce qu'aucune fiche ne réclame.
  -- Une pièce vivante ne peut donc pas être détruite par ce chemin.
  if exists (select 1 from public.documents where storage_path = p_storage_path) then
    return false;
  end if;
  if exists (select 1 from public.purge_fichiers where storage_path = p_storage_path) then
    return true;
  end if;

  insert into public.purge_fichiers (storage_path) values (p_storage_path);
  return true;
end $$;
revoke execute on function public.purger_fichier_sans_fiche(text) from public, anon;
grant execute on function public.purger_fichier_sans_fiche(text) to authenticated;
