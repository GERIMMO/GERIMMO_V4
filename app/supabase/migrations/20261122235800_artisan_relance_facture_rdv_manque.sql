-- ARTISAN : RELANCE D'UNE FACTURE RESTÉE SANS RÈGLEMENT, ET RENDEZ-VOUS MANQUÉ CONSIGNÉ (audit palier 1 du
-- 22/11/2026, P2-04, deux des trois parties ; les lignes de devis réutilisables ont leur propre migration).
--
-- LES DEUX ÉCARTS.
--   · Une facture déposée et jamais réglée : l'artisan n'avait aucun geste pour le rappeler à son client, sinon
--     écrire en dehors de Gerimmo.
--   · Un rendez-vous confirmé où l'une des deux personnes ne vient pas : rien ne le consignait. La mission restait
--     « planifiée » à une date passée, et l'écran de l'artisan disait de ses indicateurs : « les rendez-vous manqués
--     ne sont pas encore mesurés ». Le référentiel (module 10, RM-10.5.3) demande que l'absence soit attribuée et
--     tracée, et qu'un report ouvre un nouveau cycle.
--
-- CE QUE FAIT CETTE MIGRATION.
--   1. RELANCE. `intervention_factures` reçoit la date de la dernière relance et leur nombre. L'artisan relance par
--      `relancer_ma_facture` : pas avant 30 jours après le dépôt, pas plus d'une fois tous les 15 jours, jamais sur
--      une facture refusée ou déclarée réglée en totalité. La relance s'écrit à la chronologie de l'incident
--      (« facture_relancee ») et ouvre UNE alerte chez le gestionnaire (« facture_artisan_relancee »), qui se ferme
--      d'elle-même quand la facture est réglée en totalité ou refusée. AUCUN E-MAIL ne part.
--      Les deux délais (30 et 15 jours) sont des choix de produit, pas une règle de droit : Gerimmo ne connaît pas
--      l'échéance écrite sur la facture (elle n'est pas enregistrée). Ils sont notés dans QUESTIONS.md.
--   2. RENDEZ-VOUS MANQUÉ. `intervention_rdv_manques` consigne, pour un rendez-vous confirmé dont l'heure est passée,
--      QUI était absent et QUI le dit : l'artisan ne peut dire que « le locataire était absent » ; le gestionnaire
--      peut dire l'un ou l'autre. Le rendez-vous tombe avec sa date (la mission redevient « acceptée », exactement
--      comme quand l'artisan repropose des créneaux) : un nouveau rendez-vous est à convenir. L'événement
--      « rdv_manque » s'écrit à la chronologie ; quand c'est l'artisan qui le dit, une alerte « rdv_manque » s'ouvre
--      chez le gestionnaire et se ferme d'elle-même au rendez-vous suivant.
--      Chacun lit ce qui le concerne : l'artisan (`rdv_manques_de_ma_mission`, et le compte de ses propres absences
--      sur douze mois, `mes_rdv_manques_artisan`), le locataire (`mes_rdv_manques_locataire` : la date et qui est
--      dit absent, jamais la précision libre). La précision libre n'est lue que par le gestionnaire, à la chronologie.
--      CE COMPTE N'ENTRE PAS DANS LA NOTE de l'artisan : le calcul de la note n'est pas modifié.
--
-- La table est fermée (cloisonnement activé, aucun droit direct). Aucune donnée existante n'est modifiée.
--
-- Retour arrière : supabase/retours-arriere/20261122235800_artisan_relance_facture_rdv_manque.retour.sql.

-- ── 0. Deux types d'événement de plus à la chronologie ───────────────────────
do $contrainte$
declare
  v_def text;
  v_nouvelle text;
  v_type text;
