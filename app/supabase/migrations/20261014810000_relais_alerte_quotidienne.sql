-- D46-B, partie « alerte e-mail du relais » (décisions du dirigeant du 15/10/2026 ; document « Équipes IA et automatismes »,
-- § 3.6, § 4.1 à 4.3, décisions D3 et D8 du § 6.3).
--
-- LE DÉFAUT (fiches IA-02 et IA-03). Les urgences et escalades du mode vacances restaient dans la console, et aucune
-- alerte ne partait quand une tâche planifiée échouait ou ne passait pas : un incident ne se voyait que si l'écran Santé
-- ou « Relais et arrêts » était ouvert.
--
-- LES RÉPONSES DU DIRIGEANT. Responsable du relais : le dirigeant. Canal : e-mail, vers deux adresses (une variable
-- d'environnement du serveur, jamais dans le dépôt). Horaire : 05 h 00, heure de Paris, été comme hiver.
--
-- CETTE MIGRATION pose la partie « base » ; l'envoi lui-même vit dans le serveur (src/lib/relais-alerte-envoi.ts, route
-- /api/cron/relais, appelée par Vercel à 03 h et 04 h UTC : seule celle qui tombe à 5 h à Paris fait quelque chose).
--   1. `relais_alertes_envois` : une ligne par jour de Paris où le relais est passé (résultat, nombres seulement). Elle est
--      la garde d'idempotence : la tâche peut être appelée deux fois, l'e-mail ne part qu'une fois par jour.
--   2. `reserver_alerte_relais()` : réserve le jour de Paris (`public.aujourdhui_paris()`), une seule fois. Une reprise
--      n'est permise qu'après un échec d'envoi, un relais non configuré, ou une passe restée « en cours » plus de 10 minutes
--      (fonction coupée), et trois tentatives au plus. Garde aussi six mois de passages (durée des registres d'exécution
--      retenue par la décision D48), les plus anciens partant à la réservation suivante.
--   3. `terminer_alerte_relais(...)` : écrit le résultat. N'accepte que des nombres dans les compteurs : aucun texte,
--      aucune adresse, aucun nom ne peut y entrer.
--   4. `sentinelle_relais()` : ce que l'e-mail signale, côté base — alertes du mode vacances non accusées (comptées, jamais
--      leur titre, qu'un superviseur a pu écrire librement), arrêts d'urgence actifs (clé et date, jamais le motif), et la
--      « tâche sentinelle » des tâches pg_cron : en échec dans les dernières 24 h, absentes à leur heure prévue (horaire lu
--      dans `cron.job`, exécutions dans `cron.job_run_details`), ou attendues (table `supervision_taches_arret`) mais plus
--      programmées. Sans journal d'exécution lisible, elle le dit au lieu de croire les tâches à l'heure.
--   5. `cron_valeurs_champ` et `cron_derniere_echeance` : le calcul de la dernière heure prévue d'un horaire pg_cron
--      (minutes, heures, jours, mois, jours de semaine ; `*`, listes, intervalles, pas). Une écriture qu'il ne sait pas
--      lire (noms de jour, `$`, secondes) ne donne pas d'échéance : la tâche n'est alors jamais dite « absente » à tort.
--
-- L'ARRÊT D'URGENCE ne coupe pas cette alerte (choix justifié dans src/lib/relais-alerte-envoi.ts) : elle n'est lue par
-- aucun contrôle d'arrêt ; un arrêt actif est au contraire l'un de ses sujets.
--
-- Aucune donnée existante n'est touchée, aucune fonction existante n'est modifiée, aucune tâche pg_cron n'est ajoutée.
-- Rejouable : table `if not exists`, politique retirée puis reposée, fonctions `create or replace`.
-- Retour arrière : app/supabase/retours-arriere/20261014810000_relais_alerte_quotidienne.retour.sql.

