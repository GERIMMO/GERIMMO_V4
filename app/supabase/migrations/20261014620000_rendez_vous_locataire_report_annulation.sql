-- Report ou annulation d'un rendez-vous confirmé par le LOCATAIRE (audit du 13 octobre 2026, fiches LOC-21,
-- CHN-01 et REP-04 ; décision D22 du dirigeant du 14/10/2026, option B).
--
-- CE QUI MANQUAIT. Une fois le rendez-vous confirmé, le locataire n'avait aucun geste : l'écran disait « Prévoyez
-- d'être présent… ». Le report n'existait que côté artisan (« Déplacer le rendez-vous »), l'annulation que côté
-- gérant (« Retirer la mission »). Le contournement était un message libre au gestionnaire.
--
-- LA DÉCISION (option B) :
--   · REPORT demandé par le locataire, AVEC accord de l'artisan : le locataire propose trois nouvelles dates et un
--     motif ; le rendez-vous confirmé RESTE VALABLE tant que l'artisan n'a pas répondu (il n'y a jamais de « trou ») ;
--     l'artisan retient l'une des dates (le rendez-vous change alors, et seulement alors) ou refuse (le rendez-vous
--     est maintenu, le gérant arbitre) ; sans réponse dans le délai, la demande expire, le rendez-vous est maintenu
--     et le gérant est prévenu par une alerte ;
--   · ANNULATION par le locataire, SANS accord de l'artisan mais AVEC alerte au gérant ou au propriétaire : effet
--     immédiat, le créneau confirmé devient caduc et la mission revient « acceptée — rendez-vous à fixer » ; l'accord
--     de l'artisan reste exigé pour tout nouveau créneau (il repropose, le locataire choisit — circuit existant).
--   Réponses ratifiées aux questions C.15 : annulation à effet immédiat avec alerte (C.15-1 = B) ; délai minimal
--   avant le rendez-vous pour demander un report : 24 h (C.15-2) ; au plus 2 demandes de report par mission
--   (C.15-3) ; l'artisan répond dans les 48 h, après quoi la demande expire (C.15-4) ; une annulation à moins de
--   24 h est seulement TRACÉE (fil de l'incident, alerte « annulation tardive »), sans sanction ni « déplacement
--   perdu » imputé à quiconque (C.15-5). Ces trois nombres vivent à UN SEUL endroit : `parametres_rdv_locataire()`.
--   Les délais se comptent sur des INSTANTS (`debut_prevu`, `now()`) : 24 h avant un rendez-vous ne dépend d'aucun
--   fuseau ; aucun `current_date` nouveau ici.
--
-- CE QUE POSE CETTE MIGRATION (additive, aucune ligne existante modifiée ni réécrite) :
--   · la table `intervention_demandes_rdv` (une demande : report ou annulation ; états EXACTEMENT ceux de la fiche
--     C.4 : en_attente → acceptee | refusee | expiree | retiree | arbitree ; une seule en attente par mission ; clé
--     d'envoi unique par mission pour le rejeu sûr, patron retours_utilisateurs.cle_envoi), lisible par les gérants
--     dans leur portefeuille, écrite UNIQUEMENT par fonction ;
--   · `intervention_creneaux.demande_id` : les trois dates d'un report sont rattachées à leur demande ;
--   · `intervention_rappels.debut_prevu` et la clé d'unicité des rappels étendue à la date du rendez-vous : un
--     rappel tracé pour l'ANCIENNE date ne prive pas le rendez-vous reporté de son rappel (C.12-2) ;
--   · six types d'événement de chronologie : rdv_report_demande, rdv_report_accepte, rdv_report_refuse,
--     rdv_report_retire, rdv_report_expire, rdv_annule_par_locataire (libellés dans src/lib/incidents.ts) ;
--   · trois types d'alerte, tous adressés au gérant/propriétaire et fermés d'eux-mêmes quand la mission avance
--     (nouveau rendez-vous, démarrage, fin, annulation) : rdv_annule_locataire, rdv_annule_tardif,
--     rdv_demande_sans_reponse ; le refus de l'artisan réutilise l'alerte `creneaux_arbitrage` existante ;
--   · les fonctions du locataire : demander_report_rdv, annuler_rdv_locataire, retirer_demande_rdv,
--     mes_rendez_vous_locataire (lecture) ; de l'artisan : mes_demandes_rdv_artisan (lecture) — l'accord passe par
--     accepter_creneau_locataire et le refus par refuser_creneaux_locataire, qui existent ; de la tâche planifiée :
--     expirer_demandes_rdv.
--
-- FONCTIONS EXISTANTES MODIFIÉES EN RELISANT LEUR DÉFINITION EN VIGUEUR (pg_get_functiondef), comme 20261013120000 :
-- une fonction réécrite à la main écraserait les gardes injectées par les migrations suivantes. Chaque ancre tient
-- sur UNE SEULE LIGNE (la mise en forme en production diffère du banc : une migration s'est arrêtée le 15/10 sur une
-- ancre de plusieurs lignes) et doit apparaître EXACTEMENT UNE FOIS ; sinon la migration s'arrête (dans la transaction
-- du chantier `migrations.yml`, rien ne subsiste). Rejouable sans effet : chaque bloc cherche la marque
-- « Décision D22 (LOC-21) » de son correctif et, si elle y est, ne fait rien.
--   · accepter_creneau_locataire : clic répété = succès silencieux (REP-04) ; une date de report retenue rend caduc
--     l'ancien rendez-vous (sans quoi l'index « un seul créneau retenu » échoue) et accepte la demande ;
--   · choisir_creneau : clic répété = succès silencieux (REP-04) ;
--   · refuser_creneaux_locataire : refuse aussi la demande de report en attente (le rendez-vous est maintenu) ;
--   · fixer_creneau_arbitrage et fixer_creneau_arbitrage_motive : l'arbitrage tranche la demande (arbitree) et ferme
--     les alertes de rendez-vous nées des gestes du locataire ;
--   · rendez_vous_a_rappeler et marquer_rappel_envoye : la trace d'un rappel porte la date du rendez-vous.
-- D21 (créneaux non retenus « caducs », 20261014302000) est en production : rien n'est refait ici.
--
-- Retour arrière : app/supabase/retours-arriere/20261014620000_rendez_vous_locataire_report_annulation.retour.sql

-- ── 0. Les trois nombres de la décision, à un seul endroit ─────────────────────────────────────────────────────────
create or replace function public.parametres_rdv_locataire()
returns table (delai_report_heures integer, reports_max integer, reponse_artisan_heures integer)
language sql
immutable
parallel safe
set search_path = ''
as $fonction$
  -- C.15-2 : 24 h au moins avant le rendez-vous pour demander un report ; C.15-3 : 2 demandes de report par
  -- mission au plus ; C.15-4 : l'artisan répond dans les 48 h.
  select 24, 2, 48
$fonction$;
comment on function public.parametres_rdv_locataire() is
  'Décision D22 (14/10/2026) : délai minimal avant le rendez-vous pour un report (heures), nombre maximal de reports par mission, délai de réponse de l''artisan (heures).';
revoke all on function public.parametres_rdv_locataire() from public, anon;
grant execute on function public.parametres_rdv_locataire() to authenticated, service_role;

-- ── 1. La chronologie de l'incident sait dire ces gestes ───────────────────────────────────────────────────────────
-- La liste fermée est relue dans la base et COMPLÉTÉE (jamais réécrite de mémoire) : un type ajouté par une autre
-- migration du même jour reste admis, quel que soit l'ordre de passage.
do $correctif$
declare v_def text; v_types text[]; v_nouveaux text[] := array[
  'rdv_report_demande', 'rdv_report_accepte', 'rdv_report_refuse',
  'rdv_report_retire', 'rdv_report_expire', 'rdv_annule_par_locataire'];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.incident_evenements'::regclass and conname = 'incident_evenements_type_check';
  if v_def is null then
    raise exception 'Correctif D22 : la contrainte incident_evenements_type_check est absente (base inattendue)';
  end if;
  select array_agg(t.m[1] order by t.n) into v_types
  from regexp_matches(v_def, '''([a-z0-9_]+)''', 'g') with ordinality as t(m, n);
  if v_types is null or array_length(v_types, 1) < 10 then
    raise exception 'Correctif D22 : liste des types d''événement illisible (%)', v_def;
  end if;
  if v_types @> v_nouveaux then return; end if;
  select v_types || array_agg(u.x order by u.o) into v_types
  from unnest(v_nouveaux) with ordinality as u(x, o) where not (u.x = any (v_types));
  alter table public.incident_evenements drop constraint incident_evenements_type_check;
  execute format('alter table public.incident_evenements add constraint incident_evenements_type_check check (type = any (array[%s]::text[]))',
                 (select string_agg(quote_literal(x), ', ' order by o) from unnest(v_types) with ordinality as w(x, o)));
end $correctif$;

-- ── 2. La demande du locataire ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.intervention_demandes_rdv (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  intervention_id uuid not null,
  -- Le rendez-vous concerné, tel qu'il était au moment de la demande (le créneau retenu, et ses bornes recopiées :
  -- le créneau devient caduc à l'annulation ou à l'accord, la demande garde ce qu'elle visait).
  creneau_retenu_id uuid references public.intervention_creneaux (id),
  rdv_debut timestamptz not null,
  rdv_fin timestamptz,
  type text not null,
  motif_code text not null,
  motif_texte text,
  statut text not null default 'en_attente',
  demandee_par uuid references public.accounts (id),
  demandee_le timestamptz not null default now(),
  -- Report : l'instant où l'artisan doit avoir répondu ; passé, la demande expire et le rendez-vous reste.
  expire_le timestamptz,
  repondu_par uuid references public.accounts (id),
  repondu_le timestamptz,
  reponse_motif text,
  -- Report accepté : la date retenue par l'artisan.
  creneau_accepte_id uuid references public.intervention_creneaux (id),
  -- Annulation à moins du délai minimal : tracée, jamais sanctionnée (C.15-5).
  tardive boolean not null default false,
  -- Rejeu sûr : une clé par formulaire monté (patron retours_utilisateurs.cle_envoi, D05) ; le même envoi rejoué
  -- rend la même demande, sans second e-mail.
  cle_envoi uuid not null,
  constraint intervention_demandes_rdv_id_org_unique unique (id, organization_id),
  constraint intervention_demandes_rdv_intervention_meme_org_fk
    foreign key (intervention_id, organization_id)
    references public.incident_interventions (id, organization_id),
  constraint intervention_demandes_rdv_cle_unique unique (intervention_id, cle_envoi),
  constraint intervention_demandes_rdv_type_check check (type in ('report', 'annulation')),
  -- Liste fermée des motifs (libellés dans src/lib/rendez-vous-locataire.ts) ; la précision libre est bornée.
  constraint intervention_demandes_rdv_motif_check
    check (motif_code in ('empechement', 'travail', 'sante', 'absence', 'probleme_resolu', 'autre')),
  constraint intervention_demandes_rdv_motif_texte_check
    check (motif_texte is null or length(motif_texte) <= 1000),
  -- Les états de la fiche C.4, et rien d'autre.
  constraint intervention_demandes_rdv_statut_check
    check (statut in ('en_attente', 'acceptee', 'refusee', 'expiree', 'retiree', 'arbitree')),
  -- Une demande en attente n'a pas de réponse ; une demande close en a une (instant).
  constraint intervention_demandes_rdv_statut_coherent check ((statut = 'en_attente') = (repondu_le is null)),
  -- Une annulation prend effet immédiatement (option B) : elle est toujours « acceptée ».
  constraint intervention_demandes_rdv_annulation_immediate check (type <> 'annulation' or statut = 'acceptee')
);
comment on table public.intervention_demandes_rdv is
  'Demandes du locataire sur un rendez-vous confirmé (décision D22, 14/10/2026) : report (avec accord de l''artisan) ou annulation (effet immédiat, alerte au gérant). Écrite uniquement par fonction.';
-- Une seule demande en attente par mission.
create unique index if not exists intervention_demandes_rdv_une_en_attente
  on public.intervention_demandes_rdv (intervention_id)
  where statut = 'en_attente';
create index if not exists intervention_demandes_rdv_org_idx
  on public.intervention_demandes_rdv (organization_id, intervention_id, demandee_le desc);
create index if not exists intervention_demandes_rdv_expiration_idx
  on public.intervention_demandes_rdv (expire_le)
  where statut = 'en_attente';

alter table public.intervention_demandes_rdv enable row level security;
-- Lecture par les gérants de l'organisation, dans leur portefeuille ; le locataire et l'artisan lisent par fonction.
-- Aucune écriture directe pour personne : les fonctions ci-dessous sont la seule porte.
revoke all on public.intervention_demandes_rdv from public, anon, authenticated;
grant select on public.intervention_demandes_rdv to authenticated;
drop policy if exists intervention_demandes_rdv_select on public.intervention_demandes_rdv;
create policy intervention_demandes_rdv_select on public.intervention_demandes_rdv for select to authenticated
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
drop policy if exists intervention_demandes_rdv_agent_portefeuille on public.intervention_demandes_rdv;
create policy intervention_demandes_rdv_agent_portefeuille on public.intervention_demandes_rdv
  as restrictive for select to authenticated
  using (not public.intervention_hors_portefeuille(organization_id, intervention_id));
-- Les deux gardes communes à toute table d'organisation, posées sur CETTE table seulement (les deux fonctions
-- `poser_gardes_*` reprennent toutes les tables du schéma : inutile ici, et coûteux en verrous en production).
drop trigger if exists abonnement_intervention_demandes_rdv on public.intervention_demandes_rdv;
create trigger abonnement_intervention_demandes_rdv
  before insert or update or delete on public.intervention_demandes_rdv
  for each row execute function public.refuser_ecriture_si_fermee();