begin
  foreach v_type in array array['facture_relancee', 'rdv_manque'] loop
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
     where c.conrelid = 'public.incident_evenements'::regclass and c.conname = 'incident_evenements_type_check';
    if v_def is null then
      raise exception 'P2-04 : contrainte incident_evenements_type_check introuvable';
    end if;
    if position('''' || v_type || '''' in v_def) = 0 then
      v_nouvelle := regexp_replace(v_def, '\]\)\)\)$', ', ''' || v_type || '''::text])))');
      if v_nouvelle = v_def or position('''' || v_type || '''::text])))' in v_nouvelle) = 0 then
        raise exception 'P2-04 : forme inattendue de la contrainte incident_evenements_type_check';
      end if;
      alter table public.incident_evenements drop constraint incident_evenements_type_check;
      execute 'alter table public.incident_evenements add constraint incident_evenements_type_check ' || v_nouvelle;
    end if;
  end loop;
end $contrainte$;

-- ── 1. La relance d'une facture ──────────────────────────────────────────────
alter table public.intervention_factures
  add column if not exists relancee_le timestamptz,
  add column if not exists relances integer not null default 0;
do $relances$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.intervention_factures'::regclass
                    and conname = 'intervention_factures_relances_coherentes') then
    alter table public.intervention_factures add constraint intervention_factures_relances_coherentes
      check (relances between 0 and 60 and (relances = 0) = (relancee_le is null));
  end if;
end $relances$;
comment on column public.intervention_factures.relancee_le is
  'P2-04 (22/11/2026) : dernière relance de l''artisan auprès de son client pour cette facture. Vide = jamais relancée.';
comment on column public.intervention_factures.relances is
  'P2-04 (22/11/2026) : nombre de relances de l''artisan pour cette facture.';

-- L'état de règlement d'une facture, calculé ICI (validée ou non, total des règlements non retirés). Volontairement
-- sans appeler `etat_facture_intervention` : le retour arrière du lot « règlement » (20261014610000) refuse de se jouer
-- tant qu'une fonction plus récente appelle les siennes ; ce lot ne doit pas le bloquer. Interne : aucun droit.
create or replace function public.relance_etat_facture(p_facture uuid)
returns table (etat text, reste_cents bigint)
language sql stable security definer set search_path = '' as $$
  select case when f.validee_le is null then 'deposee'
              when coalesce(r.total, 0) = 0 then 'validee'
              when coalesce(r.total, 0) < f.montant_ttc_cents then 'partiellement_reglee'
              else 'reglee' end,
         (f.montant_ttc_cents - coalesce(r.total, 0))::bigint
  from public.intervention_factures f
  left join (select g.facture_id, sum(g.montant_cents) as total
               from public.intervention_facture_reglements g
              where g.retire_le is null
              group by g.facture_id) r on r.facture_id = f.id
  where f.id = p_facture
$$;

-- Ce que l'artisan lit pour savoir s'il peut relancer : ses factures en vigueur qui ne sont pas réglées en totalité.
create or replace function public.mes_relances_factures()
returns table (facture_id uuid, intervention_id uuid, deposee_le timestamptz, relancee_le timestamptz,
               relances integer, relance_possible_le date, relancable boolean)
language sql stable security definer set search_path = '' as $$
  select f.id, f.intervention_id, f.deposee_le, f.relancee_le, f.relances, p.possible_le,
         public.aujourdhui_paris() >= p.possible_le
  from public.intervention_factures f
  cross join lateral public.relance_etat_facture(f.id) e
  cross join lateral (
    select greatest((f.deposee_le at time zone 'Europe/Paris')::date + 30,
                    coalesce((f.relancee_le at time zone 'Europe/Paris')::date + 15, '-infinity'::date)) as possible_le
  ) p
  where public.mon_artisan_id() is not null
    and f.artisan_id = public.mon_artisan_id()
    and f.refusee_le is null
    and e.etat <> 'reglee'
  order by f.deposee_le, f.id;
$$;

