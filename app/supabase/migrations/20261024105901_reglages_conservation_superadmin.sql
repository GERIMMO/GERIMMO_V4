-- Réglage des durées par le superadmin permanent (demande du 24/10/2026).
-- Aucune durée, activation ou donnée métier ne change au déploiement.
-- Retour : supabase/retours-arriere/20261024105901_reglages_conservation_superadmin.retour.sql
-- Appliquer APRÈS 20261024150000 : ordre explicite du manifeste, malgré l'heure du fichier généré par le CLI.

alter table public.retention_rules add column if not exists revision bigint not null default 0;
alter table public.retention_rules add column if not exists duree_initiale_mois integer;
update public.retention_rules set duree_initiale_mois = duree_mois where duree_initiale_mois is null;
alter table public.retention_rules alter column duree_initiale_mois set not null;
create or replace function public.initialiser_duree_conservation()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.duree_initiale_mois := coalesce(new.duree_initiale_mois, new.duree_mois);
  return new;
end $$;
revoke all on function public.initialiser_duree_conservation() from public, anon, authenticated;
drop trigger if exists initialiser_duree_conservation on public.retention_rules;
create trigger initialiser_duree_conservation before insert on public.retention_rules
for each row execute function public.initialiser_duree_conservation();

alter table public.retention_rules add column if not exists minimum_mois integer not null default 1;
update public.retention_rules set minimum_mois = case
  when data_type = 'document:document_test' then 0
  when data_type = 'archive:facture' then 72
  when data_type in ('archive:preuve_contrat','contrat:retractation','journal:audit_preuve_contrat','document:rapport_gestion') then 120
  when data_type = 'compte:inactif' then 24
  when data_type = 'journal:effacements_a_reappliquer' then 4
  else 1 end;

-- Seul le geste dédié peut modifier une durée : pas d'écriture directe via l'API.
revoke insert, update, delete on public.retention_rules from authenticated, anon;
-- Catalogue public limité aux métadonnées, sans motif de décision ni identité de l'administrateur.
grant select (data_type,libelle,declencheur,duree_mois,duree_initiale_mois,sort,actif,updated_at) on public.retention_rules to anon;
drop policy if exists retention_rules_public on public.retention_rules;
create policy retention_rules_public on public.retention_rules for select to anon using (true);