drop trigger if exists diagnostic_artisan_lecture on public.intervention_demandes_rdv;
create trigger diagnostic_artisan_lecture
  before insert or update or delete on public.intervention_demandes_rdv
  for each row execute function public.refuser_mutation_diagnostic_artisan();

-- Les trois dates d'un report sont rattachées à leur demande (affichage, retrait, expiration).
alter table public.intervention_creneaux
  add column if not exists demande_id uuid references public.intervention_demandes_rdv (id);
create index if not exists intervention_creneaux_demande_idx
  on public.intervention_creneaux (demande_id) where demande_id is not null;

-- ── 3. Les rappels suivent la NOUVELLE date (C.12-2) ───────────────────────────────────────────────────────────────
-- `rendez_vous_a_rappeler` écartait tout rendez-vous dont un rappel était déjà tracé, quelle que soit la date (DEC-09) :
-- un rendez-vous reporté après son rappel de la veille n'était plus jamais rappelé. La trace porte désormais la date
-- rappelée. Les traces existantes gardent NULL (aucune réécriture) et continuent de valoir pour leur rendez-vous.
alter table public.intervention_rappels add column if not exists debut_prevu timestamptz;
comment on column public.intervention_rappels.debut_prevu is
  'Le début du rendez-vous que ce rappel annonçait (décision D22) : un rendez-vous reporté a droit à son propre rappel. NULL pour les traces antérieures.';
