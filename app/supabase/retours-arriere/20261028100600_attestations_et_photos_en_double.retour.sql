-- Retour arrière de 20261028100600_attestations_et_photos_en_double.sql — audit final du 28/10/2026 (DOC-04, DOC-10, DOC-12).
-- Remet l'index d'unicité (artisan, empreinte) des attestations, `joindre_photo_incident` dans sa définition de
-- 20260821135221_s7_incidents_garde_fous (photo déjà connue refusée) et `deposer_photo_intervention` dans celle de
-- 20260911180000_module8_artisans_socle (titre « Chantier (apres) — … »), puis rend aux titres renommés leur forme ancienne.
-- REFUSE (sans rien modifier) tant qu'un même fichier est actif sous deux types d'attestation pour un artisan : l'ancien
-- index ne pourrait pas être recréé ; retirer d'abord l'une des deux pièces. Les rattachements de photos déjà connues
-- (liens `incident` et événements « photo » marqués `deja_connue`) sont CONSERVÉS : ils désignent des photos réelles du dossier.
-- Remettre le code précédent avant ce retour : l'écran du gérant appelle `joindre_photo_incident` sans fichier pour une
-- photo déjà connue, ce que l'ancienne définition ne sait pas traiter (l'insertion du document échoue).
begin;
set local lock_timeout = '10s';
do $garde$
begin
  if exists (select 1 from public.artisan_pieces where retiree_le is null
             group by artisan_id, empreinte having count(*) > 1) then
    raise exception 'Retour refusé : un même fichier est actif sous deux types d''attestation ; retirez-en un avant de recréer l''index (artisan, empreinte).';
  end if;
end
$garde$;
create unique index if not exists artisan_pieces_empreinte_unique
  on public.artisan_pieces (artisan_id, empreinte)
  where retiree_le is null;
drop index if exists public.artisan_pieces_type_empreinte_unique;

create or replace function public.joindre_photo_incident(
  p_org uuid, p_incident uuid, p_storage_path text,
  p_mime text, p_taille bigint, p_empreinte text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_gerant boolean;
  v_declarant boolean;
  v_doc uuid;
  v_nb bigint;
begin
  select i.*, p.account_id as declarant_account into v
  from public.incidents i
  left join public.persons p on p.id = i.declarant_person_id
  where i.id = p_incident and i.organization_id = p_org;
  if not found then raise exception 'Incident introuvable'; end if;

  v_gerant := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
  v_declarant := v.declarant_account = (select auth.uid())
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]));
  if not (v_gerant or v_declarant) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'clos' then
    raise exception 'Cet incident est clos — rouvrez-le si le problème persiste';
  end if;
  if p_mime not in ('image/jpeg', 'image/png') then
    raise exception 'Une photo d''incident est une image (JPEG ou PNG)';
  end if;
  if p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de stockage invalide';
  end if;
  -- Plafond par incident (revue n°1) : la limite TS ne portait que sur une
  -- requête — répétée, elle laissait gonfler la GED sans borne.
  select count(*) into v_nb
  from public.document_liens dl
  join public.documents d on d.id = dl.document_id and d.purged_at is null
  where dl.organization_id = p_org and dl.entite = 'incident' and dl.entite_id = p_incident;
  if v_nb >= 10 then
    raise exception 'Dix photos au maximum par incident — faites le tri avant d''en ajouter';
  end if;

  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values
      (p_org, 'photo_incident', 'Photo — ' || v.numero, p_storage_path, p_mime,
       p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Cette photo a déjà été déposée';
  end;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'incident', p_incident);

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'photo', (select auth.uid()),
          jsonb_build_object('document_id', v_doc));

  return v_doc;
end;
$$;
revoke execute on function public.joindre_photo_incident(uuid, uuid, text, text, bigint, text) from public, anon;

create or replace function public.deposer_photo_intervention(
  p_intervention uuid, p_moment public.intervention_photo_moment,
  p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_doc uuid; v_nb integer; v_numero text;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut not in ('acceptee', 'planifiee', 'en_cours') then
    raise exception 'Cette mission n''accepte plus de photo (état : %)', v.statut;
  end if;
  if p_mime not in ('image/jpeg', 'image/png') then
    raise exception 'Une photo de chantier est une image (JPEG ou PNG)';
  end if;
  if p_storage_path not like v.organization_id::text || '/%' then
    raise exception 'Chemin de stockage invalide';
  end if;
  select count(*) into v_nb from public.intervention_photos
  where intervention_id = p_intervention;
  if v_nb >= 10 then
    raise exception 'Dix photos au maximum par intervention';
  end if;

  select numero into v_numero from public.incidents where id = v.incident_id;
  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values (v.organization_id, 'photo_incident',
            'Chantier (' || p_moment || ') — ' || v_numero,
            p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Cette photo a déjà été déposée';
  end;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, v.organization_id, 'organisation', v.organization_id),
         (v_doc, v.organization_id, 'incident', v.incident_id);
  insert into public.intervention_photos
    (organization_id, intervention_id, document_id, moment, created_by)
  values (v.organization_id, p_intervention, v_doc, p_moment, (select auth.uid()));

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'photo', (select auth.uid()),
          jsonb_build_object('document_id', v_doc, 'moment', p_moment,
                             'intervention_id', p_intervention));
  return v_doc;
end;
$$;
revoke execute on function public.deposer_photo_intervention(uuid, public.intervention_photo_moment, text, text, bigint, text) from public, anon;

update public.documents
set titre = 'Chantier (' || case substring(titre from '^Photo de chantier (avant travaux|en cours de travaux|après travaux) — ')
              when 'avant travaux' then 'avant'
              when 'en cours de travaux' then 'pendant'
              else 'apres' end
            || ') — ' || substring(titre from '^Photo de chantier (?:avant travaux|en cours de travaux|après travaux) — (.*)$')
where type = 'photo_incident'
  and titre ~ '^Photo de chantier (avant travaux|en cours de travaux|après travaux) — .+$';

select public.fermer_fonctions_a_anon();
commit;