create or replace function public.modifier_duree_conservation(
  p_categorie text, p_duree_mois integer, p_revision bigint, p_motif text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r public.retention_rules; v_motif text := btrim(p_motif); v_date timestamptz := clock_timestamp();
begin
  if not coalesce(public.is_permanent_super_admin(), false) then
    raise exception 'Superadmin permanent avec second facteur requis' using errcode = '42501';
  end if;
  if v_motif is null or length(v_motif) < 10 or length(v_motif) > 1000 then
    raise exception 'Indiquez un motif entre 10 et 1 000 caractères' using errcode = '22023';
  end if;
  select * into r from public.retention_rules where data_type = p_categorie for update;
  if not found then raise exception 'Catégorie inconnue' using errcode = '22023'; end if;
  if p_revision is null or r.revision is distinct from p_revision then
    raise exception 'Cette durée a changé. Rechargez la page avant de réessayer.' using errcode = '40001';
  end if;
  if p_duree_mois is null or p_duree_mois < r.minimum_mois or p_duree_mois > 240 then
    raise exception 'Durée attendue : de % à 240 mois', r.minimum_mois using errcode = '22023';
  end if;
  if p_duree_mois = r.duree_mois then return jsonb_build_object('modifiee', false); end if;
  update public.retention_rules set duree_mois = p_duree_mois, updated_at = v_date, revision = r.revision + 1 where id = r.id;
  insert into public.audit_log (account_id, action, details)
  values ((select auth.uid()), 'conservation_regle_modifiee', jsonb_build_object(
    'categorie', r.data_type, 'libelle', r.libelle, 'ancienne_duree_mois', r.duree_mois,
    'nouvelle_duree_mois', p_duree_mois, 'actif', r.actif, 'motif', v_motif));
  return jsonb_build_object('modifiee', true, 'revision', r.revision + 1);
end $$;
revoke all on function public.modifier_duree_conservation(text,integer,bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.modifier_duree_conservation(text,integer,bigint,text) to authenticated;

-- Une archive déjà constituée garde son échéance. Les nouveaux réglages ne changent que les futures archives.
alter table public.archives_comptes add column if not exists factures_duree_mois integer not null default 72;
create or replace function public.archives_comptes_echeances()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_mois integer;
begin
  if exists (select 1 from jsonb_array_elements(new.factures) e
              where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'emise_le', '') !~ '^\d{4}-\d{2}-\d{2}$'
                 or (e ? 'exercice_clos_le' and coalesce(e ->> 'exercice_clos_le', '') !~ '^\d{4}-\d{2}-\d{2}$')) then
    raise exception 'Chaque facture archivée porte sa date d''émission (emise_le, AAAA-MM-JJ) et, le cas échéant, la fin de son exercice (exercice_clos_le, AAAA-MM-JJ)' using errcode = '22023';
  end if;
  select r.duree_mois into v_mois from public.retention_rules r where r.data_type = 'archive:facture';
  new.archive_le := now();
  new.factures_duree_mois := greatest(72, coalesce(v_mois, 72));
  -- Preuve d'un contrat conclu par voie électronique : dix ans (code de la consommation, L. 213-1, D. 213-1 et
  -- D. 213-2), comptés de la fin du dernier abonnement payé (plan du 23/10, choix 5 ; décision du 23/10).
  -- À relire par le juriste (source non ouverte le 23/10/2026).
  new.preuve_conservee_jusqu_au := (new.fin_dernier_abonnement_paye + make_interval(months => greatest(120, coalesce((select duree_mois from public.retention_rules where data_type = 'archive:preuve_contrat'), 120))))::date;
  -- Factures : voir echeance_facture_archivee (six ans, livre des procédures fiscales, L. 102 B ; éditeur non
  -- commerçant, décision du 23/10). Échéance de la dernière ; chacune se retire à la sienne.
  new.factures_conservees_jusqu_au := (select max(public.echeance_facture_archivee(e, new.fin_dernier_abonnement_paye, v_mois))
                                         from jsonb_array_elements(new.factures) e);
  new.factures_purgees_le := null;
  return new;
end $$;
create or replace function public.purger_archives_comptes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_mois_factures integer := public.duree_conservation_active('archive:facture');
  v_factures bigint := 0;
  v_archives bigint := 0;
begin
  if v_mois_factures is not null then
    update public.archives_comptes a
       set factures = coalesce((select jsonb_agg(x.e order by x.rang)
                                  from jsonb_array_elements(a.factures) with ordinality x(e, rang)
                                 where public.echeance_facture_archivee(x.e, a.fin_dernier_abonnement_paye, a.factures_duree_mois) >= v_jour), '[]'::jsonb),
           factures_purgees_le = now()
     where exists (select 1 from jsonb_array_elements(a.factures) e
                    where public.echeance_facture_archivee(e, a.fin_dernier_abonnement_paye, a.factures_duree_mois) < v_jour);
    get diagnostics v_factures = row_count;
  end if;
  if public.duree_conservation_active('archive:preuve_contrat') is not null then
    delete from public.archives_comptes a
     where a.preuve_conservee_jusqu_au < v_jour and jsonb_array_length(a.factures) = 0;
    get diagnostics v_archives = row_count;
  end if;
  return jsonb_build_object('archives_comptes_factures_retirees', v_factures, 'archives_comptes_supprimees', v_archives);
