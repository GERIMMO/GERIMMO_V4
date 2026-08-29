-- Décision du 29/08 — une alerte automatique est LIÉE à l'événement qui l'a
-- créée, et se ferme d'elle-même quand cet événement est traité dans son
-- module. L'utilisateur ne voit que l'alerte ; la mécanique est ici.
--
-- 1. `origine_type` / `origine_id` sur alerts : la référence de l'objet
--    d'origine, dérivée de `details` à l'insertion (les fonctions créatrices
--    n'ont pas à changer) et rétro-remplie pour l'existant.
-- 2. `fermer_alertes_origine(...)` : une seule façon de fermer par l'événement,
--    motif obligatoire, alerte conservée (historique — décision 29/08).
-- 3. Branchement des 6 types sans fermeture auto + l'EDL de sortie nominal.
--    Deux événements manquaient et sont créés : « décompte envoyé » et
--    « justificatif rattaché a posteriori » (+ suppression de retenue, dont
--    l'action existante ne supprimait rien faute de policy DELETE).

-- ------------------------------------------------------------
-- 1. Lien vers l'événement d'origine
-- ------------------------------------------------------------
alter table public.alerts
  add column if not exists origine_type text,
  add column if not exists origine_id uuid;

create index if not exists alerts_origine_ouverte_idx
  on public.alerts (organization_id, origine_type, origine_id)
  where statut = 'ouverte';

-- Type d'alerte → objet d'origine (clé dans details). Une retenue porte sa
-- propre clé depuis ce jour ; avant, seule la restitution était connue.
create or replace function public.alerte_origine(p_type text, p_details jsonb,
  out origine_type text, out origine_id uuid)
language plpgsql immutable set search_path = '' as $$
declare v_cle text;
begin
  origine_type := case p_type
    when 'edl_entree' then 'bail' when 'edl_sortie' then 'bail'
    when 'diagnostic_expiration' then 'diagnostic'
    when 'assurance_expiration' then 'document' when 'attestation_a_verifier' then 'document'
    when 'incident_a_qualifier' then 'incident' when 'incident_conteste' then 'incident'
    when 'versement_proprietaire' then 'rapport' when 'ecart_versement' then 'rapport'
    when 'decompte' then 'restitution' when 'decompte_lrar' then 'restitution'
    when 'retenue_sans_justificatif' then
      case when p_details ? 'retenue_id' then 'retenue' else 'restitution' end
    else null end;
  v_cle := case origine_type
    when 'bail' then 'bail_id' when 'diagnostic' then 'diagnostic_id'
    when 'document' then 'document_id' when 'incident' then 'incident_id'
    when 'rapport' then 'rapport_id' when 'restitution' then 'restitution_id'
    when 'retenue' then 'retenue_id' else null end;
  if v_cle is null or not (p_details ? v_cle) then
    origine_type := null; origine_id := null; return;
  end if;
  begin
    origine_id := (p_details ->> v_cle)::uuid;
  exception when others then
    origine_type := null; origine_id := null;
  end;
end $$;

create or replace function public.alerte_pose_origine()
returns trigger language plpgsql set search_path = '' as $$
declare o record;
begin
  if new.origine_id is null then
    select * into o from public.alerte_origine(new.type, new.details);
    new.origine_type := o.origine_type;
    new.origine_id := o.origine_id;
  end if;
  return new;
end $$;

drop trigger if exists alerts_origine_trg on public.alerts;
create trigger alerts_origine_trg
  before insert on public.alerts
  for each row execute function public.alerte_pose_origine();

update public.alerts a
   set origine_type = (public.alerte_origine(a.type, a.details)).origine_type,
       origine_id = (public.alerte_origine(a.type, a.details)).origine_id
 where a.origine_id is null
   and (public.alerte_origine(a.type, a.details)).origine_id is not null;

-- ------------------------------------------------------------
-- 2. Fermeture par l'événement
-- ------------------------------------------------------------
create or replace function public.fermer_alertes_origine(
  p_org uuid, p_origine_type text, p_origine_id uuid, p_motif text,
  p_types text[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Le motif de fermeture est obligatoire';
  end if;
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = p_motif
   where organization_id = p_org and statut = 'ouverte'
     and origine_type = p_origine_type and origine_id = p_origine_id
     and (p_types is null or type = any (p_types));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
-- Appelée par des triggers qui s'exécutent sous l'utilisateur connecté : reste
-- exécutable par authenticated (qui peut déjà fermer ses alertes via la policy).
revoke execute on function public.fermer_alertes_origine(uuid, text, uuid, text, text[]) from public, anon;

-- ------------------------------------------------------------
-- 3a. Versement au propriétaire : le versement ferme l'appel, régularise l'écart
-- ------------------------------------------------------------
create or replace function public.enregistrer_versement(p_rapport uuid, p_montant numeric, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; v_motif text;
begin
  select * into v from public.rapports_gestion where id = p_rapport;
  if v.id is null then raise exception 'Rapport introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  update public.rapports_gestion set versement_montant = p_montant, versement_date = p_date where id = p_rapport;

  v_motif := format('Versement de %s € enregistré le %s', coalesce(p_montant, 0), to_char(p_date, 'DD/MM/YYYY'));
  perform public.fermer_alertes_origine(v.organization_id, 'rapport', p_rapport, v_motif,
                                        array['versement_proprietaire']);
  if abs(coalesce(p_montant, 0) - v.net) > 0.01 then
    -- Un écart déjà signalé se met à jour, il ne s'empile pas
    if exists (select 1 from public.alerts where organization_id = v.organization_id
                 and statut = 'ouverte' and type = 'ecart_versement' and origine_id = p_rapport) then
      update public.alerts
         set details = jsonb_build_object('rapport_id', p_rapport, 'net', v.net, 'verse', p_montant)
       where organization_id = v.organization_id and statut = 'ouverte'
         and type = 'ecart_versement' and origine_id = p_rapport;
    else
      insert into public.alerts (organization_id, type, criticite, titre, details)
      values (v.organization_id, 'ecart_versement', 'critique',
              'Écart entre le versement et le net du rapport',
              jsonb_build_object('rapport_id', p_rapport, 'net', v.net, 'verse', p_montant));
    end if;
  else
    perform public.fermer_alertes_origine(v.organization_id, 'rapport', p_rapport,
                                          'Écart régularisé — ' || v_motif, array['ecart_versement']);
  end if;
end $$;

-- ------------------------------------------------------------
-- 3b. Diagnostic archivé (renouvelé par un dépôt, ou retiré)
-- ------------------------------------------------------------
create or replace function public.diagnostic_archive_ferme_alertes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    perform public.fermer_alertes_origine(new.organization_id, 'diagnostic', new.id,
      'Diagnostic renouvelé ou archivé', array['diagnostic_expiration']);
  end if;
  return new;
end $$;

drop trigger if exists diagnostics_archive_alertes_trg on public.diagnostics;
create trigger diagnostics_archive_alertes_trg
  after update of archived_at on public.diagnostics
  for each row execute function public.diagnostic_archive_ferme_alertes();

-- ------------------------------------------------------------
-- 3c. Document remplacé par une nouvelle version (attestation d'assurance…)
-- ------------------------------------------------------------
create or replace function public.document_remplace_ferme_alertes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.remplace_id is not null then
    perform public.fermer_alertes_origine(new.organization_id, 'document', new.remplace_id,
      'Nouvelle version déposée : ' || coalesce(new.titre, 'document'),
      array['assurance_expiration', 'attestation_a_verifier']);
  end if;
  return new;
end $$;

drop trigger if exists documents_remplace_alertes_trg on public.documents;
create trigger documents_remplace_alertes_trg
  after insert on public.documents
  for each row execute function public.document_remplace_ferme_alertes();

-- ------------------------------------------------------------
-- 3d. Décompte de restitution envoyé (événement créé ce jour)
-- ------------------------------------------------------------
alter table public.restitutions add column if not exists envoye_le date;

create or replace function public.marquer_decompte_envoye(p_restitution uuid, p_date date default current_date)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut <> 'finalise' then raise exception 'Le décompte doit être finalisé avant d''être envoyé'; end if;
  if v.envoye_le is not null then raise exception 'Décompte déjà envoyé le %', to_char(v.envoye_le, 'DD/MM/YYYY'); end if;
  if p_date is null or p_date > current_date then raise exception 'Date d''envoi invalide'; end if;
  if v.date_emission is not null and p_date < v.date_emission then
    raise exception 'Le décompte ne peut pas être envoyé avant son émission (%)', to_char(v.date_emission, 'DD/MM/YYYY');
  end if;
  update public.restitutions set envoye_le = p_date where id = p_restitution;
  perform public.fermer_alertes_origine(v.organization_id, 'restitution', p_restitution,
    format('Décompte envoyé au locataire le %s', to_char(p_date, 'DD/MM/YYYY')),
    array['decompte', 'decompte_lrar']);
end $$;
revoke execute on function public.marquer_decompte_envoye(uuid, date) from public, anon;

-- ------------------------------------------------------------
-- 3e. Retenue : l'alerte porte la retenue ; justifier ou retirer la ferme
-- ------------------------------------------------------------
create or replace function public.ajouter_retenue(
  p_restitution uuid, p_libelle text, p_cout numeric,
  p_duree_vie numeric, p_age numeric, p_justificatif uuid default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_montant numeric; v_retenue uuid;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte finalisé — plus de retenue possible'; end if;
  if v.sans_edl_entree then
    raise exception 'Sans état des lieux d''entrée, aucune retenue n''est possible : restitution intégrale (RM-2.4.3)';
  end if;
  if p_cout is null or p_cout <= 0 then raise exception 'Coût de remise en état invalide'; end if;

  if p_duree_vie is null or p_duree_vie <= 0 or p_age is null then
    v_montant := round(p_cout, 2);
  else
    -- Élément amorti : la vétusté a consommé toute la valeur, rien n'est dû (RM-2.4.5)
    if p_age >= p_duree_vie then
      raise exception 'Élément entièrement amorti (% ans sur % ans) : aucune retenue possible (RM-2.4.5)',
        p_age, p_duree_vie;
    end if;
    v_montant := round(p_cout * ((p_duree_vie - p_age) / p_duree_vie), 2);
  end if;

  insert into public.retenues
    (organization_id, restitution_id, libelle, cout, duree_vie_ans, age_ans, montant_retenu,
     justificatif_document, sans_justificatif)
  values (v.organization_id, p_restitution, p_libelle, p_cout, p_duree_vie, p_age, v_montant,
          p_justificatif, p_justificatif is null)
  returning id into v_retenue;

  -- Sans devis ni facture, la retenue est difficilement défendable : on la trace
  if p_justificatif is null then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v.organization_id, 'retenue_sans_justificatif', 'normale',
            'Retenue sans justificatif — difficilement défendable',
            jsonb_build_object('retenue_id', v_retenue, 'restitution_id', p_restitution,
                               'libelle', p_libelle, 'montant', v_montant));
  end if;
  return v_montant;
end $$;

-- Justificatif rattaché a posteriori (possible même après finalisation : il
-- s'agit de défendre la retenue, pas de la modifier)
create or replace function public.justifier_retenue(p_retenue uuid, p_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select r.*, d.type as doc_type into v
  from public.retenues r left join public.documents d on d.id = p_document and d.organization_id = r.organization_id
  where r.id = p_retenue;
  if v.id is null then raise exception 'Retenue introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.doc_type is null then raise exception 'Justificatif introuvable'; end if;
  if v.justificatif_document is not null then raise exception 'Cette retenue a déjà un justificatif'; end if;
  update public.retenues set justificatif_document = p_document, sans_justificatif = false where id = p_retenue;
  perform public.fermer_alertes_origine(v.organization_id, 'retenue', p_retenue,
    'Justificatif fourni pour la retenue « ' || v.libelle || ' »', array['retenue_sans_justificatif']);
end $$;
revoke execute on function public.justifier_retenue(uuid, uuid) from public, anon;

-- Retirer une retenue : l'action existante faisait un DELETE direct sans policy
-- (0 ligne, « succès » affiché) — on passe par une fonction, comme le reste
create or replace function public.supprimer_retenue(p_retenue uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select r.*, s.statut as restitution_statut into v
  from public.retenues r join public.restitutions s on s.id = r.restitution_id
  where r.id = p_retenue;
  if v.id is null then raise exception 'Retenue introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.restitution_statut = 'finalise' then raise exception 'Décompte finalisé — la retenue ne se retire plus'; end if;
  delete from public.retenues where id = p_retenue;
  perform public.fermer_alertes_origine(v.organization_id, 'retenue', p_retenue,
    'Retenue « ' || v.libelle || ' » retirée', array['retenue_sans_justificatif']);
end $$;
revoke execute on function public.supprimer_retenue(uuid) from public, anon;

-- ------------------------------------------------------------
-- 3f. EDL de sortie signé : cas nominal de fermeture de l'alerte edl_sortie
-- ------------------------------------------------------------
create or replace function public.edl_signe_ferme_alertes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.etat = 'signe' and old.etat <> 'signe' and new.type = 'sortie' then
    perform public.fermer_alertes_origine(new.organization_id, 'bail', new.bail_id,
      'État des lieux de sortie signé', array['edl_sortie']);
  end if;
  return new;
end $$;

drop trigger if exists edl_signe_alertes_trg on public.etats_des_lieux;
create trigger edl_signe_alertes_trg
  after update of etat on public.etats_des_lieux
  for each row execute function public.edl_signe_ferme_alertes();