do $correctif$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.intervention_rappels'::regclass and conname = 'intervention_rappels_une_fois') then
    alter table public.intervention_rappels drop constraint intervention_rappels_une_fois;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.intervention_rappels'::regclass
                   and conname = 'intervention_rappels_une_fois_par_date') then
    -- `nulls not distinct` : deux traces anciennes (date inconnue) du même rappel restent impossibles, comme avant.
    alter table public.intervention_rappels add constraint intervention_rappels_une_fois_par_date
      unique nulls not distinct (intervention_id, echeance, destinataire, debut_prevu);
  end if;
end $correctif$;

-- ── 4. La garde commune : la mission est-elle celle du locataire connecté ? ────────────────────────────────────────
-- Mêmes règles que choisir_creneau et mes_creneaux_locataire : SA personne (ma_personne_locataire), l'incident de SON
-- bail, titulaire ou colocataire, bail actif ou en préavis (bail terminé : lecture seule, aucun geste).
create or replace function public.intervention_du_locataire(p_org uuid, p_intervention uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fonction$
  select public.ma_personne_locataire(p_org) is not null
     and exists (
       select 1
       from public.incident_interventions iv
       join public.incidents i on i.id = iv.incident_id
       join public.baux b on b.id = i.bail_id
       where iv.id = p_intervention and iv.organization_id = p_org and i.organization_id = p_org
         and b.etat in ('actif', 'preavis')
         and (b.locataire_principal = public.ma_personne_locataire(p_org)
              or exists (select 1 from public.bail_personnes bp
                         where bp.bail_id = b.id and bp.role = 'colocataire'
                           and bp.person_id = public.ma_personne_locataire(p_org))))
$fonction$;
-- Outil des fonctions ci-dessous : personne ne l'appelle directement.
revoke all on function public.intervention_du_locataire(uuid, uuid) from public, anon, authenticated;
grant execute on function public.intervention_du_locataire(uuid, uuid) to service_role;

-- ── 5. Demander un report (locataire) ───────────────────────────────────────────────────────────────────────────────
create or replace function public.demander_report_rdv(
  p_org uuid, p_intervention uuid, p_motif_code text, p_motif_texte text, p_creneaux jsonb, p_cle uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fonction$
declare
  v record; p record; v_demande uuid; v_nb integer; v_tour integer; c jsonb;
  v_debut timestamptz; v_fin timestamptz; v_reports integer; v_retenu uuid; v_expire timestamptz; v_motif text;
begin
  if public.ma_personne_locataire(p_org) is null then raise exception 'Accès refusé'; end if;
  if p_cle is null then
    raise exception 'La référence de cet envoi manque : rechargez la page avant de renvoyer votre demande';
  end if;
  select iv.* into v from public.incident_interventions iv
  where iv.id = p_intervention and iv.organization_id = p_org;
  if not found then raise exception 'Intervention introuvable'; end if;
  if not public.intervention_du_locataire(p_org, p_intervention) then raise exception 'Accès refusé'; end if;

  -- Rejeu (double envoi, réponse perdue) : la même clé rend la même demande, rien n'est doublé.
  select d.id into v_demande from public.intervention_demandes_rdv d
  where d.intervention_id = p_intervention and d.cle_envoi = p_cle;
  if found then return v_demande; end if;

  -- Même verrou que les confirmations de rendez-vous : par artisan, puis par mission.
  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text, 0));
  select iv.* into v from public.incident_interventions iv where iv.id = p_intervention for update;
  select d.id into v_demande from public.intervention_demandes_rdv d
  where d.intervention_id = p_intervention and d.cle_envoi = p_cle;
  if found then return v_demande; end if;

  select * into p from public.parametres_rdv_locataire();
  if v.statut <> 'planifiee' or v.debut_prevu is null then
    raise exception 'Cette mission n''a pas de rendez-vous confirmé à reporter';
  end if;
  if v.debut_prevu <= now() then
    raise exception 'Ce rendez-vous est passé ou a commencé : il ne peut plus être reporté ici. Contactez votre gestionnaire';
  end if;
  if v.debut_prevu - now() < make_interval(hours => p.delai_report_heures) then
    raise exception 'Le rendez-vous est dans moins de % heures : il ne peut plus être reporté ici. Vous pouvez encore l''annuler, ou appeler votre gestionnaire', p.delai_report_heures;
  end if;
  if exists (select 1 from public.intervention_demandes_rdv d
             where d.intervention_id = p_intervention and d.statut = 'en_attente') then
    raise exception 'Une demande attend déjà la réponse de l''artisan : retirez-la avant d''en envoyer une autre';
  end if;
  -- Plafond (C.15-3) : les demandes retirées par le locataire lui-même ne comptent pas.
  select count(*) into v_reports from public.intervention_demandes_rdv d
  where d.intervention_id = p_intervention and d.type = 'report' and d.statut <> 'retiree';
  if v_reports >= p.reports_max then
    raise exception 'Ce rendez-vous a déjà fait l''objet de % demandes de report : pour un nouveau changement, contactez votre gestionnaire', p.reports_max;
  end if;
  if p_motif_code is null or p_motif_code not in ('empechement', 'travail', 'sante', 'absence', 'probleme_resolu', 'autre') then
    raise exception 'Choisissez le motif de votre demande';
  end if;
  v_motif := nullif(btrim(coalesce(p_motif_texte, '')), '');
  if length(v_motif) > 1000 then
    raise exception 'Votre précision est trop longue (1 000 caractères au plus)';
  end if;

  -- Les trois dates : mêmes contrôles que contre_proposer_creneaux (instants comparés, pas leur écriture).
  if jsonb_typeof(p_creneaux) is distinct from 'array' then
    raise exception 'Les créneaux doivent être une liste de propositions';
  end if;
  v_nb := jsonb_array_length(p_creneaux);
  if v_nb < 3 then
    raise exception 'Proposez trois nouvelles disponibilités : l''artisan en retiendra une — vous en avez donné %', v_nb;
  end if;
  for c in select jsonb_array_elements(p_creneaux) loop
    if jsonb_typeof(c) is distinct from 'object'
       or jsonb_typeof(c->'debut') is distinct from 'string'
       or jsonb_typeof(c->'fin') is distinct from 'string' then
      raise exception 'Chaque créneau doit contenir une date de début et une date de fin';
    end if;
    begin
      v_debut := (c->>'debut')::timestamptz;
      v_fin := (c->>'fin')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Les dates du créneau sont invalides';
    end;
    if not isfinite(v_debut) or not isfinite(v_fin) then
      raise exception 'Les dates du créneau doivent être finies';
    end if;
    if v_fin <= v_debut then
      raise exception 'Chaque créneau doit se terminer après avoir commencé';
    end if;
    if v_debut <= now() then
      raise exception 'Un créneau doit commencer dans le futur';
    end if;
  end loop;
  if (select count(*) from (
        select (x->>'debut')::timestamptz, (x->>'fin')::timestamptz
        from jsonb_array_elements(p_creneaux) x
        group by 1, 2
      ) distincts) <> v_nb then
    raise exception 'Vos propositions de créneaux doivent être différentes';
  end if;

  select cr.id into v_retenu from public.intervention_creneaux cr
  where cr.intervention_id = p_intervention and cr.statut = 'retenu';
  -- L'artisan répond dans le délai, et au plus tard au début du rendez-vous (passé, il ne se reporte plus).
  v_expire := least(now() + make_interval(hours => p.reponse_artisan_heures), v.debut_prevu);

  insert into public.intervention_demandes_rdv
    (organization_id, intervention_id, creneau_retenu_id, rdv_debut, rdv_fin, type, motif_code, motif_texte,
     statut, demandee_par, expire_le, cle_envoi)
  values (p_org, p_intervention, v_retenu, v.debut_prevu, v.fin_prevue, 'report', p_motif_code, v_motif,
          'en_attente', (select auth.uid()), v_expire, p_cle)
  returning id into v_demande;

  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;
  for c in select jsonb_array_elements(p_creneaux) loop
    insert into public.intervention_creneaux
      (organization_id, intervention_id, propose_par, tour, debut, fin, created_by, demande_id)
    values (p_org, p_intervention, 'locataire', v_tour,
            (c->>'debut')::timestamptz, (c->>'fin')::timestamptz, (select auth.uid()), v_demande);
  end loop;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'rdv_report_demande', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'demande_id', v_demande,
                             'motif_code', p_motif_code, 'motif', v_motif, 'nombre', v_nb,
                             'rdv_debut', v.debut_prevu, 'expire_le', v_expire));
  return v_demande;
