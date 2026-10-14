-- L'arrêt d'urgence couvre aussi les 8 tâches SQL planifiées par pg_cron (décision D06, option A).
--
-- CONSTAT (audit du 13 octobre 2026, SUP-01). La supervision enregistre un arrêt « global » ou par
-- mission, et les routes /api/cron/* s'arrêtent : elles appellent verifier_arret_supervision. Mais
-- pg_cron appelle ses fonctions SQL directement, sans passer par ces routes : la rétention
-- (suppressions), le cycle mensuel (appels de loyer et quittances), les alertes et le déclencheur
-- marketing continuaient pendant que l'écran affichait « arrêt actif ».
-- verifier_arret_supervision ne convient pas à pg_cron : elle exige un jeton (service_role ou
-- superviseur permanent), et pg_cron s'exécute sans jeton.
--
-- CORRECTION. Un prédicat interne, tache_planifiee_autorisee(tâche), lu en TÊTE de chaque fonction
-- planifiée (juste après son contrôle d'appelant quand elle en a un, pour ne rien révéler à un
-- appelant refusé). Il lit les mêmes arrêts que la supervision (supervision_arrets) : l'arrêt
-- « global » ou celui des clés que la table de correspondance associe à la tâche. Arrêt actif : la
-- fonction rend sa valeur neutre (zéro, vide) et ne fait rien d'autre ; elle ne laisse même pas de
-- trace. Arrêt levé : comportement inchangé.
--
--   tâche pg_cron                      clé d'arrêt
--   retention-quotidienne              purge
--   cycle-mensuel                      appels, quittances
--   alertes-impayes-quotidiennes       relances
--   alertes-diagnostics-quotidiennes   rappels
--   alertes-assurance-quotidiennes     rappels
--   alertes-restitutions-quotidiennes  rappels
--   propositions-publication-hebdo     marketing
--   marketing-declencheur              marketing
--
-- Une tâche arrêtée n'est pas rattrapée à la levée de l'arrêt : elle repart à son prochain horaire.
-- Le cycle mensuel, lui, crée au passage suivant les appels de tous les mois manquants.
--
-- Le prédicat est fermé à tous les rôles (seules les fonctions planifiées, qui appartiennent au
-- propriétaire, l'appellent). Retour en arrière : retirer les appels (script
-- retours-arriere/20261014200000_arret_urgence_taches_planifiees.retour.sql) ; aucune donnée
-- financière n'est touchée par cette migration.
--
-- Elle se rejoue sans effet : chaque fonction est relue (pg_get_functiondef), la marque du
-- correctif s'y cherche, et l'ancre n'est exigée que si la marque est absente.

-- ── 1. La table de correspondance tâche → clé d'arrêt ──────────────────────
-- Écrite par cette migration seulement : aucun rôle applicatif ne l'écrit.
create table if not exists public.supervision_taches_arret (
  tache text not null check (length(tache) between 3 and 80),
  cle text not null check (cle in ('consignes','veille','appels','quittances','relances','rappels','abonnements','signatures','marketing','territoire','purge','orchestrateur')),
  primary key (tache, cle)
);
comment on table public.supervision_taches_arret is
  'Quelle clé d''arrêt d''urgence (supervision_arrets) arrête quelle tâche pg_cron. L''arrêt « global » arrête toutes les tâches.';

insert into public.supervision_taches_arret (tache, cle) values
  ('retention-quotidienne', 'purge'),
  ('cycle-mensuel', 'appels'),
  ('cycle-mensuel', 'quittances'),
  ('alertes-impayes-quotidiennes', 'relances'),
  ('alertes-diagnostics-quotidiennes', 'rappels'),
  ('alertes-assurance-quotidiennes', 'rappels'),
  ('alertes-restitutions-quotidiennes', 'rappels'),
  ('propositions-publication-hebdo', 'marketing'),
  ('marketing-declencheur', 'marketing')
on conflict do nothing;

alter table public.supervision_taches_arret enable row level security;
drop policy if exists supervision_lecture on public.supervision_taches_arret;
create policy supervision_lecture on public.supervision_taches_arret
  for select to authenticated using (public.is_permanent_super_admin());
revoke all on public.supervision_taches_arret from public, anon, authenticated, service_role;
grant select on public.supervision_taches_arret to authenticated, service_role;

-- ── 2. Le prédicat ─────────────────────────────────────────────────────────
-- Vrai : la tâche peut s'exécuter. Faux : un arrêt (global ou propre à la tâche) est en vigueur.
-- Même sens que verifier_arret_supervision. Une tâche absente de la table est une erreur de
-- programmation (fonction planifiée sans correspondance) : elle s'arrête plutôt que de s'exécuter.
create or replace function public.tache_planifiee_autorisee(p_tache text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_tache is null or not exists (select 1 from public.supervision_taches_arret where tache = p_tache) then
    raise exception 'Tâche planifiée inconnue de la table d''arrêt : %', coalesce(p_tache, '(vide)');
  end if;
  return not exists (
    select 1
      from public.supervision_arrets a
     where a.arrete
       and (a.cle = 'global'
            or a.cle in (select t.cle from public.supervision_taches_arret t where t.tache = p_tache))
  );
end;
$$;
comment on function public.tache_planifiee_autorisee(text) is
  'Prédicat interne de l''arrêt d''urgence pour les tâches pg_cron : vrai si la tâche peut s''exécuter. Fermé à tous les rôles ; lu en tête de chaque fonction planifiée.';
revoke all on function public.tache_planifiee_autorisee(text) from public, anon, authenticated, service_role;

-- ── 3. Les huit fonctions planifiées ───────────────────────────────────────
do $correctif$
declare
  r record;
  v_def text;
  v_garde text;
  v_ancre text;
  v_cand text;
begin
  for r in
    select * from (values
      ('public.appliquer_retention()', 'retention-quotidienne',
       array[E'    raise exception ''appliquer_retention: reserve au super admin'';\n  end if;\n'],
       $neutre$jsonb_build_object('arret_en_cours', true, 'journaux', '{}'::jsonb, 'documents_purges', 0, 'documents_anonymises', 0)$neutre$),
      ('public.cycle_mensuel_interne()', 'cycle-mensuel',
       array[E'    raise exception ''cycle_mensuel_interne: reserve au cron et au super admin'';\n  end if;\n'],
       $neutre$jsonb_build_object('arret_en_cours', true, 'baux', 0, 'appels_crees', 0, 'quittances', 0, 'recus', 0, 'echecs', '[]'::jsonb)$neutre$),
      ('public.generer_alertes_impayes()', 'alertes-impayes-quotidiennes',
       array[E'    raise exception ''generer_alertes_impayes: reserve au cron et au super admin'';\n  end if;\n'],
       '0'),
      ('public.generer_alertes_diagnostics()', 'alertes-diagnostics-quotidiennes',
       array[E'    raise exception ''generer_alertes_diagnostics: reserve au cron et au super admin'';\n  end if;\n',
         E'then raise exception ''generer_alertes_diagnostics: reserve au cron et au super admin''; end if;\n'],
       '0'),
      ('public.generer_alertes_assurance()', 'alertes-assurance-quotidiennes',
       array[E'    raise exception ''generer_alertes_assurance: reserve au cron et au super admin'';\n  end if;\n',
         E'then raise exception ''generer_alertes_assurance: reserve au cron et au super admin''; end if;\n'],
       '0'),
      ('public.generer_alertes_restitution()', 'alertes-restitutions-quotidiennes',
       array[E'    raise exception ''generer_alertes_restitution: reserve au cron et au super admin'';\n  end if;\n',
         E'then raise exception ''generer_alertes_restitution: reserve au cron et au super admin''; end if;\n'],
       '0'),
      -- Sans contrôle d'appelant (fermée à anon et authenticated) : la garde suit directement « begin ».
      ('public.proposer_publications_interne(date)', 'propositions-publication-hebdo', array[E'\nbegin\n'], '0'),
      ('public.declencher_marketing()', 'marketing-declencheur', array[E'\nbegin\n'], '')
    ) as t(signature, tache, ancres, neutre)
  loop
    select pg_get_functiondef(r.signature::regprocedure) into v_def;
    -- Rejeu : la marque du correctif est déjà là, il n'y a rien à refaire.
    if position('Audit du 14/10 (SUP-01)' in v_def) > 0 then continue; end if;
    -- Une seule ancre doit convenir, exactement une fois : la forme sur plusieurs lignes (le dépôt) ou celle sur une
    -- seule ligne (production, trois fonctions d'alertes). Aucune ne convient, ou plusieurs : on s'arrête.
    v_ancre := null;
    foreach v_cand in array r.ancres loop
      if (length(v_def) - length(replace(v_def, v_cand, ''))) = length(v_cand) then
        v_ancre := v_cand;
        exit;
      end if;
    end loop;
    if v_ancre is null then
      raise exception 'Correctif SUP-01 (%) : définition inattendue (ancre absente ou répétée)', r.signature;
    end if;
    v_garde := format($garde$  -- Audit du 14/10 (SUP-01) : l'arrêt d'urgence couvre aussi cette tâche pg_cron. Arrêt actif : aucun effet.
  if not public.tache_planifiee_autorisee(%L) then
    %s;
  end if;
$garde$, r.tache, btrim('return ' || r.neutre));
    v_def := replace(v_def, v_ancre, v_ancre || v_garde);
    execute v_def;
  end loop;
end $correctif$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