end $$;
create or replace function public.archives_comptes_garde()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_mois integer;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Les archives de comptes ne se vident pas' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.preuve_conservee_jusqu_au >= v_jour or jsonb_array_length(old.factures) > 0 then
      raise exception 'Une archive de compte ne se supprime qu''au terme de sa conservation (preuve jusqu''au %, % facture(s) encore conservée(s))',
        old.preuve_conservee_jusqu_au, jsonb_array_length(old.factures) using errcode = '42501';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - 'factures' - 'factures_purgees_le') is distinct from (to_jsonb(old) - 'factures' - 'factures_purgees_le') then
    raise exception 'Une archive de compte ne se modifie pas' using errcode = '42501';
  end if;
  -- La date de purge est celle de la base, posée au retrait d'une facture et à lui seul (relecture adverse M4).
  if new.factures is not distinct from old.factures then
    if new.factures_purgees_le is distinct from old.factures_purgees_le then
      raise exception 'Une archive de compte ne se modifie pas' using errcode = '42501';
    end if;
    return new;
  end if;
  new.factures_purgees_le := now();
  -- La durée du catalogue, active ou non (même lecture que archives_comptes_echeances) ; jamais moins de six ans.
  v_mois := old.factures_duree_mois;
  -- Chaque facture gardée l'est à l'identique, sans copie de plus ; chaque facture retirée est arrivée à son échéance.
  -- Les factures se comptent (M4) : deux copies identiques sont deux factures, aucune ne part avant son terme.
  if exists (select 1
               from (select n.e, count(*) as c from jsonb_array_elements(new.factures) n(e) group by n.e) nouvelles
               left join (select o.e, count(*) as c from jsonb_array_elements(old.factures) o(e) group by o.e) anciennes
                 on anciennes.e = nouvelles.e
              where anciennes.c is null or nouvelles.c > anciennes.c)
     or exists (select 1
                  from (select o.e, count(*) as c from jsonb_array_elements(old.factures) o(e) group by o.e) anciennes
                  left join (select n.e, count(*) as c from jsonb_array_elements(new.factures) n(e) group by n.e) nouvelles
                    on nouvelles.e = anciennes.e
                 where coalesce(nouvelles.c, 0) < anciennes.c
                   and public.echeance_facture_archivee(anciennes.e, old.fin_dernier_abonnement_paye, v_mois) >= v_jour) then
    raise exception 'Seules les factures arrivées au terme de leur conservation se retirent d''une archive' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace function public.comptes_inactifs_a_prevenir(p_version_min text, p_limite integer default 200)