exception when unique_violation then
  -- Deux envois simultanés de la même clé : le premier a écrit, le second rend la même demande.
  select d.id into v_demande from public.intervention_demandes_rdv d
  where d.intervention_id = p_intervention and d.cle_envoi = p_cle;
  if found then return v_demande; end if;
  raise exception 'Une demande attend déjà la réponse de l''artisan : retirez-la avant d''en envoyer une autre';
end;
$fonction$;
revoke all on function public.demander_report_rdv(uuid, uuid, text, text, jsonb, uuid) from public, anon;
grant execute on function public.demander_report_rdv(uuid, uuid, text, text, jsonb, uuid) to authenticated;

-- ── 6. Annuler le rendez-vous (locataire, effet immédiat, alerte au gérant) ────────────────────────────────────────
create or replace function public.annuler_rdv_locataire(
  p_org uuid, p_intervention uuid, p_motif_code text, p_motif_texte text, p_cle uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fonction$
declare
  v record; p record; v_demande uuid; v_report uuid; v_retenu uuid; v_tardive boolean; v_motif text; v_numero text;
begin
  if public.ma_personne_locataire(p_org) is null then raise exception 'Accès refusé'; end if;
  if p_cle is null then
    raise exception 'La référence de cet envoi manque : rechargez la page avant de renvoyer votre demande';
  end if;
  select iv.* into v from public.incident_interventions iv
  where iv.id = p_intervention and iv.organization_id = p_org;
  if not found then raise exception 'Intervention introuvable'; end if;
  if not public.intervention_du_locataire(p_org, p_intervention) then raise exception 'Accès refusé'; end if;

  select d.id into v_demande from public.intervention_demandes_rdv d
  where d.intervention_id = p_intervention and d.cle_envoi = p_cle;
  if found then return v_demande; end if;

  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text, 0));
  select iv.* into v from public.incident_interventions iv where iv.id = p_intervention for update;
  select d.id into v_demande from public.intervention_demandes_rdv d
  where d.intervention_id = p_intervention and d.cle_envoi = p_cle;
  if found then return v_demande; end if;

  select * into p from public.parametres_rdv_locataire();
  if v.statut <> 'planifiee' or v.debut_prevu is null then
    raise exception 'Cette mission n''a pas de rendez-vous confirmé à annuler';
  end if;
  if v.debut_prevu <= now() then
    raise exception 'Ce rendez-vous est passé ou a commencé : il ne peut plus être annulé ici. Contactez votre gestionnaire';
  end if;
  if p_motif_code is null or p_motif_code not in ('empechement', 'travail', 'sante', 'absence', 'probleme_resolu', 'autre') then
    raise exception 'Choisissez le motif de votre annulation';
  end if;
  v_motif := nullif(btrim(coalesce(p_motif_texte, '')), '');
  if length(v_motif) > 1000 then
    raise exception 'Votre précision est trop longue (1 000 caractères au plus)';
  end if;
  -- Tardive : moins du délai minimal avant le rendez-vous. Tracée, jamais sanctionnée (C.15-5).
  v_tardive := v.debut_prevu - now() < make_interval(hours => p.delai_report_heures);

  -- Une demande de report en attente tombe avec le rendez-vous qu'elle visait : retirée.
  update public.intervention_demandes_rdv
  set statut = 'retiree', repondu_le = now(), repondu_par = (select auth.uid()),
      reponse_motif = 'Rendez-vous annulé par le locataire'
  where intervention_id = p_intervention and statut = 'en_attente'
  returning id into v_report;
  if v_report is not null then
    update public.intervention_creneaux set statut = 'caduc'
    where demande_id = v_report and statut = 'propose';
    insert into public.incident_evenements
      (organization_id, incident_id, type, acteur_account_id, details)
    values (p_org, v.incident_id, 'rdv_report_retire', (select auth.uid()),
            jsonb_build_object('intervention_id', p_intervention, 'demande_id', v_report,
                               'cause', 'annulation'));
  end if;

  select cr.id into v_retenu from public.intervention_creneaux cr
  where cr.intervention_id = p_intervention and cr.statut = 'retenu';

  insert into public.intervention_demandes_rdv
    (organization_id, intervention_id, creneau_retenu_id, rdv_debut, rdv_fin, type, motif_code, motif_texte,
     statut, demandee_par, repondu_le, tardive, cle_envoi)
  values (p_org, p_intervention, v_retenu, v.debut_prevu, v.fin_prevue, 'annulation', p_motif_code, v_motif,
          'acceptee', (select auth.uid()), now(), v_tardive, p_cle)
  returning id into v_demande;

  -- Le créneau confirmé devient caduc ; la mission revient « acceptée — rendez-vous à fixer » (même retour que
  -- proposer_creneaux depuis planifiee). L'artisan repropose, le locataire choisit : l'accord de l'artisan reste exigé
  -- pour tout nouveau créneau.
  update public.intervention_creneaux set statut = 'caduc'
  where intervention_id = p_intervention and statut = 'retenu';
  update public.incident_interventions
  set statut = 'acceptee', debut_prevu = null, fin_prevue = null
  where id = p_intervention;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'rdv_annule_par_locataire', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'demande_id', v_demande,
                             'motif_code', p_motif_code, 'motif', v_motif,
                             'rdv_debut', v.debut_prevu, 'rdv_fin', v.fin_prevue, 'tardive', v_tardive));

  -- L'alerte au gérant ou au propriétaire (option B). Elle se ferme d'elle-même quand la mission avance
  -- (déclencheur ci-dessous) ou par l'arbitrage. Elle ne porte que des identifiants, le motif et la date.
  select i.numero into v_numero from public.incidents i where i.id = v.incident_id;
  insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
  values (p_org,
          case when v_tardive then 'rdv_annule_tardif' else 'rdv_annule_locataire' end,
          'normale',
          case when v_tardive then 'Rendez-vous annulé tardivement par le locataire — '
               else 'Rendez-vous annulé par le locataire — ' end || v_numero,
          jsonb_build_object('incident_id', v.incident_id,
                             'lot_id', (select i2.lot_id from public.incidents i2 where i2.id = v.incident_id),
                             'intervention_id', p_intervention, 'demande_id', v_demande,
                             'rdv_debut', v.debut_prevu, 'tardive', v_tardive, 'motif_code', p_motif_code,
                             'libelle', case when v_tardive
                               then 'Le locataire a annulé le rendez-vous moins de ' || p.delai_report_heures
                                    || ' heures avant : l''artisan est prévenu, un nouveau rendez-vous est à fixer.'
                               else 'Le locataire a annulé le rendez-vous : l''artisan est prévenu, un nouveau rendez-vous est à fixer.' end),
          'intervention', p_intervention);
  return v_demande;