create or replace function public.relancer_ma_facture(p_facture uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid;
  f record;
  e record;
  v_jour date := public.aujourdhui_paris();
  v_depot date;
  v_derniere date;
  v_incident uuid;
  v_numero text;
  v_lot uuid;
  v_nom text;
  v_rang integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  v_artisan := public.exiger_artisan_reel();
  select * into f from public.intervention_factures where id = p_facture and artisan_id = v_artisan for update;
  if not found then
    raise exception 'Facture introuvable';
  end if;
  if f.refusee_le is not null then
    raise exception 'Cette facture a été refusée par votre client : déposez la facture corrigée, il n''y a rien à relancer';
  end if;
  select * into e from public.relance_etat_facture(f.id);
  if e.etat = 'reglee' then
    raise exception 'Votre client a déclaré cette facture réglée en totalité : il n''y a rien à relancer';
  end if;
  v_depot := (f.deposee_le at time zone 'Europe/Paris')::date;
  if v_jour < v_depot + 30 then
    raise exception 'Une facture se relance à partir de 30 jours après son dépôt : vous pourrez relancer celle-ci le %',
      to_char(v_depot + 30, 'DD/MM/YYYY');
  end if;
  if f.relancee_le is not null then
    v_derniere := (f.relancee_le at time zone 'Europe/Paris')::date;
    if v_jour < v_derniere + 15 then
      raise exception 'Vous avez relancé cette facture le % : la relance suivante sera possible le %',
        to_char(v_derniere, 'DD/MM/YYYY'), to_char(v_derniere + 15, 'DD/MM/YYYY');
    end if;
  end if;
  if f.relances >= 60 then
    raise exception 'Cette facture a déjà été relancée 60 fois : contactez votre client directement';
  end if;

  v_rang := f.relances + 1;
  update public.intervention_factures set relancee_le = now(), relances = v_rang where id = f.id;

  select i.id, i.numero, i.lot_id into v_incident, v_numero, v_lot
    from public.incident_interventions iv
    join public.incidents i on i.id = iv.incident_id
   where iv.id = f.intervention_id;
  select a.raison_sociale into v_nom from public.artisans a where a.id = v_artisan;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (f.organization_id, v_incident, 'facture_relancee', (select auth.uid()),
          jsonb_build_object('facture_id', f.id, 'numero', f.numero, 'intervention_id', f.intervention_id,
                             'relance', v_rang, 'jours_depuis_depot', v_jour - v_depot,
                             'etat', e.etat, 'reste_cents', e.reste_cents));

  -- Une seule alerte ouverte par facture : la nouvelle relance remplace la précédente.
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_action = 'Remplacée par une nouvelle relance de l''artisan'
   where organization_id = f.organization_id and type = 'facture_artisan_relancee' and statut = 'ouverte'
     and details->>'facture_id' = f.id::text;
  insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
  values (f.organization_id, 'facture_artisan_relancee', 'normale',
          'Facture relancée par l''artisan — ' || coalesce(v_numero, 'incident'),
          jsonb_strip_nulls(jsonb_build_object(
            'incident_id', v_incident, 'lot_id', v_lot, 'intervention_id', f.intervention_id,
            'facture_id', f.id, 'numero', f.numero, 'relance', v_rang,
            'libelle', coalesce(v_nom, 'L''artisan') || ' vous relance pour sa facture n° ' || f.numero
              || ' déposée le ' || to_char(v_depot, 'DD/MM/YYYY')
              || case when e.etat = 'deposee' then ', pas encore contrôlée.'
                      else ' (reste à régler : ' || replace(to_char(e.reste_cents / 100.0, 'FM9999999990.00'), '.', ',') || ' €).' end)),
          'intervention', f.intervention_id);
  return v_rang;
end;
$$;

-- L'alerte de relance se ferme d'elle-même : facture réglée en totalité, ou refusée.
create or replace function public.fermer_alerte_relance_facture()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_facture uuid;
  v_org uuid;
  v_motif text;
begin
  if tg_table_name = 'intervention_facture_reglements' then
    v_facture := new.facture_id;
    v_org := new.organization_id;
    if (select e.etat from public.relance_etat_facture(v_facture) e) is distinct from 'reglee' then
      return null;
    end if;
    v_motif := 'Facture réglée en totalité';
  else
    v_facture := new.id;
    v_org := new.organization_id;
    v_motif := 'Facture refusée, à corriger par l''artisan';
  end if;
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_action = v_motif
   where organization_id = v_org and type = 'facture_artisan_relancee' and statut = 'ouverte'
     and details->>'facture_id' = v_facture::text;
  return null;
end;
$$;
drop trigger if exists fermer_alerte_relance_reglement on public.intervention_facture_reglements;
create trigger fermer_alerte_relance_reglement after insert on public.intervention_facture_reglements
  for each row execute function public.fermer_alerte_relance_facture();
drop trigger if exists fermer_alerte_relance_refus on public.intervention_factures;
create trigger fermer_alerte_relance_refus after update of refusee_le on public.intervention_factures
  for each row when (new.refusee_le is not null and old.refusee_le is null)
  execute function public.fermer_alerte_relance_facture();

-- ── 2. Le rendez-vous manqué ─────────────────────────────────────────────────
create table if not exists public.intervention_rdv_manques (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  intervention_id uuid not null,
  rdv_debut timestamptz not null,
  rdv_fin timestamptz,
  absent text not null,
  consigne_role text not null,
  consigne_par uuid references public.accounts(id),
  note text,
  created_at timestamptz not null default now(),
  constraint intervention_rdv_manques_intervention_fk foreign key (intervention_id, organization_id)
    references public.incident_interventions(id, organization_id),
  constraint intervention_rdv_manques_absent check (absent in ('locataire', 'artisan')),
  constraint intervention_rdv_manques_role check (consigne_role in ('artisan', 'gestionnaire')),
  -- L'artisan ne se déclare pas absent lui-même : il ne consigne que l'absence du locataire.
  constraint intervention_rdv_manques_artisan_dit_locataire check (consigne_role <> 'artisan' or absent = 'locataire'),
  constraint intervention_rdv_manques_note check (note is null or (char_length(note) between 1 and 500 and note = btrim(note, E' \t\n\r'))),
  constraint intervention_rdv_manques_un_par_rdv unique (intervention_id, rdv_debut)
);
create index if not exists intervention_rdv_manques_intervention_idx on public.intervention_rdv_manques (intervention_id, organization_id);
create index if not exists intervention_rdv_manques_org_idx on public.intervention_rdv_manques (organization_id);
create index if not exists intervention_rdv_manques_par_idx on public.intervention_rdv_manques (consigne_par);
alter table public.intervention_rdv_manques enable row level security;
revoke all on public.intervention_rdv_manques from anon, authenticated;
grant all on public.intervention_rdv_manques to service_role;
drop trigger if exists diagnostic_artisan_lecture on public.intervention_rdv_manques;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.intervention_rdv_manques
  for each row execute function public.refuser_mutation_diagnostic_artisan();
drop trigger if exists traversee_lecture_seule on public.intervention_rdv_manques;
create trigger traversee_lecture_seule before insert or update or delete on public.intervention_rdv_manques
  for each row execute function support_interne.garder_ecriture_traversee();
-- La garde d'abonnement (un espace fermé n'écrit plus), posée sur CETTE table seulement : ne jamais appeler ici
-- `poser_gardes_abonnement()`, qui repasserait sur des tables qui n'en portent volontairement pas.
drop trigger if exists abonnement_intervention_rdv_manques on public.intervention_rdv_manques;
create trigger abonnement_intervention_rdv_manques before insert or update or delete on public.intervention_rdv_manques
  for each row execute function public.refuser_ecriture_si_fermee();
