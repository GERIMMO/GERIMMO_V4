-- Audit palier 1, P1-03 — Facture d'artisan erronée : le gestionnaire la refuse, l'artisan en dépose une autre.
--
-- CE QUI MANQUAIT. Une intervention ne porte qu'une facture (contrainte d'unicité), et le gestionnaire ne pouvait que
-- la valider. Devant une facture fausse — mauvais montant, mauvais client, mauvaise pièce — il n'y avait aucune
-- issue : ni refus, ni remplacement. Le référentiel le prévoit pourtant (module 9, variante V5 : « Contestation de
-- la facture — L'agent la refuse. L'artisan la corrige ou la justifie. »).
--
-- CE QUE POSE CETTE MIGRATION.
--   1. Le refus est un état de la facture : date, auteur, motif. Une facture refusée n'est JAMAIS effacée ni modifiée :
--      sa pièce, son numéro et son montant restent au dossier. Refus et validation s'excluent.
--   2. « Une facture par intervention » devient « une facture EN VIGUEUR par intervention » : l'unicité ne compte plus
--      les factures refusées (même forme que les factures externes des artisans, 20261014710000).
--   3. `refuser_facture_artisan(p_org, p_facture, p_motif)` : mêmes gardes que la validation (rôle de gestion,
--      portefeuille de l'agent) ; motif de 5 à 2 000 caractères ; une facture validée ne se refuse plus (la validation
--      est une décision financière, des règlements peuvent la suivre). Trace au fil du dossier et au journal d'audit ;
--      l'alerte « facture à contrôler » se ferme.
--   4. Cinq fonctions existantes apprennent l'état refusé, par retouche de leur définition en vigueur (ancre exacte,
--      forme inattendue = arrêt sans rien changer) : la validation (refusée pour une facture refusée), le dépôt de
--      l'artisan et son dossier de stockage (rouverts quand il ne reste aucune facture en vigueur), son agenda, et le
--      garde qui tient l'alerte ouverte. `etat_facture_intervention` n'est PAS retouchée : elle appartient en entier
--      à 20261014610000 (dont le rejeu la réécrirait) ; les écrans lisent le refus sur la facture elle-même.
--
-- CE QUI NE CHANGE PAS. Tant qu'une facture est en vigueur, un second dépôt reste refusé. Un numéro déjà réservé par
-- une facture émise depuis Gerimmo reste réservé après son refus : la facture corrigée porte un autre numéro.
-- Aucun règlement n'est possible sur une facture refusée (il exige une validation). Aucun e-mail ne part.
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261122170000_facture_artisan_refus.retour.sql

-- ── 1. L'état « refusée » ────────────────────────────────────────────────────────────────────────────────────────
alter table public.intervention_factures
  add column if not exists refusee_le timestamptz,
  add column if not exists refusee_par uuid references public.accounts(id),
  add column if not exists refus_motif text;
create index if not exists intervention_factures_refusee_par_idx on public.intervention_factures(refusee_par);

do $contraintes$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.intervention_factures'::regclass
                  and conname = 'intervention_factures_refus_motive') then
    alter table public.intervention_factures add constraint intervention_factures_refus_motive
      check ((refusee_le is null and refus_motif is null and refusee_par is null)
             or (refusee_le is not null and length(btrim(refus_motif)) between 5 and 2000));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.intervention_factures'::regclass
                  and conname = 'intervention_factures_refus_ou_validation') then
    alter table public.intervention_factures add constraint intervention_factures_refus_ou_validation
      check (refusee_le is null or validee_le is null);
  end if;
end $contraintes$;

comment on column public.intervention_factures.refusee_le is
  'Refus motivé par le gestionnaire (P1-03). La facture reste au dossier ; l''artisan peut en déposer une autre.';

-- ── 2. Une facture EN VIGUEUR par intervention ───────────────────────────────────────────────────────────────────
create unique index if not exists intervention_factures_une_en_vigueur
  on public.intervention_factures (intervention_id) where refusee_le is null;
alter table public.intervention_factures drop constraint if exists intervention_factures_intervention_id_key;