exception when unique_violation then
  select d.id into v_demande from public.intervention_demandes_rdv d
  where d.intervention_id = p_intervention and d.cle_envoi = p_cle;
  if found then return v_demande; end if;
  raise;
end;
$fonction$;
revoke all on function public.annuler_rdv_locataire(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.annuler_rdv_locataire(uuid, uuid, text, text, uuid) to authenticated;

-- ── 7. Retirer sa demande de report (locataire) ────────────────────────────────────────────────────────────────────
create or replace function public.retirer_demande_rdv(p_org uuid, p_demande uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fonction$
declare d record; v record;
begin
  if public.ma_personne_locataire(p_org) is null then raise exception 'Accès refusé'; end if;
  select x.* into d from public.intervention_demandes_rdv x where x.id = p_demande and x.organization_id = p_org;
  if not found then raise exception 'Demande introuvable'; end if;
  if not public.intervention_du_locataire(p_org, d.intervention_id) then raise exception 'Accès refusé'; end if;
  select iv.* into v from public.incident_interventions iv where iv.id = d.intervention_id;
  -- Le locataire retire pendant que l'artisan accepte : un seul des deux passe, l'autre lit « déjà traitée ».
  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text, 0));
  perform 1 from public.incident_interventions where id = d.intervention_id for update;
  select x.* into d from public.intervention_demandes_rdv x where x.id = p_demande for update;
  if d.type <> 'report' then raise exception 'Seule une demande de report se retire'; end if;
  if d.statut <> 'en_attente' then
    raise exception 'Cette demande a déjà été traitée : rechargez la page pour lire la réponse';
  end if;
  update public.intervention_demandes_rdv
  set statut = 'retiree', repondu_le = now(), repondu_par = (select auth.uid())
  where id = p_demande;
  update public.intervention_creneaux set statut = 'caduc' where demande_id = p_demande and statut = 'propose';
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'rdv_report_retire', (select auth.uid()),
          jsonb_build_object('intervention_id', d.intervention_id, 'demande_id', p_demande, 'cause', 'locataire'));
end;
$fonction$;
revoke all on function public.retirer_demande_rdv(uuid, uuid) from public, anon;
grant execute on function public.retirer_demande_rdv(uuid, uuid) to authenticated;