-- ── 1. Le registre des passages du relais ────────────────────────────────────────────────────────────────────────────
create table if not exists public.relais_alertes_envois (
  jour date primary key,
  statut text not null default 'en_cours'
    check (statut in ('en_cours', 'envoye', 'envoi_partiel', 'echec', 'rien_a_signaler', 'non_configure')),
  tentatives integer not null default 1 check (tentatives between 1 and 3),
  destinataires integer not null default 0 check (destinataires between 0 and 20),
  envoyes integer not null default 0 check (envoyes between 0 and 20),
  points integer not null default 0 check (points between 0 and 1000),
  compteurs jsonb not null default '{}'::jsonb check (jsonb_typeof(compteurs) = 'object'),
  commence_le timestamptz not null default now(),
  termine_le timestamptz
);
comment on table public.relais_alertes_envois is
  'Un passage par jour de Paris de l''alerte e-mail du relais (D46-B) : résultat et nombres seulement, jamais d''adresse ni de texte. Garde d''idempotence de l''envoi quotidien de 5 h.';

alter table public.relais_alertes_envois enable row level security;
drop policy if exists supervision_lecture on public.relais_alertes_envois;
create policy supervision_lecture on public.relais_alertes_envois
  for select to authenticated using (public.is_permanent_super_admin());
-- Personne n'écrit directement : seules les deux fonctions du traitement, ci-dessous.
revoke all on public.relais_alertes_envois from public, anon, authenticated, service_role;
grant select on public.relais_alertes_envois to authenticated;

-- ── 2. La réservation du jour ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.reserver_alerte_relais()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jour date := public.aujourdhui_paris();
  v_ligne public.relais_alertes_envois;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  -- Décision D48 : six mois pour les registres d'exécution.
  delete from public.relais_alertes_envois where jour < (v_jour - interval '6 months')::date;

  insert into public.relais_alertes_envois(jour) values (v_jour)
    on conflict (jour) do nothing
    returning * into v_ligne;
  if found then
    return jsonb_build_object('reserve', true, 'jour', v_jour, 'tentative', v_ligne.tentatives);
  end if;

  -- Une reprise, jamais après un envoi réussi ni après « rien à signaler » : au plus un e-mail par jour.
  update public.relais_alertes_envois
     set statut = 'en_cours', tentatives = tentatives + 1, commence_le = now(), termine_le = null
   where jour = v_jour
     and tentatives < 3
     and (statut in ('echec', 'envoi_partiel', 'non_configure')
          or (statut = 'en_cours' and commence_le < now() - interval '10 minutes'))
  returning * into v_ligne;
  if found then
    return jsonb_build_object('reserve', true, 'jour', v_jour, 'tentative', v_ligne.tentatives);
  end if;

  select * into v_ligne from public.relais_alertes_envois where jour = v_jour;
  return jsonb_build_object('reserve', false, 'jour', v_jour, 'statut', v_ligne.statut, 'tentative', v_ligne.tentatives);
end;
$$;
comment on function public.reserver_alerte_relais() is
  'Réserve le jour de Paris pour l''alerte e-mail du relais (une fois par jour ; reprise après échec ou passe coupée, trois tentatives au plus). Traitement seulement.';
revoke all on function public.reserver_alerte_relais() from public, anon, authenticated;
grant execute on function public.reserver_alerte_relais() to service_role;