-- ── 3. Le type d'événement du fil du dossier ─────────────────────────────────────────────────────────────────────
do $contrainte$
declare
  v_def text;
  v_nouvelle text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.incident_evenements'::regclass and c.conname = 'incident_evenements_type_check';
  if v_def is null then
    raise exception 'P1-03 : contrainte incident_evenements_type_check introuvable';
  end if;
  if position('''facture_refusee''' in v_def) = 0 then
    v_nouvelle := regexp_replace(v_def, '\]\)\)\)$', ', ''facture_refusee''::text])))');
    if v_nouvelle = v_def or position('''facture_refusee''::text])))' in v_nouvelle) = 0 then
      raise exception 'P1-03 : forme inattendue de la contrainte incident_evenements_type_check';
    end if;
    alter table public.incident_evenements drop constraint incident_evenements_type_check;
    execute 'alter table public.incident_evenements add constraint incident_evenements_type_check ' || v_nouvelle;
  end if;
end $contrainte$;

-- ── 4. Les fonctions existantes apprennent l'état refusé ─────────────────────────────────────────────────────────
-- Chaque retouche part de la définition EN VIGUEUR (les règles ajoutées depuis sont conservées), exige son ancre une
-- fois exactement, et ne fait rien si elle est déjà en place.
do $retouches$
declare
  r record;
  d text;
  n integer;
begin
  for r in select * from (values
    -- Une facture refusée ne se valide pas : l'artisan en dépose une autre.
    ('public.valider_facture_artisan(uuid,uuid,text)',
     $a$  if f.validee_le is not null then return; end if;$a$,
     $b$  if f.validee_le is not null then return; end if;
  if f.refusee_le is not null then raise exception 'Cette facture a été refusée : l’artisan doit en déposer une nouvelle'; end if;$b$),
    -- Le dépôt n'est fermé que par une facture EN VIGUEUR.
    ('public.deposer_facture_artisan(uuid,text,bigint,text,text,text,bigint,text)',
     $a$  if exists (select 1 from public.intervention_factures f where f.intervention_id = p_intervention) then$a$,
     $b$  if exists (select 1 from public.intervention_factures f where f.intervention_id = p_intervention and f.refusee_le is null) then$b$),
    -- … et le dossier de stockage de la pièce se rouvre avec lui.
    ('public.dossiers_de_mes_factures_a_deposer()',
     $a$    and not exists (select 1 from public.intervention_factures f where f.intervention_id = i.id);$a$,
     $b$    and not exists (select 1 from public.intervention_factures f where f.intervention_id = i.id and f.refusee_le is null);$b$),
    -- L'agenda de l'artisan : « facture déposée » veut dire « une facture en vigueur ».
    ('public.mon_agenda_artisan(timestamp with time zone,timestamp with time zone)',
     $a$    exists (select 1 from public.intervention_factures f where f.intervention_id = i.id)$a$,
     $b$    exists (select 1 from public.intervention_factures f where f.intervention_id = i.id and f.refusee_le is null)$b$),
    -- L'alerte « facture à contrôler » reste ouverte tant que la facture n'est ni validée NI refusée.
    ('public.garder_alerte_facture_ouverte()',
     $a$      and f.organization_id=old.organization_id and f.validee_le is null) then$a$,
     $b$      and f.organization_id=old.organization_id and f.validee_le is null and f.refusee_le is null) then$b$)
  ) as t(fonction, ancien, nouveau) loop
    select pg_get_functiondef(r.fonction::regprocedure) into d;
    if strpos(d, r.nouveau) > 0 then continue; end if;
    n := (length(d) - length(replace(d, r.ancien, ''))) / length(r.ancien);
    if n <> 1 then
      raise exception 'P1-03 : % — ancre inattendue (% occurrence(s))', r.fonction, n;
    end if;
    execute replace(d, r.ancien, r.nouveau);
  end loop;
end $retouches$;

-- ── 5. Le refus ──────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.refuser_facture_artisan(p_org uuid, p_facture uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f record;
  v_incident uuid;
  v_motif text := btrim(coalesce(p_motif, ''));
begin
  if auth.uid() is null or not (p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into f from public.intervention_factures where id = p_facture and organization_id = p_org for update;
  if not found or public.intervention_hors_portefeuille(p_org, f.intervention_id) then
    raise exception 'Accès refusé';
  end if;
  -- Un double clic ne refuse pas deux fois, et ne réécrit pas le motif.
  if f.refusee_le is not null then return; end if;
  if f.validee_le is not null then
    raise exception 'Cette facture est déjà validée : elle ne se refuse plus';
  end if;
  if length(v_motif) not between 5 and 2000 then
    raise exception 'Indiquez à l’artisan ce qui est à corriger (5 à 2 000 caractères)';
  end if;
  select iv.incident_id into v_incident from public.incident_interventions iv
   where iv.id = f.intervention_id and iv.organization_id = p_org;

  update public.intervention_factures
     set refusee_le = now(), refusee_par = auth.uid(), refus_motif = v_motif
   where id = f.id;
  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v_incident, 'facture_refusee', auth.uid(), jsonb_build_object(
    'facture_id', f.id, 'numero', f.numero, 'montant_ttc_cents', f.montant_ttc_cents, 'motif', v_motif));
  insert into public.audit_log (account_id, organization_id, action, details)
  values (auth.uid(), p_org, 'facture_refusee', jsonb_build_object(
    'facture_id', f.id, 'numero', f.numero, 'intervention_id', f.intervention_id, 'incident_id', v_incident,
    'montant_ttc_cents', f.montant_ttc_cents));
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = auth.uid(), closed_action = 'Facture refusée, à corriger par l’artisan'
   where organization_id = p_org and type = 'facture_artisan_a_valider'
     and details->>'facture_id' = f.id::text and statut = 'ouverte';
end;
$$;
revoke all on function public.refuser_facture_artisan(uuid, uuid, text) from public, anon;
grant execute on function public.refuser_facture_artisan(uuid, uuid, text) to authenticated;
comment on function public.refuser_facture_artisan(uuid, uuid, text) is
  'Refus motivé d''une facture d''artisan non validée (référentiel, module 9, variante V5). La facture reste au dossier ; l''artisan peut en déposer une autre.';

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