-- ── 8. L'expiration des demandes sans réponse (tâche planifiée) ────────────────────────────────────────────────────
-- Appelée par la tâche `rappels` (service_role) : la demande expire, ses dates deviennent caduques, le rendez-vous
-- confirmé reste, le gérant reçoit une alerte. Une organisation dont l'écriture est fermée n'écrit plus en son nom.
create or replace function public.expirer_demandes_rdv()
returns integer
language plpgsql
security definer
set search_path = ''
as $fonction$
declare d record; v_n integer := 0; v_numero text; v_incident uuid; v_lot uuid;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'expirer_demandes_rdv: reserve a la tache planifiee';
  end if;
  for d in
    select x.* from public.intervention_demandes_rdv x
    where x.statut = 'en_attente' and x.expire_le is not null and x.expire_le <= now()
      and public.org_ecriture_ouverte(x.organization_id)
    order by x.expire_le
    for update skip locked
  loop
    update public.intervention_demandes_rdv
    set statut = 'expiree', repondu_le = now(), reponse_motif = 'Sans réponse de l''artisan dans le délai'
    where id = d.id;
    update public.intervention_creneaux set statut = 'caduc' where demande_id = d.id and statut = 'propose';
    select iv.incident_id into v_incident from public.incident_interventions iv where iv.id = d.intervention_id;
    select i.numero, i.lot_id into v_numero, v_lot from public.incidents i where i.id = v_incident;
    insert into public.incident_evenements
      (organization_id, incident_id, type, acteur_account_id, details)
    values (d.organization_id, v_incident, 'rdv_report_expire', null,
            jsonb_build_object('intervention_id', d.intervention_id, 'demande_id', d.id,
                               'rdv_debut', d.rdv_debut, 'expire_le', d.expire_le));
    if not exists (select 1 from public.alerts a
                   where a.organization_id = d.organization_id and a.statut = 'ouverte'
                     and a.type = 'rdv_demande_sans_reponse' and a.details->>'demande_id' = d.id::text) then
      insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
      values (d.organization_id, 'rdv_demande_sans_reponse', 'normale',
              'Demande de report sans réponse de l''artisan — ' || v_numero,
              jsonb_build_object('incident_id', v_incident, 'lot_id', v_lot,
                                 'intervention_id', d.intervention_id, 'demande_id', d.id,
                                 'rdv_debut', d.rdv_debut,
                                 'libelle', 'L''artisan n''a pas répondu à la demande de report du locataire dans le délai : le rendez-vous confirmé est maintenu. Rappelez le locataire, ou fixez un autre rendez-vous.'),
              'intervention', d.intervention_id);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fonction$;
revoke all on function public.expirer_demandes_rdv() from public, anon, authenticated;
grant execute on function public.expirer_demandes_rdv() to service_role;

-- ── 9. Ce que le locataire lit : ses rendez-vous et ce qu'il peut encore en faire ─────────────────────────────────
-- Une ligne par mission vivante (acceptée ou planifiée) de ses incidents, avec la dernière demande s'il y en a une.
-- Les deux booléens sont calculés ICI, avec les mêmes règles que les fonctions d'écriture : l'écran ne devine pas.
create or replace function public.mes_rendez_vous_locataire(p_org uuid)
returns table (
  intervention_id uuid, incident_id uuid, statut_mission public.intervention_statut,
  rdv_debut timestamptz, rdv_fin timestamptz,
  report_possible boolean, annulation_possible boolean, reports_restants integer,
  demande_id uuid, demande_type text, demande_statut text, demande_motif_code text,
  demandee_le timestamptz, expire_le timestamptz, repondu_le timestamptz, reponse_motif text,
  demande_rdv_debut timestamptz, demande_rdv_fin timestamptz,
  nouveau_debut timestamptz, nouvelle_fin timestamptz, tardive boolean)