comment on table public.intervention_rdv_manques is
  'P2-04 (22/11/2026, référentiel RM-10.5.3) : un rendez-vous confirmé manqué, avec qui était absent et qui le dit. Lue par fonctions seulement.';

-- Le cœur commun : appelé par les deux fonctions ci-dessous, jamais directement (aucun droit d'exécution).
create or replace function public.rdv_manque_consigner_interne(p_intervention uuid, p_absent text, p_role text, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_note text := nullif(btrim(coalesce(p_note, ''), E' \t\n\r'), '');
  v_id uuid;
begin
  select * into v from public.incident_interventions where id = p_intervention for update;
  if not found then
    raise exception 'Intervention introuvable';
  end if;
  if v.statut <> 'planifiee' or v.debut_prevu is null then
    raise exception 'Aucun rendez-vous confirmé n''est en cours pour cette mission';
  end if;
  if v.debut_prevu > now() then
    raise exception 'Le rendez-vous du % n''a pas encore commencé : un rendez-vous manqué se consigne après son heure',
      to_char(v.debut_prevu at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI');
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Raccourcissez votre précision (500 caractères au plus)';
  end if;

  insert into public.intervention_rdv_manques
    (organization_id, intervention_id, rdv_debut, rdv_fin, absent, consigne_role, consigne_par, note)
  values (v.organization_id, p_intervention, v.debut_prevu, v.fin_prevue, p_absent, p_role, (select auth.uid()), v_note)
  returning id into v_id;

  -- Nouveau cycle (RM-10.5.3) : le rendez-vous tombe AVEC sa date, comme quand l'artisan repropose des créneaux
  -- (`proposer_creneaux`) : sans cela, le prochain choix heurterait « un seul créneau retenu ».
  update public.intervention_creneaux set statut = 'caduc'
   where intervention_id = p_intervention and statut = 'retenu';
  update public.incident_interventions
     set statut = 'acceptee', debut_prevu = null, fin_prevue = null
   where id = p_intervention;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'rdv_manque', (select auth.uid()),
          jsonb_strip_nulls(jsonb_build_object('intervention_id', p_intervention, 'rdv_debut', v.debut_prevu,
                                               'rdv_fin', v.fin_prevue, 'absent', p_absent, 'par', p_role,
                                               'note', v_note)));
  return v_id;
end;
$$;

-- L'artisan : « le locataire était absent ». Une alerte prévient le gestionnaire.
create or replace function public.consigner_rdv_manque_artisan(p_intervention uuid, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid;
  v record;
  v_id uuid;
  v_numero text;
  v_lot uuid;
  v_rdv timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  v_artisan := public.exiger_artisan_reel();
  select i.* into v from public.incident_interventions i
   where i.id = p_intervention and i.artisan_id = v_artisan;
  if not found then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  v_id := public.rdv_manque_consigner_interne(p_intervention, 'locataire', 'artisan', p_note);
  -- La date manquée est celle que le cœur a consignée sous verrou, pas celle lue avant lui.
  select m.rdv_debut into v_rdv from public.intervention_rdv_manques m where m.id = v_id;

  select i.numero, i.lot_id into v_numero, v_lot from public.incidents i where i.id = v.incident_id;
  insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
  values (v.organization_id, 'rdv_manque', 'normale',
          'Rendez-vous manqué — ' || coalesce(v_numero, 'incident'),
          jsonb_strip_nulls(jsonb_build_object(
            'incident_id', v.incident_id, 'lot_id', v_lot, 'intervention_id', p_intervention,
            'rdv_debut', v_rdv, 'absent', 'locataire',
            'libelle', 'L''artisan indique que le locataire était absent au rendez-vous du '
              || to_char(v_rdv at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')
              || '. Un nouveau rendez-vous est à convenir : l''artisan peut proposer d''autres dates, ou vous pouvez le fixer.')),
          'intervention', p_intervention);
  return v_id;
end;
$$;

-- Le gestionnaire : l'un ou l'autre était absent.
create or replace function public.consigner_rdv_manque(p_org uuid, p_intervention uuid, p_absent text, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if public.intervention_hors_portefeuille(p_org, p_intervention) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not exists (select 1 from public.incident_interventions i where i.id = p_intervention and i.organization_id = p_org) then
    raise exception 'Intervention introuvable';
  end if;
  if p_absent is null or p_absent not in ('locataire', 'artisan') then
    raise exception 'Indiquez qui était absent : le locataire ou l''artisan';
  end if;
  return public.rdv_manque_consigner_interne(p_intervention, p_absent, 'gestionnaire', p_note);
end;
$$;

-- L'alerte « rendez-vous manqué » se ferme d'elle-même dès que la mission avance : nouveau rendez-vous, démarrage,
-- fin, refus ou annulation.
create or replace function public.fermer_alerte_rdv_manque()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.alerts
     set statut = 'fermee', closed_at = now(),
         closed_action = case new.statut
           when 'planifiee' then 'Nouveau rendez-vous fixé'
           when 'en_cours' then 'Intervention démarrée'
           when 'terminee' then 'Intervention terminée'
           when 'refusee' then 'Mission refusée par l''artisan'
           else 'Mission annulée' end
   where organization_id = new.organization_id and type = 'rdv_manque' and statut = 'ouverte'
     and details->>'intervention_id' = new.id::text;
  return null;
end;
$$;
drop trigger if exists fermer_alerte_rdv_manque on public.incident_interventions;
create trigger fermer_alerte_rdv_manque after update of statut on public.incident_interventions
  for each row when (old.statut is distinct from new.statut
                     and new.statut in ('planifiee', 'en_cours', 'terminee', 'annulee', 'refusee'))
  execute function public.fermer_alerte_rdv_manque();

-- Ce que l'artisan lit de sa mission : les rendez-vous manqués, qui est dit absent, qui le dit. Sa propre précision
-- lui est rendue ; celle du gestionnaire ne l'est pas.
create or replace function public.rdv_manques_de_ma_mission(p_intervention uuid)
returns table (rdv_debut timestamptz, absent text, consigne_role text, consigne_le timestamptz, note text)
language sql stable security definer set search_path = '' as $$
  select m.rdv_debut, m.absent, m.consigne_role, m.created_at,
         case when m.consigne_role = 'artisan' then m.note end
  from public.intervention_rdv_manques m
  join public.incident_interventions i on i.id = m.intervention_id
  where public.mon_artisan_id() is not null
    and i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
  order by m.rdv_debut desc;
$$;

-- Son indicateur : ses propres absences, dites par ses clients, sur douze mois. N'entre pas dans la note.
create or replace function public.mes_rdv_manques_artisan()
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.intervention_rdv_manques m
  join public.incident_interventions i on i.id = m.intervention_id
  where public.mon_artisan_id() is not null
    and i.artisan_id = public.mon_artisan_id()
    and m.absent = 'artisan'
    and m.rdv_debut >= now() - interval '12 months';
$$;

-- Ce que le locataire lit : pour la mission en cours de ses demandes, la date manquée et qui est dit absent. Jamais
-- la précision libre. Le périmètre est celui de `mon_suivi_intervention` (ses demandes, la dernière mission).
create or replace function public.mes_rdv_manques_locataire(p_org uuid)
returns table (incident_id uuid, intervention_id uuid, rdv_debut timestamptz, absent text, consigne_role text, consigne_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.incident_id, m.intervention_id, m.rdv_debut, m.absent, m.consigne_role, m.created_at
  from public.mon_suivi_intervention(p_org) s
  join public.intervention_rdv_manques m
    on m.intervention_id = s.intervention_id and m.organization_id = p_org
  order by m.rdv_debut desc;
$$;

-- ── 3. Droits ────────────────────────────────────────────────────────────────
revoke all on function public.rdv_manque_consigner_interne(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.relance_etat_facture(uuid) from public, anon, authenticated;
revoke all on function public.fermer_alerte_relance_facture() from public, anon, authenticated;
revoke all on function public.fermer_alerte_rdv_manque() from public, anon, authenticated;
do $droits$
declare
  f text;
begin
  foreach f in array array[
    'public.mes_relances_factures()',
    'public.relancer_ma_facture(uuid)',
    'public.consigner_rdv_manque_artisan(uuid, text)',
    'public.consigner_rdv_manque(uuid, uuid, text, text)',
    'public.rdv_manques_de_ma_mission(uuid)',
    'public.mes_rdv_manques_artisan()',
    'public.mes_rdv_manques_locataire(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $droits$;

comment on function public.relancer_ma_facture(uuid) is
  'P2-04 (22/11/2026) : l''artisan relance son client pour une facture déposée depuis 30 jours au moins et pas réglée en totalité (15 jours entre deux relances). Événement à la chronologie et alerte au gestionnaire ; aucun e-mail.';
comment on function public.consigner_rdv_manque_artisan(uuid, text) is
  'P2-04 (22/11/2026, RM-10.5.3) : l''artisan consigne que le locataire était absent à un rendez-vous confirmé dont l''heure est passée. Le rendez-vous tombe, un nouveau est à convenir.';
comment on function public.consigner_rdv_manque(uuid, uuid, text, text) is
  'P2-04 (22/11/2026, RM-10.5.3) : le gestionnaire consigne qui était absent (locataire ou artisan) à un rendez-vous confirmé dont l''heure est passée.';

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
