-- AUDIT SÉCURITÉ DU 27/09 — MINEURS : DÉPÔTS ET PURGE DE FICHIERS.
--
-- 1. CHEMIN DE FICHIER NON LIÉ À L'APPELANT. `deposer_ma_piece`,
--    `deposer_mon_attestation`, `retourner_document_signe`,
--    `joindre_photo_incident` (et côté artisan `deposer_photo_intervention`,
--    `deposer_devis`) ne vérifiaient que la forme `<org>/…` du chemin. Un
--    locataire qui avait une pièce réclamée pouvait déclarer le chemin d'un
--    AUTRE fichier de l'agence (un diagnostic) : la fiche créée le rendait
--    lisible par lui (`chemins_pieces_locataire`). La taille était déclarative.
--
--    Correction, en un seul endroit pour toute la famille : un déclencheur
--    BEFORE INSERT sur `documents`. Quand l'auteur de l'écriture n'est PAS un
--    gestionnaire de l'organisation (locataire, artisan, mandant…), le
--    fichier doit :
--      · exister dans le compartiment `documents` ;
--      · avoir été déposé par CE compte (propriétaire de l'objet Storage :
--        `owner_id` sur Supabase, `owner` sur le banc local) ;
--      · n'être encore rattaché à aucune fiche.
--    La taille enregistrée est alors celle que Storage a mesurée, pas celle
--    que l'appelant déclare. Les gestionnaires lisent déjà tous les fichiers
--    de leur agence (l'agent restreint a sa propre garde depuis le 25/09),
--    les tâches de service n'ont pas d'utilisateur : ils ne sont pas visés.
--    L'empreinte reste calculée par le serveur (actions), la base ne lit pas
--    le contenu des fichiers. Seules les écritures venues de l'API (rôle
--    `authenticated`) sont contrôlées : pas les sessions d'administration.
--
-- 2. `purger_fichier_sans_fiche` : un agent (même restreint) pouvait mettre
--    en file de suppression la SIGNATURE de l'organisation (aucune fiche
--    `documents` ne la réclame), alors que son retrait est réservé au
--    responsable (Socle de sécurité, 05.16), ou une pièce d'artisan. Désormais
--    un chemin référencé comme signature ou comme pièce d'artisan n'est jamais
--    mis en file par ce chemin-là ; et hors responsable, seul un fichier que
--    l'appelant a lui-même déposé peut l'être.
--
-- Idempotent : CREATE OR REPLACE, DROP TRIGGER IF EXISTS.

create or replace function public.garde_document_fichier_depose()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_objet jsonb;
  v_taille bigint;
begin
  if v_uid is null or new.storage_path is null then return new; end if;
  -- Seules les écritures venues de l'API (rôle `authenticated`, directement ou
  -- à travers une fonction definer qu'il appelle) sont visées : une session
  -- d'administration de la base (migrations, reprise, maintenance) n'a pas de
  -- dépôt Storage à prouver.
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_super_admin() then return new; end if;
  if new.organization_id in (select public.org_ids_avec_roles(
       array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) then
    return new;
  end if;

  if exists (select 1 from public.documents d where d.storage_path = new.storage_path) then
    raise exception 'Ce fichier est déjà classé : déposez un nouveau fichier' using errcode = '42501';
  end if;
  select to_jsonb(o) into v_objet
  from storage.objects o
  where o.bucket_id = 'documents' and o.name = new.storage_path;
  if v_objet is null then
    raise exception 'Fichier introuvable : déposez-le avant de l''enregistrer' using errcode = '42501';
  end if;
  if coalesce(nullif(v_objet->>'owner_id', ''), v_objet->>'owner') is distinct from v_uid::text then
    raise exception 'Ce fichier n''a pas été déposé par votre compte' using errcode = '42501';
  end if;
  begin
    v_taille := (v_objet->'metadata'->>'size')::bigint;
  exception when others then
    v_taille := null;
  end;
  if v_taille is not null then new.taille_octets := v_taille; end if;
  return new;
end $$;

revoke execute on function public.garde_document_fichier_depose() from public, anon, authenticated;

drop trigger if exists documents_fichier_depose_par_l_appelant on public.documents;
create trigger documents_fichier_depose_par_l_appelant
  before insert on public.documents
  for each row execute function public.garde_document_fichier_depose();

create or replace function public.purger_fichier_sans_fiche(p_storage_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org uuid;
  v_responsable boolean;
  v_objet jsonb;
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
  if exists (select 1 from public.documents where storage_path = p_storage_path) then
    return false;
  end if;
  -- La signature de l'organisation et les pièces d'artisan ne sont pas des
  -- « fichiers sans fiche » : elles ont leur propre parcours de retrait
  -- (définir_signature_organisation, réservé au responsable).
  if exists (select 1 from public.organizations o where o.signature_path = p_storage_path)
     or exists (select 1 from public.artisan_pieces a where a.storage_path = p_storage_path) then
    return false;
  end if;
  -- Hors responsable, seul un fichier que l'appelant a lui-même déposé.
  v_responsable := v_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]));
  if not v_responsable then
    select to_jsonb(o) into v_objet from storage.objects o
     where o.bucket_id = 'documents' and o.name = p_storage_path;
    if v_objet is not null
       and coalesce(nullif(v_objet->>'owner_id', ''), v_objet->>'owner')
           is distinct from (select auth.uid())::text then
      return false;
    end if;
  end if;

  if exists (select 1 from public.purge_fichiers where storage_path = p_storage_path) then
    return true;
  end if;

  insert into public.purge_fichiers (storage_path) values (p_storage_path);
  return true;
end $function$;

revoke execute on function public.purger_fichier_sans_fiche(text) from public, anon;
grant execute on function public.purger_fichier_sans_fiche(text) to authenticated;

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