language sql
stable
security definer
set search_path = ''
as $fonction$
  with moi as (select public.ma_personne_locataire(p_org) as id),
  mes_baux as (
    select b.id from public.baux b, moi
    where b.organization_id = p_org and b.etat in ('actif', 'preavis') and moi.id is not null
      and (b.locataire_principal = moi.id
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire' and bp.person_id = moi.id))
  ),
  missions as (
    select iv.id, iv.incident_id, iv.statut, iv.debut_prevu, iv.fin_prevue
    from public.incident_interventions iv
    join public.incidents i on i.id = iv.incident_id
    where iv.organization_id = p_org and iv.statut in ('acceptee', 'planifiee')
      and i.bail_id in (select id from mes_baux)
  ),
  derniere as (
    select distinct on (d.intervention_id) d.*
    from public.intervention_demandes_rdv d
    where d.intervention_id in (select id from missions)
    order by d.intervention_id, d.demandee_le desc
  ),
  comptes as (
    select d.intervention_id,
           count(*) filter (where d.type = 'report' and d.statut <> 'retiree')::integer as reports,
           bool_or(d.statut = 'en_attente') as une_en_attente
    from public.intervention_demandes_rdv d
    where d.intervention_id in (select id from missions)
    group by d.intervention_id
  ),
  p as (select * from public.parametres_rdv_locataire())
  select
    m.id, m.incident_id, m.statut, m.debut_prevu, m.fin_prevue,
    (m.statut = 'planifiee' and m.debut_prevu is not null
       and m.debut_prevu - now() >= make_interval(hours => p.delai_report_heures)
       and not coalesce(k.une_en_attente, false)
       and coalesce(k.reports, 0) < p.reports_max),
    (m.statut = 'planifiee' and m.debut_prevu is not null and m.debut_prevu > now()),
    greatest(0, p.reports_max - coalesce(k.reports, 0))::integer,
    d.id, d.type,
    -- Une demande dont le délai est passé se lit « expirée » même avant le passage de la tâche planifiée.
    case when d.statut = 'en_attente' and d.expire_le is not null and d.expire_le <= now() then 'expiree' else d.statut end,
    d.motif_code, d.demandee_le, d.expire_le, d.repondu_le, d.reponse_motif, d.rdv_debut, d.rdv_fin,
    (select c.debut from public.intervention_creneaux c where c.id = d.creneau_accepte_id),
    (select c.fin from public.intervention_creneaux c where c.id = d.creneau_accepte_id),
    coalesce(d.tardive, false)
  from missions m
  cross join p
  left join derniere d on d.intervention_id = m.id
  left join comptes k on k.intervention_id = m.id
$fonction$;
revoke all on function public.mes_rendez_vous_locataire(uuid) from public, anon;
grant execute on function public.mes_rendez_vous_locataire(uuid) to authenticated;

-- ── 10. Ce que l'artisan lit : les demandes du locataire sur SES missions ─────────────────────────────────────────
-- La dernière demande par mission vivante. Le motif du locataire lui est montré (fiche C.6) ; aucune coordonnée.
create or replace function public.mes_demandes_rdv_artisan()
returns table (
  demande_id uuid, intervention_id uuid, type text, statut text, motif_code text, motif_texte text,
  demandee_le timestamptz, expire_le timestamptz, rdv_debut timestamptz, rdv_fin timestamptz, tardive boolean)
language sql
stable
security definer
set search_path = ''
as $fonction$
  select distinct on (d.intervention_id)
         d.id, d.intervention_id, d.type,
         case when d.statut = 'en_attente' and d.expire_le is not null and d.expire_le <= now() then 'expiree' else d.statut end,
         d.motif_code, d.motif_texte, d.demandee_le, d.expire_le, d.rdv_debut, d.rdv_fin, d.tardive
  from public.intervention_demandes_rdv d
  join public.incident_interventions i on i.id = d.intervention_id
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and i.statut in ('acceptee', 'planifiee')
  order by d.intervention_id, d.demandee_le desc
$fonction$;
revoke all on function public.mes_demandes_rdv_artisan() from public, anon;
grant execute on function public.mes_demandes_rdv_artisan() to authenticated;

-- ── 11. La mission avance : la demande en attente tombe, les alertes se ferment ────────────────────────────────────
-- Mission annulée ou refusée (le gérant, l'artisan), démarrée (l'artisan est venu) ou terminée : une demande encore
-- en attente n'a plus d'objet — « arbitree » (tranchée en dehors de la demande), avec la raison. Un NOUVEAU rendez-vous
-- (planifiée), le démarrage, la fin ou l'annulation ferment les alertes nées des gestes du locataire.
create or replace function public.demandes_rdv_suivre_mission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fonction$
declare v_raison text;
begin
  if new.statut in ('annulee', 'refusee', 'terminee', 'en_cours') then
    v_raison := case new.statut
      when 'annulee' then 'Mission annulée'
      when 'refusee' then 'Mission refusée par l''artisan'
      when 'terminee' then 'Intervention terminée'
      else 'Intervention démarrée' end;
    update public.intervention_demandes_rdv
    set statut = 'arbitree', repondu_le = now(), repondu_par = (select auth.uid()), reponse_motif = v_raison
    where intervention_id = new.id and statut = 'en_attente';
    update public.intervention_creneaux set statut = 'caduc'
    where intervention_id = new.id and demande_id is not null and statut = 'propose';
  end if;
  if new.statut in ('planifiee', 'en_cours', 'terminee', 'annulee', 'refusee') then
    update public.alerts
    set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
        closed_action = case new.statut
          when 'planifiee' then 'Nouveau rendez-vous fixé'
          when 'en_cours' then 'Intervention démarrée'
          when 'terminee' then 'Intervention terminée'
          when 'refusee' then 'Mission refusée par l''artisan'
          else 'Mission annulée' end
    where organization_id = new.organization_id and statut = 'ouverte'
      and type in ('rdv_annule_locataire', 'rdv_annule_tardif', 'rdv_demande_sans_reponse')
      and details->>'intervention_id' = new.id::text;
  end if;
  return null;
end;
$fonction$;
-- Fonction de déclencheur : personne ne l'appelle, ni anonyme ni connecté.
revoke all on function public.demandes_rdv_suivre_mission() from public, anon, authenticated;
grant execute on function public.demandes_rdv_suivre_mission() to service_role;
drop trigger if exists demandes_rdv_suivre_mission on public.incident_interventions;
create trigger demandes_rdv_suivre_mission
  after update of statut on public.incident_interventions
  for each row
  when (old.statut is distinct from new.statut)
  execute function public.demandes_rdv_suivre_mission();

-- ── 12. accepter_creneau_locataire : rejeu (REP-04) et accord sur une date de report ──────────────────────────────
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.accepter_creneau_locataire(uuid)'::regprocedure) into v_def;
  if position('Décision D22 (LOC-21)' in v_def) > 0 then return; end if;

  -- (a) la variable de la demande.
  v_ancre := $ancre$declare v record;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (accepter_creneau_locataire, ancre a) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$declare v record; v_demande record; -- Décision D22 (LOC-21) : la demande de report répondue$nouveau$);

  -- (b) REP-04 : clic répété sur « Accepter » après une réponse perdue — le rendez-vous est déjà confirmé sur
  -- cette date : succès silencieux (l'état en base est bon, l'écran ne doit pas annoncer un échec).
  v_ancre := $ancre$raise exception 'Cette date n''est plus proposée';$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (accepter_creneau_locataire, ancre b) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$if v.statut = 'retenu' and v.statut_intervention = 'planifiee' then return; end if; -- Décision D22 (REP-04) : rejeu
    raise exception 'Cette date n''est plus proposée';$nouveau$);

  -- (c) une date de report : la demande doit être encore en attente et dans son délai ; l'ancien rendez-vous
  -- devient caduc (un seul créneau retenu par mission) — le rendez-vous ne change qu'ICI, à l'accord.
  v_ancre := $ancre$update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (accepter_creneau_locataire, ancre c) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$if v.demande_id is not null then -- Décision D22 (LOC-21) : réponse à une demande de report
    select d.* into v_demande from public.intervention_demandes_rdv d where d.id = v.demande_id for update;
    if v_demande.statut <> 'en_attente' then
      raise exception 'Cette demande de report n''est plus en attente : le locataire l''a retirée ou elle a été tranchée';
    end if;
    if v_demande.expire_le is not null and v_demande.expire_le <= now() then
      raise exception 'Le délai de réponse à cette demande de report est dépassé : le rendez-vous initial est maintenu et le gérant est prévenu';
    end if;
  end if;
  if v.statut_intervention = 'planifiee' then
    update public.intervention_creneaux set statut = 'caduc'
    where intervention_id = v.intervention_id and statut = 'retenu' and id <> p_creneau;
  end if;
  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;$nouveau$);

  -- (d) la demande est acceptée ; ses autres dates sont déjà caduques (CHN-01, bloc précédent de la fonction).
  v_ancre := $ancre$'creneau_id', p_creneau, 'debut', v.debut, 'par', 'artisan'));$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (accepter_creneau_locataire, ancre d) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$'creneau_id', p_creneau, 'debut', v.debut, 'par', 'artisan'));
  if v.demande_id is not null then -- Décision D22 (LOC-21) : le report est accepté, le rendez-vous a changé
    update public.intervention_demandes_rdv
    set statut = 'acceptee', repondu_le = now(), repondu_par = (select auth.uid()), creneau_accepte_id = p_creneau
    where id = v.demande_id;
    insert into public.incident_evenements
      (organization_id, incident_id, type, acteur_account_id, details)
    values (v.organization_id, v.incident_id, 'rdv_report_accepte', (select auth.uid()),
            jsonb_build_object('intervention_id', v.intervention_id, 'demande_id', v.demande_id,
                               'ancien_debut', v_demande.rdv_debut, 'nouveau_debut', v.debut, 'nouvelle_fin', v.fin));
  end if;$nouveau$);
  execute v_def;
end $correctif$;