-- ── 3. Le résultat du passage ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.terminer_alerte_relais(
  p_jour date, p_statut text, p_destinataires integer, p_envoyes integer, p_points integer, p_compteurs jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  if p_statut is null or p_statut not in ('envoye', 'envoi_partiel', 'echec', 'rien_a_signaler', 'non_configure') then
    raise exception 'Résultat inconnu pour le relais';
  end if;
  if p_compteurs is null or jsonb_typeof(p_compteurs) <> 'object'
     or exists (select 1 from jsonb_each(p_compteurs) e where jsonb_typeof(e.value) <> 'number') then
    raise exception 'Les compteurs du relais ne contiennent que des nombres';
  end if;
  update public.relais_alertes_envois
     set statut = p_statut,
         destinataires = greatest(0, least(coalesce(p_destinataires, 0), 20)),
         envoyes = greatest(0, least(coalesce(p_envoyes, 0), 20)),
         points = greatest(0, least(coalesce(p_points, 0), 1000)),
         compteurs = p_compteurs,
         termine_le = now()
   where jour = p_jour and statut = 'en_cours';
end;
$$;
comment on function public.terminer_alerte_relais(date, text, integer, integer, integer, jsonb) is
  'Écrit le résultat du passage du relais (nombres seulement). Une passe déjà close ne se réécrit pas. Traitement seulement.';
revoke all on function public.terminer_alerte_relais(date, text, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.terminer_alerte_relais(date, text, integer, integer, integer, jsonb) to service_role;

-- ── 4. L'échéance d'un horaire pg_cron ───────────────────────────────────────────────────────────────────────────────
-- Les valeurs d'un champ d'horaire : `*`, `n`, `a-b`, chacun avec un pas `/p` facultatif, en liste séparée par des
-- virgules. `null` pour toute autre écriture (le calcul s'abstient alors).
create or replace function public.cron_valeurs_champ(p_champ text, p_min integer, p_max integer)
returns integer[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_morceau text;
  v_m text[];
  v_debut integer;
  v_fin integer;
  v_pas integer;
  v_valeurs integer[] := '{}';
begin
  if p_champ is null or p_champ = '' then
    return null;
  end if;
  foreach v_morceau in array string_to_array(p_champ, ',') loop
    v_m := regexp_match(v_morceau, '^(\*|\d{1,2}|\d{1,2}-\d{1,2})(?:/(\d{1,2}))?$');
    if v_m is null then
      return null;
    end if;
    v_pas := coalesce(v_m[2]::integer, 1);
    if v_m[1] = '*' then
      v_debut := p_min;
      v_fin := p_max;
    elsif position('-' in v_m[1]) > 0 then
      v_debut := split_part(v_m[1], '-', 1)::integer;
      v_fin := split_part(v_m[1], '-', 2)::integer;
    else
      v_debut := v_m[1]::integer;
      v_fin := case when v_m[2] is null then v_debut else p_max end;
    end if;
    if v_pas < 1 or v_debut < p_min or v_fin > p_max or v_debut > v_fin then
      return null;
    end if;
    v_valeurs := v_valeurs || array(select generate_series(v_debut, v_fin, v_pas));
  end loop;
  return v_valeurs;
end;
$$;
revoke all on function public.cron_valeurs_champ(text, integer, integer) from public, anon, authenticated, service_role;

-- La dernière minute de la fenêtre ]p_avant - p_fenetre ; p_avant] où l'horaire devait se déclencher, lue dans le fuseau
-- de pg_cron. Règle de cron : si le jour du mois ET le jour de semaine sont restreints, l'un OU l'autre suffit.
create or replace function public.cron_derniere_echeance(p_horaire text, p_avant timestamptz, p_fenetre interval, p_fuseau text default 'GMT')
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_c text[];
  v_minutes integer[];
  v_heures integer[];
  v_jours integer[];
  v_mois integer[];
  v_semaine integer[];
  v_jours_libres boolean;
  v_semaine_libre boolean;
begin
  v_c := regexp_split_to_array(btrim(coalesce(p_horaire, '')), '\s+');
  if array_length(v_c, 1) is distinct from 5 then
    return null;
  end if;
  v_minutes := public.cron_valeurs_champ(v_c[1], 0, 59);
  v_heures := public.cron_valeurs_champ(v_c[2], 0, 23);
  v_jours := public.cron_valeurs_champ(v_c[3], 1, 31);
  v_mois := public.cron_valeurs_champ(v_c[4], 1, 12);
  v_semaine := public.cron_valeurs_champ(v_c[5], 0, 7);
  if v_minutes is null or v_heures is null or v_jours is null or v_mois is null or v_semaine is null then
    return null;
  end if;
  -- Le dimanche s'écrit 0 ou 7.
  v_semaine := array(select distinct case when x = 7 then 0 else x end from unnest(v_semaine) as x);
  v_jours_libres := left(v_c[3], 1) = '*';
  v_semaine_libre := left(v_c[5], 1) = '*';
  return (
    select max(s.t)
      from (select g.t, g.t at time zone coalesce(nullif(p_fuseau, ''), 'GMT') as l
              from generate_series(date_trunc('minute', p_avant - p_fenetre) + interval '1 minute',
                                   date_trunc('minute', p_avant), interval '1 minute') as g(t)) s
     where extract(minute from s.l)::integer = any(v_minutes)
       and extract(hour from s.l)::integer = any(v_heures)
       and extract(month from s.l)::integer = any(v_mois)
       and case when v_jours_libres or v_semaine_libre
                then extract(day from s.l)::integer = any(v_jours) and extract(dow from s.l)::integer = any(v_semaine)
                else extract(day from s.l)::integer = any(v_jours) or extract(dow from s.l)::integer = any(v_semaine)
           end
  );
end;
$$;
revoke all on function public.cron_derniere_echeance(text, timestamptz, interval, text) from public, anon, authenticated, service_role;

-- ── 5. La sentinelle ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.sentinelle_relais()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := now();
  v_fuseau text := coalesce(nullif(current_setting('cron.timezone', true), ''), 'GMT');
  v_alertes jsonb;
  v_arrets jsonb;
  v_lisible boolean;
  v_taches jsonb := '[]'::jsonb;
  v_echecs integer;
  v_derniere timestamptz;
  v_echeance timestamptz;
  v_etat text;
  r record;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;

  -- Les alertes du mode vacances non accusées : des nombres, jamais leur titre.
  select jsonb_build_object(
           'ouvertes', count(*) filter (where a.statut = 'ouverte'),
           'escaladees', count(*) filter (where a.statut = 'escalade'),
           'non_acheminees', count(*) filter (where a.statut = 'non_acheminee'))
    into v_alertes
    from public.supervision_alertes_internes a
   where a.statut <> 'accusee';

  -- Les arrêts d'urgence actifs : la clé et la date, jamais le motif (texte libre).
  select coalesce(jsonb_agg(jsonb_build_object('cle', s.cle, 'depuis', s.modifie_le) order by s.modifie_le, s.cle), '[]'::jsonb)
    into v_arrets
    from public.supervision_arrets s
   where s.arrete;

  -- Les tâches pg_cron : attendues (table de l'arrêt d'urgence) ou programmées (cron.job), lues dans leur journal.
  v_lisible := pg_catalog.to_regclass('cron.job') is not null and pg_catalog.to_regclass('cron.job_run_details') is not null;
  if v_lisible then
    for r in execute $q$
      select coalesce(j.jobname, a.tache) as nom, j.jobid, j.schedule
        from (select distinct t.tache from public.supervision_taches_arret t) a
        full join cron.job j on j.jobname = a.tache
       order by 1
    $q$
    loop
      v_echecs := 0;
      if r.jobid is null then
        v_etat := 'non_programmee';
      else
        execute $q$
          select count(*) filter (where d.status = 'failed' and d.start_time > $2 - interval '24 hours'), max(d.start_time)
            from cron.job_run_details d
           where d.jobid = $1 and d.start_time > $2 - interval '25 hours'
        $q$ into v_echecs, v_derniere using r.jobid, v_maintenant;
        -- Marge de 10 minutes : une tâche prévue à l'instant n'est pas encore « absente ».
        v_echeance := public.cron_derniere_echeance(r.schedule, v_maintenant - interval '10 minutes', interval '24 hours', v_fuseau);
        v_etat := case
                    when v_echecs > 0 then 'echec'
                    when v_echeance is not null and (v_derniere is null or v_derniere < v_echeance - interval '1 minute') then 'absente'
                    else 'ok'
                  end;
      end if;
      v_taches := v_taches || jsonb_build_array(jsonb_build_object('tache', r.nom, 'etat', v_etat, 'echecs', v_echecs));
    end loop;
  end if;

  return jsonb_build_object(
    'alertes', v_alertes,
    'arrets', v_arrets,
    'taches_base_lisibles', v_lisible,
    'taches_base', v_taches,
    'observe_le', v_maintenant
  );
end;
$$;
comment on function public.sentinelle_relais() is
  'Ce que l''alerte e-mail du relais signale côté base (D46-B) : alertes de vacances non accusées, arrêts actifs, tâches pg_cron en échec, absentes ou non programmées. Nombres et libellés de tâche seulement. Traitement seulement.';
revoke all on function public.sentinelle_relais() from public, anon, authenticated;
grant execute on function public.sentinelle_relais() to service_role;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