returns table (account_id uuid, email text, etape text, nature text, organisation text, titulaire boolean,
               derniere_activite_le timestamptz, suppression_le date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if (select auth.role()) is distinct from 'service_role' and (select auth.role()) is not null then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_version_min is null then return; end if;
  if p_version_min !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  -- ACTIVATION_INACTIVITE_20261024 : la règle du catalogue décide aussi (V1 du 24/10/2026, migration 20261024150000).
  if not exists (select 1 from public.retention_rules regle where regle.data_type = 'compte:inactif' and regle.actif) then return; end if;
  return query
  with candidats as (
    select a.id, a.email, act.derniere_activite_le as activite, act.nature, act.organisation, act.titulaire,
           ((act.derniere_activite_le at time zone 'Europe/Paris')::date + make_interval(months => greatest(24, public.duree_conservation_active('compte:inactif'))))::date as base
      from public.accounts a
      cross join lateral public.activite_compte(a.id) act
     where a.efface_le is null
       and not exists (select 1 from public.memberships m where m.account_id = a.id and m.role = 'super_admin')
       and not exists (select 1 from public.fermetures_comptes f where f.account_id = a.id and f.statut = 'programmee')
       and exists (select 1 from public.acceptations_cgu c
                    where c.account_id = a.id and c.version ~ '^\d{4}-\d{2}-\d{2}$' and c.version >= p_version_min)
       and not act.abonnement_en_cours
       and act.derniere_activite_le is not null
  ), etat as (
    select c.*, j60.suppression_prevue_le as annonce,
           exists (select 1 from public.avertissements_inactivite j
                    where j.account_id = c.id and j.etape = 'j15' and j.derniere_activite_le = c.activite) as j15_envoye
      from candidats c
      left join public.avertissements_inactivite j60
        on j60.account_id = c.id and j60.etape = 'j60' and j60.derniere_activite_le = c.activite
  )
  select * from (
    select e.id, e.email, 'j60'::text, e.nature, e.organisation, e.titulaire, e.activite, greatest(e.base, v_jour + 60)
      from etat e where e.annonce is null and v_jour >= e.base - 60
    union all
    select e.id, e.email, 'j15'::text, e.nature, e.organisation, e.titulaire, e.activite, greatest(e.base, e.annonce, v_jour + 15)
      from etat e where e.annonce is not null and not e.j15_envoye and v_jour >= greatest(e.base, e.annonce) - 15
  ) x
  order by 8, 1
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
end $$;
create or replace function public.fermetures_comptes_programmer_inactifs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_programmees integer := 0;
  v_echecs integer := 0;
  v_act record;
  r record;
begin
  -- ACTIVATION_INACTIVITE_20261024 : la règle du catalogue décide aussi (V1 du 24/10/2026, migration 20261024150000).
  if not exists (select 1 from public.retention_rules regle where regle.data_type = 'compte:inactif' and regle.actif) then
    return jsonb_build_object('programmees', 0, 'echecs', 0, 'regle_inactive', true);
  end if;
  for r in
    select j60.account_id, j15.suppression_prevue_le, j60.derniere_activite_le
      from public.avertissements_inactivite j60
      join public.avertissements_inactivite j15
        on j15.account_id = j60.account_id and j15.etape = 'j15' and j15.derniere_activite_le = j60.derniere_activite_le
      join public.accounts a on a.id = j60.account_id and a.efface_le is null
     where j60.etape = 'j60' and j60.suppression_prevue_le <= v_jour and j15.suppression_prevue_le <= v_jour
       and not exists (select 1 from public.fermetures_comptes f
                        where f.account_id = j60.account_id
                          and (f.statut = 'programmee'
                               or (f.origine = 'inactivite' and f.derniere_activite_le = j60.derniere_activite_le)))
  loop
    select * into v_act from public.activite_compte(r.account_id);
    continue when v_act.derniere_activite_le is distinct from r.derniere_activite_le or v_act.abonnement_en_cours;
    continue when ((v_act.derniere_activite_le at time zone 'Europe/Paris')::date
      + make_interval(months => greatest(24, public.duree_conservation_active('compte:inactif'))))::date > v_jour;
    begin
      perform public.programmer_fermeture_compte(r.account_id, 'inactivite', null, null, null, null, v_jour,
                                                 r.derniere_activite_le);
      v_programmees := v_programmees + 1;
    exception when others then
      v_echecs := v_echecs + 1;
    end;
  end loop;
  return jsonb_build_object('programmees', v_programmees, 'echecs', v_echecs);
end $$;
create or replace function public.executer_fermeture_compte(p_fermeture uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.fermetures_comptes;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
  v_inactif boolean;
  v_abo jsonb;
  v_act record;
  v_bilan jsonb;
  v_frais jsonb;
  v_hors_bilan jsonb;
  v_artisan uuid;
  v_email text;
  v_attente text;
  v_motif text;
  v_retractations integer;
begin
  -- Les gardes suspendues le temps de l'effacement posent un verrou de table : ne jamais l'attendre longtemps.
  perform pg_catalog.set_config('lock_timeout', '10s', true);
  select * into f from public.fermetures_comptes where id = p_fermeture for update;
  if not found then raise exception 'Fermeture inconnue' using errcode = 'P0002'; end if;
  if f.statut <> 'programmee' then return jsonb_build_object('etat', 'deja_' || f.statut); end if;
  if not public.tache_planifiee_autorisee('fermetures-comptes') then return jsonb_build_object('etat', 'arret_en_cours'); end if;
  if f.effacement_prevu_le > v_jour then return jsonb_build_object('etat', 'pas_encore'); end if;
  if f.gel_motif is not null then return jsonb_build_object('etat', 'gelee'); end if;
  v_inactif := f.origine = 'inactivite';
  -- Relire le délai même si la fermeture a été programmée avant son allongement.
  if v_inactif and (public.duree_conservation_active('compte:inactif') is null
     or ((f.derniere_activite_le at time zone 'Europe/Paris')::date
       + make_interval(months => greatest(24, public.duree_conservation_active('compte:inactif'))))::date > v_jour) then
    return jsonb_build_object('etat', 'pas_encore');
  end if;
  -- Finitions du 24/10 (relecture transverse, I2 et I4) : chaque attente, la date d'effet passée, est notée sur la
  -- ligne (tentative et motif lisibles dans la console), au lieu d'une date d'effacement dépassée sans explication.
  if f.bilan_simulation is null then
    v_attente := 'simulation_manquante';
    v_motif := 'En attente : aucun bilan de simulation enregistré (« Enregistrer le nouveau bilan »).';
  elsif not public.sauvegarde_du_jour_reussie() then
    v_attente := 'sauvegarde_manquante';
    v_motif := 'En attente : aucune sauvegarde quotidienne réussie aujourd''hui ; la fermeture repassera la nuit suivante.';
  elsif exists (select 1 from public.memberships where account_id = f.account_id and role = 'super_admin') then
    v_attente := 'compte_de_supervision';
    v_motif := 'Refus : un compte de supervision ne se ferme pas par cette procédure.';
  else
    v_abo := public.abonnement_de_fermeture(f.account_id, v_inactif);
    if coalesce((v_abo ->> 'vivante')::boolean, false) then
      v_attente := 'souscription_active';
      v_motif := 'En attente : une souscription Stripe des espaces effacés vit encore (arrêt levé, résiliation reportée au terme, ou fin de période pas encore atteinte). L''effacement attend son arrêt ; vérifier la souscription chez Stripe.';
    elsif cardinality(public.souscriptions_laissees(f.account_id, v_inactif)) > 0 then
      v_attente := 'souscription_laissee';
      v_motif := 'En attente : le compte laisserait une souscription en cours à des gestionnaires restants (transmettre la titularité ou résilier).';
    elsif exists (select 1 from public.bail_signature_circuits c
                   where c.organization_id in (select public.organisations_effacees_par(f.account_id, v_inactif))
                     and c.etat in ('preparation', 'en_cours', 'a_verifier')) then
      v_attente := 'signature_en_cours';
      v_motif := 'En attente : une signature électronique est en cours dans un espace effacé.';
    -- Finitions du 24/10 (relecture transverse, B1) : une rétractation d'un espace effacé dont le remboursement ou
    -- l'accusé n'est pas fait retient l'effacement ; la reprise de nuit des rétractations la termine d'abord.
    elsif exists (select 1 from public.retractations_abonnement r
                   where r.organization_id in (select public.organisations_effacees_par(f.account_id, v_inactif))
                     and (r.executee_le is null or r.accuse_envoye_le is null)) then
      v_attente := 'retractation_en_cours';
      v_motif := 'En attente : une rétractation d''un espace effacé n''est pas terminée (remboursement ou accusé de réception) ; la reprise de nuit la termine, la fermeture repassera ensuite.';
    end if;
  end if;
  if v_attente is not null then
    update public.fermetures_comptes
       set derniere_erreur = left(v_motif, 2000), derniere_tentative_le = now()
     where id = f.id;
    return jsonb_build_object('etat', v_attente);
  end if;
  if v_inactif then
    select * into v_act from public.activite_compte(f.account_id);
    if v_act.derniere_activite_le is distinct from f.derniere_activite_le or v_act.abonnement_en_cours then
      update public.fermetures_comptes
         set statut = 'annulee', annulee_le = now(), adresse_courriel = null,
             annulation_motif = 'Le compte a servi depuis les avertissements (connexion ou abonnement) : suppression annulée.'
       where id = f.id;
      return jsonb_build_object('etat', 'annulee_activite');
    end if;
    perform public.simuler_fermeture_compte(f.account_id, f.id);
  else
    v_frais := public.simuler_fermeture_compte(f.account_id, null);
    select coalesce(jsonb_agg(o -> 'organisation'), '[]'::jsonb) into v_hors_bilan
      from jsonb_array_elements(v_frais -> 'organisations_effacees') o
     where not exists (select 1 from jsonb_array_elements(f.bilan_simulation -> 'organisations_effacees') e
                        where e ->> 'organisation' = o ->> 'organisation');
    if jsonb_array_length(v_hors_bilan) > 0
       or (v_frais ->> 'artisan' is not null and f.bilan_simulation ->> 'artisan' is distinct from v_frais ->> 'artisan') then
      update public.fermetures_comptes
         set derniere_erreur = left('Bilan changé depuis la programmation : '
               || case when jsonb_array_length(v_hors_bilan) = 1 then 'un espace serait désormais effacé entièrement'
                       when jsonb_array_length(v_hors_bilan) > 1
                       then jsonb_array_length(v_hors_bilan) || ' espaces seraient désormais effacés entièrement'
                       else 'une fiche d''artisan est désormais concernée' end
               || '. Relisez le bilan (« Enregistrer le nouveau bilan ») ou annulez la fermeture.', 2000),
             derniere_tentative_le = now()
       where id = f.id;
      return jsonb_build_object('etat', 'bilan_change');
    end if;
  end if;

  select email into v_email from public.accounts where id = f.account_id and efface_le is null;
  if v_email is not null and f.adresse_courriel is distinct from v_email then
    update public.fermetures_comptes set adresse_courriel = v_email where id = f.id;
  end if;
  select id into v_artisan from public.artisans where account_id = f.account_id;
  -- Les déclarations de rétractation des espaces effacés restent, détachées (consigne A) : le bilan les compte.
  select count(*) into v_retractations from public.retractations_abonnement r
   where r.organization_id in (select public.organisations_effacees_par(f.account_id, v_inactif));
  v_bilan := public.effacer_compte_ferme(f.account_id, f.id) || jsonb_build_object('retractations_conservees', v_retractations);
  update public.fermetures_comptes
     set statut = 'executee', executee_le = now(), mode_effacement = v_bilan ->> 'mode', bilan_execution = v_bilan,
         tentatives = tentatives + 1, derniere_tentative_le = now(), derniere_erreur = null
   where id = f.id;
  insert into public.effacements_a_reappliquer (fermeture_id, account_id_origine, organisations_effacees,
                                                artisan_id_origine, executee_le, remboursement_cents, remboursements_faits,
                                                rembourse_le)
  select f.id, f.account_id,
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(v_bilan -> 'organisations_effacees') x), '{}'),
         v_artisan, now(), z.remboursement_cents, z.remboursements_faits, z.rembourse_le
    from public.fermetures_comptes z where z.id = f.id
  on conflict (fermeture_id) do nothing;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (null, null, 'compte_ferme',
          jsonb_build_object('fermeture_id', f.id, 'compte', f.account_id, 'origine', f.origine,
                             'bilan', v_bilan - 'organisations_noms'));
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return jsonb_build_object('etat', 'executee', 'bilan', v_bilan);
end $$;
create or replace function public.action_audit_controle_interne(p_action text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(left(p_action, 9) = 'traversee' or left(p_action, 8) = 'support_' or left(p_action, 12) = 'maintenance_'
                  or left(p_action, 13) = 'consultation_' or left(p_action, 10) = 'fermeture_'
                  or left(p_action, 12) = 'effacements_'
                  or p_action in ('conservation_regle_modifiee', 'purge_retention', 'compte_ferme', 'liste_attente_exportee'), false);
$$;
create or replace function public.cibles_conservation_complementaire()
returns table (categorie text, objet text, id text)
language sql
stable
security definer
set search_path = ''
as $$
  with jour as (select (now() at time zone 'Europe/Paris')::date as j),
  duree as (select r.data_type, r.duree_mois from public.retention_rules r where r.sort in ('suppression', 'anonymisation')),
  retours as (
    select r.id, r.nature, r.etat, r.organization_id, r.titre,
           greatest(r.cree_le, r.modifie_le, (select max(h.cree_le) from public.retours_historique h where h.retour_id = r.id)) as dernier
      from public.retours_utilisateurs r
     where r.nature in ('question', 'idee', 'contestation')
  ),
  -- Comptes jamais connectés, sans adhésion active, sans fiche d'artisan, sans invitation restante. Un compte d'invité
  -- est créé CONFIRMÉ par l'invitation (preparer_invitation_locataire) : il est reconnu à ses invitations, ou au repère
  -- « compte:invite » que la purge des contacts pose avant d'effacer les invitations échues.
  comptes as (
    select u.id, u.created_at, u.email_confirmed_at,
           exists (select 1 from public.invitations_locataires i where i.account_id = u.id)
             or exists (select 1 from public.conservation_reperes r where r.categorie = 'compte:invite' and r.objet_id = u.id) as invite,
           greatest((select max(greatest(i.expire_le, coalesce(i.repondu_le, i.expire_le)))
                       from public.invitations_locataires i where i.account_id = u.id),
                    (select r.depuis from public.conservation_reperes r where r.categorie = 'compte:invite' and r.objet_id = u.id)) as derniere_invitation
      from auth.users u
     where u.last_sign_in_at is null
       and not exists (select 1 from public.memberships m where m.account_id = u.id and m.status = 'active')
       and not exists (select 1 from public.artisans a where a.account_id = u.id)
       and not exists (select 1 from public.invitations_locataires i where i.account_id = u.id
                        and (i.etat = 'acceptee' or (i.etat = 'en_attente' and i.expire_le > now())))
  )
  -- Preuves de signature d'un bail : circuits clos — ou restés ouverts mais expirés (l'annulation chez Zoho est au
  -- lot 5) —, quand toutes les pièces du bail arrivent à leur terme.
  select 'preuve:signature', 'bail_signature_circuits', c.id::text
    from public.bail_signature_circuits c
   where c.bail_id is not null and (c.etat in ('pret', 'termine', 'annule', 'refuse', 'expire') or c.expire_le < now())
     and public.echeance_conservation_bail(c.bail_id, (select duree_mois from duree where data_type = 'preuve:signature')) <= (select j from jour)
  union all
  select 'preuve:signature', 'demandes_signature', ds.id::text
    from public.demandes_signature ds
   where exists (select 1 from public.document_liens l where l.document_id = ds.document_id and l.entite = 'bail')
     and not exists (select 1 from public.document_liens l where l.document_id = ds.document_id and l.entite = 'bail'
                      and coalesce(public.echeance_conservation_bail(l.entite_id, (select duree_mois from duree where data_type = 'preuve:signature'))
                                   > (select j from jour), true))
  union all
  -- Pièces d'une personne sans bail : trois mois après le dernier dépôt sur chaque personne rattachée.
  select 'dossier:sans_bail', 'documents', d.id::text
    from public.documents d
   where d.purged_at is null and public.document_dossier_sans_bail(d.id)
     and not exists (select 1 from public.document_liens l where l.document_id = d.id and l.entite = 'personne'
                      and coalesce(public.echeance_dossier_sans_bail(l.entite_id, (select duree_mois from duree where data_type = 'dossier:sans_bail'))
                                   > (select j from jour), true))
  union all
  select 'support:demande_droits', 'retours_utilisateurs', r.id::text from retours r
   where r.nature = 'question' and r.organization_id is null and r.titre like 'Données personnelles — %'
     and r.etat in ('resolu', 'non_retenue', 'deja_couverte')
     and r.dernier < now() - make_interval(months => (select duree_mois from duree where data_type = 'support:demande_droits'))
  union all
  select 'support:question_idee', 'retours_utilisateurs', r.id::text from retours r
   where r.nature in ('question', 'idee')
     and not (r.nature = 'question' and r.organization_id is null and r.titre like 'Données personnelles — %')
     and r.dernier < now() - make_interval(months => (select duree_mois from duree where data_type = 'support:question_idee'))
  union all
  select 'support:contestation', 'retours_utilisateurs', r.id::text from retours r
   where r.nature = 'contestation' and r.etat in ('resolu', 'non_retenue', 'deja_couverte')
     and r.dernier < now() - make_interval(months => (select duree_mois from duree where data_type = 'support:contestation'))
  union all
  select 'artisan:evaluation', 'artisan_evaluations', e.id::text from public.artisan_evaluations e
   where e.created_at < now() - make_interval(months => (select duree_mois from duree where data_type = 'artisan:evaluation'))
  union all
  -- Prospects : opposition (« Stop », marquée sur la fiche ou empreinte de son adresse : une fiche recréée pour une
  -- adresse opposée part aussi) ou 36 mois sans contact venu du prospect.
  select 'contact:prospect', 'supervision_prospects', p.id::text from public.supervision_prospects p
   where p.oppose_le is not null
      or exists (select 1 from public.oppositions_prospection o where o.empreinte = public.empreinte_adresse_prospection(p.email))
      or p.dernier_contact_prospect_le < now() - make_interval(months => (select duree_mois from duree where data_type = 'contact:prospect'))
  union all
  select 'prospect:opposition', 'oppositions_prospection', o.empreinte from public.oppositions_prospection o
   where o.cree_le < now() - make_interval(months => (select duree_mois from duree where data_type = 'prospect:opposition'))
  union all
  -- Comptes jamais utilisés : invité jamais connecté (trois mois après sa dernière invitation) ; inscription jamais
  -- confirmée (un mois après sa création).
  select 'compte:invitation_jamais_utilisee', 'auth.users', c.id::text from comptes c
   where c.invite
     and greatest(c.created_at, c.derniere_invitation) < now() - make_interval(months => (select duree_mois from duree where data_type = 'compte:invitation_jamais_utilisee'))
  union all
  select 'compte:inscription_non_confirmee', 'auth.users', c.id::text from comptes c
   where not c.invite and c.email_confirmed_at is null
     and c.created_at < now() - make_interval(months => (select duree_mois from duree where data_type = 'compte:inscription_non_confirmee'))
  union all
  select 'archive:facture', 'archives_comptes', a.id::text from public.archives_comptes a
   where exists (select 1 from jsonb_array_elements(a.factures) e
                  where public.echeance_facture_archivee(e, a.fin_dernier_abonnement_paye,
                          a.factures_duree_mois) < (select j from jour))
  union all
  select 'archive:preuve_contrat', 'archives_comptes', a.id::text from public.archives_comptes a
   where a.preuve_conservee_jusqu_au < (select j from jour)
  union all
  -- Finitions du 24/10 (relecture transverse, B2) : un paiement de facture (`invoice.paid`) reste tant qu'un abonnement
  -- porte encore ce client Stripe. C'est de lui que la fermeture tire les références des factures et la date de début
  -- de l'archive (`archiver_preuve_compte`) ; purgé à six mois, l'archive perdait les factures plus anciennes (six ans,
  -- archive:facture) et le client Stripe pouvait être supprimé trop tôt. Une fois l'espace effacé, l'archive les porte.
  select 'journal:abonnement_evenements', 'abonnement_evenements', e.stripe_event_id from public.abonnement_evenements e
   where e.traite_le is not null
     and e.traite_le < now() - make_interval(months => (select duree_mois from duree where data_type = 'journal:abonnement_evenements'))
     and not (e.type = 'invoice.paid'
              and exists (select 1 from public.abonnements a where a.stripe_customer_id = e.charge ->> 'client'))
  union all
  -- Déclarations de rétractation (vente) : dix ans après la déclaration, jamais moins (intégration du 24/10).
  select 'contrat:retractation', 'retractations_abonnement', r.id::text from public.retractations_abonnement r
   where public.echeance_retractation_abonnement(r.declaree_le, (select duree_mois from duree where data_type = 'contrat:retractation'))
         < (select j from jour)
  union all
  -- Registre des effacements à réappliquer (comptes) : quatre mois après l'exécution de la fermeture, au-delà de la
  -- durée des sauvegardes qu'une restauration pourrait remettre (intégration du 24/10).
  select 'journal:effacements_a_reappliquer', 'effacements_a_reappliquer', e.fermeture_id::text from public.effacements_a_reappliquer e
   where e.executee_le < now() - make_interval(months => (select duree_mois from duree where data_type = 'journal:effacements_a_reappliquer'));
$$;

select public.fermer_fonctions_a_anon();