-- ── 13. choisir_creneau : rejeu (REP-04) ──────────────────────────────────────────────────────────────────────────
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.choisir_creneau(uuid,uuid)'::regprocedure) into v_def;
  if position('Décision D22 (LOC-21)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$raise exception 'Ce créneau n''est plus proposé';$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (choisir_creneau) : définition inattendue (ancre absente ou répétée)';
  end if;
  -- Clic répété sur « Confirmer » après une réponse perdue : le rendez-vous est déjà confirmé sur ce créneau.
  v_def := replace(v_def, v_ancre, $nouveau$if v.statut = 'retenu' and v.statut_intervention = 'planifiee' then return; end if; -- Décision D22 (LOC-21) : rejeu (REP-04)
    raise exception 'Ce créneau n''est plus proposé';$nouveau$);
  execute v_def;
end $correctif$;

-- ── 14. refuser_creneaux_locataire : le refus porte aussi sur la demande de report ─────────────────────────────────
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.refuser_creneaux_locataire(uuid,text)'::regprocedure) into v_def;
  if position('Décision D22 (LOC-21)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$v_numero text;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (refuser_creneaux_locataire, ancre a) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$v_numero text; v_demande_report uuid; -- Décision D22 (LOC-21)$nouveau$);
  v_ancre := $ancre$get diagnostics v_nb = row_count;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (refuser_creneaux_locataire, ancre b) : définition inattendue (ancre absente ou répétée)';
  end if;
  -- Si ces dates répondaient à une demande de report, la demande est refusée ; le rendez-vous confirmé reste tel quel
  -- (il n'a jamais été défait) et l'alerte d'arbitrage, plus bas dans la fonction, prévient le gérant.
  v_def := replace(v_def, v_ancre, $nouveau$get diagnostics v_nb = row_count;
  update public.intervention_demandes_rdv
  set statut = 'refusee', repondu_le = now(), repondu_par = (select auth.uid()), reponse_motif = trim(p_motif)
  where intervention_id = p_intervention and statut = 'en_attente' and type = 'report'
  returning id into v_demande_report;
  if v_demande_report is not null then
    insert into public.incident_evenements
      (organization_id, incident_id, type, acteur_account_id, details)
    values (v.organization_id, v.incident_id, 'rdv_report_refuse', (select auth.uid()),
            jsonb_build_object('intervention_id', p_intervention, 'demande_id', v_demande_report,
                               'motif', trim(p_motif)));
  end if;$nouveau$);
  execute v_def;
end $correctif$;

-- ── 15. L'arbitrage du gérant tranche la demande et ferme les alertes ─────────────────────────────────────────────
do $correctif$
declare v_def text; v_ancre text; v_sig text;
begin
  foreach v_sig in array array[
    'public.fixer_creneau_arbitrage(uuid,uuid,timestamptz,timestamptz,text)',
    'public.fixer_creneau_arbitrage_motive(uuid,uuid,timestamptz,timestamptz,text,text)'
  ] loop
    select pg_get_functiondef(v_sig::regprocedure) into v_def;
    if position('Décision D22 (LOC-21)' in v_def) > 0 then continue; end if;
    v_ancre := $ancre$set statut = 'caduc' where intervention_id = p_intervention and statut in ('propose','retenu');$ancre$;
    if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
      raise exception 'Correctif D22 (%) : définition inattendue (ancre absente ou répétée)', v_sig;
    end if;
    v_def := replace(v_def, v_ancre, $nouveau$set statut = 'caduc' where intervention_id = p_intervention and statut in ('propose','retenu');
  -- Décision D22 (LOC-21) : l'arbitrage tranche la demande de report en attente et ferme les alertes de rendez-vous
  -- nées des gestes du locataire.
  update public.intervention_demandes_rdv
  set statut = 'arbitree', repondu_le = now(), repondu_par = (select auth.uid()),
      reponse_motif = 'Rendez-vous fixé par le gestionnaire'
  where intervention_id = p_intervention and statut = 'en_attente';
  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()), closed_action = 'Rendez-vous fixé par arbitrage'
  where organization_id = p_org and statut = 'ouverte'
    and type in ('rdv_annule_locataire', 'rdv_annule_tardif', 'rdv_demande_sans_reponse')
    and details->>'intervention_id' = p_intervention::text;$nouveau$);
    execute v_def;
  end loop;
end $correctif$;

-- ── 16. Les rappels portent la date du rendez-vous rappelé ────────────────────────────────────────────────────────
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.rendez_vous_a_rappeler(integer)'::regprocedure) into v_def;
  if position('Décision D22 (LOC-21)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$and r.destinataire = c.qui::public.rappel_destinataire$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (rendez_vous_a_rappeler) : définition inattendue (ancre absente ou répétée)';
  end if;
  -- Une trace sans date (antérieure) vaut pour tout rendez-vous de la mission, comme avant ; une trace datée ne vaut
  -- que pour sa date : le rendez-vous reporté reçoit son propre rappel.
  v_def := replace(v_def, v_ancre, $nouveau$and r.destinataire = c.qui::public.rappel_destinataire
        and (r.debut_prevu is null or r.debut_prevu = c.debut_prevu) -- Décision D22 (LOC-21)$nouveau$);
  execute v_def;
end $correctif$;

do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.marquer_rappel_envoye(uuid,text,text,text)'::regprocedure) into v_def;
  if position('Décision D22 (LOC-21)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$declare v_org uuid;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (marquer_rappel_envoye, ancre a) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$declare v_org uuid; v_debut timestamptz; -- Décision D22 (LOC-21) : la date du rendez-vous rappelé$nouveau$);
  v_ancre := $ancre$select organization_id into v_org$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (marquer_rappel_envoye, ancre b) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$select organization_id, debut_prevu into v_org, v_debut$nouveau$);
  v_ancre := $ancre$(organization_id, intervention_id, echeance, destinataire, adresse)$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (marquer_rappel_envoye, ancre c) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$(organization_id, intervention_id, echeance, destinataire, adresse, debut_prevu)$nouveau$);
  v_ancre := $ancre$p_destinataire::public.rappel_destinataire, p_adresse)$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (marquer_rappel_envoye, ancre d) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$p_destinataire::public.rappel_destinataire, p_adresse, v_debut)$nouveau$);
  v_ancre := $ancre$on conflict (intervention_id, echeance, destinataire) do nothing;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D22 (marquer_rappel_envoye, ancre e) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$on conflict (intervention_id, echeance, destinataire, debut_prevu) do nothing;$nouveau$);
  execute v_def;
end $correctif$;

-- Les fonctions modifiées gardent leurs droits (create or replace) ; les nouvelles ont les leurs ci-dessus. La
-- fermeture au rôle anonyme est rejouée, comme dans toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
