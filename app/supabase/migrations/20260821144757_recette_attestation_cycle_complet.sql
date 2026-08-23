-- Recette 21/08 — attestation d'assurance : le cycle complet.
-- Quatre trous relevés en recette :
-- 1. « votre agence est notifiée » était faux : deposer_mon_attestation ne
--    créait aucune alerte. Le dépôt lève maintenant une alerte de
--    vérification (workflow : déposée → vérifiée par l'agence).
-- 2. Chaque dépôt créait un document indépendant (remplace_id jamais posé) :
--    le locataire revoyait sa PLUS ANCIENNE attestation, et les alertes
--    d'expiration auraient porté sur des versions périmées à jamais. Le dépôt
--    versionne : la nouvelle remplace la courante.
-- 3. generer_alertes_assurance existait mais n'était jamais planifiée : aucun
--    cron. Planifiée quotidienne (comme les diagnostics, décalée de 15 min).
-- 4. La date d'expiration n'apparaissait nulle part côté agence :
--    dossier_personne l'expose désormais, avec l'état de vérification.

-- Statut de vérification par l'agence — posé par fonction definer uniquement
-- (la fiche document reste immuable pour authenticated).
alter table public.documents
  add column verifie_le timestamptz,
  add column verifie_par uuid references public.accounts (id);

-- Dépôt locataire : versionne + notifie l'agence
create or replace function public.deposer_mon_attestation(
  p_org uuid, p_storage_path text, p_mime text, p_taille bigint,
  p_empreinte text, p_titre text, p_expire date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_person_nom text;
  v_courante uuid;
  v_doc uuid;
begin
  select id, trim(coalesce(prenom, '') || ' ' || nom) into v_person, v_person_nom
  from public.persons
  where organization_id = p_org and account_id = (select auth.uid())
  limit 1;
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;

  -- La version courante (non remplacée) que ce dépôt vient remplacer
  select d.id into v_courante
  from public.documents d
  join public.document_liens dl
    on dl.document_id = d.id and dl.entite = 'personne' and dl.entite_id = v_person
  where d.type = 'attestation_assurance' and d.purged_at is null
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  order by d.created_at desc
  limit 1;

  insert into public.documents
    (organization_id, type, titre, storage_path, mime_type, taille_octets,
     empreinte, deposited_by, expire_le, remplace_id)
  values
    (p_org, 'attestation_assurance',
     coalesce(nullif(p_titre, ''), 'Attestation d''assurance'),
     p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()),
     p_expire, v_courante)
  returning id into v_doc;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'personne', v_person);

  -- « Votre agence est notifiée » devient vrai : alerte de vérification
  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'attestation_a_verifier', 'normale',
          format('Attestation d''assurance déposée — %s', v_person_nom),
          jsonb_build_object('document_id', v_doc, 'person_id', v_person,
                             'libelle', format('Expire le %s — à vérifier puis valider',
                                               to_char(p_expire, 'DD/MM/YYYY'))));
  return v_doc;
end;
$$;

-- Validation par l'agence : la pièce vérifiée devient la référence, l'alerte
-- de vérification est soldée.
create function public.valider_attestation(p_org uuid, p_document uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.documents
  where id = p_document and organization_id = p_org
    and type = 'attestation_assurance' and purged_at is null;
  if not found then raise exception 'Attestation introuvable'; end if;
  if v.verifie_le is not null then
    raise exception 'Cette attestation est déjà validée';
  end if;
  if exists (select 1 from public.documents d2 where d2.remplace_id = p_document) then
    raise exception 'Une version plus récente a été déposée — validez la dernière';
  end if;

  update public.documents
  set verifie_le = now(), verifie_par = (select auth.uid())
  where id = p_document;

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Attestation vérifiée et validée'
  where organization_id = p_org and statut = 'ouverte'
    and type = 'attestation_a_verifier'
    and details->>'document_id' = p_document::text;
end;
$$;
revoke execute on function public.valider_attestation(uuid, uuid) from public, anon;

-- Le dossier côté agence expose l'échéance et la vérification
drop function public.dossier_personne(uuid);
create function public.dossier_personne(p_person uuid)
returns table (
  document_id uuid, type public.document_type, titre text, depose_le timestamptz,
  expire_le date, verifie_le timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select d.id, d.type, d.titre, d.created_at, d.expire_le, d.verifie_le
  from public.documents d
  join public.document_liens dl
    on dl.document_id = d.id and dl.entite = 'personne' and dl.entite_id = p_person
  where d.purged_at is null
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  order by d.type, d.created_at;
$$;

-- Le locataire voit l'état de vérification de ses pièces
drop function public.mon_dossier_locataire(uuid);
create function public.mon_dossier_locataire(p_org uuid)
returns table (
  document_id uuid, type public.document_type, titre text, expire_le date,
  depose_le timestamptz, verifie_le timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select d.id, d.type, d.titre, d.expire_le, d.created_at, d.verifie_le
  from public.documents d
  join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
  join public.persons p on p.id = dl.entite_id
  where p.organization_id = p_org and p.account_id = (select auth.uid())
    and d.purged_at is null
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  order by d.type, d.created_at;
$$;
revoke execute on function public.mon_dossier_locataire(uuid) from public, anon;

-- Les alertes d'expiration tournent enfin (les diagnostics passent à 3 h 30,
-- l'assurance à 3 h 45)
select cron.schedule('alertes-assurance-quotidiennes', '45 3 * * *',
  $$select public.generer_alertes_assurance()$$);
