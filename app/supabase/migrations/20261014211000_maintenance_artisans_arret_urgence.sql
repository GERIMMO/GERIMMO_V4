-- L'arrêt d'urgence arrête aussi la caducité des devis d'artisan (14/10/2026, audit AUT-01 ; décision D42 option B,
-- point 5 de la correction : « lecture de l'arrêt d'urgence si D06 est retenue » ; décision D06, option A).
--
-- Constat. La migration 20261014210000 a planifié la tâche pg_cron `maintenance-artisans` (04 h 30 UTC) mais ne lit pas
-- l'arrêt d'urgence : le lot qui le prévoit (D06, migration 20261014200000 : table `supervision_taches_arret` et
-- prédicat interne `tache_planifiee_autorisee`) n'était pas intégré. Or D06 retient que l'arrêt d'urgence couvre TOUTES
-- les tâches pg_cron. Une fois les deux lots réunis, la tâche serait donc la neuvième, hors couverture : l'écran
-- afficherait « arrêt actif » pendant que des devis passent à « expiré » et que leurs sollicitations sont libérées.
-- Le prédicat refuse d'ailleurs une tâche absente de sa table (« Tâche planifiée inconnue de la table d'arrêt »).
--
-- Correction (deux gestes, sans réécrire 20261014210000).
--   1. `maintenance_artisans_interne()` lit l'arrêt EN TÊTE, avant tout effet (pas même le drapeau système) :
--      `tache_planifiee_autorisee('maintenance-artisans')`. Arrêt actif (global, ou clé « rappels ») : elle rend 0 et ne
--      fait rien d'autre. La lecture est conditionnée à l'existence du prédicat, qui se teste à l'exécution (pas à la
--      pose de la migration) : tant que le lot D06 n'est pas intégré, rien ne change ; dès qu'il l'est, l'arrêt agit
--      sans autre migration. `maintenance_artisans()` (super-administrateur) passe par l'interne : même arrêt.
--   2. Si la table de correspondance de D06 existe déjà, la tâche y est inscrite : ('maintenance-artisans', 'rappels').
--      Sans cette ligne le prédicat lèverait une exception et la tâche échouerait chaque jour.
--
-- CLÉ « rappels » : à confirmer par le dirigeant. Les clés d'arrêt existantes sont des missions de supervision ; aucune
-- n'est propre à cette tâche. « rappels » (« Rendez-vous et suivi des dossiers », équipe « Incidents et artisans »)
-- est la plus proche ; l'arrêt « global » arrête la tâche dans tous les cas. Changer la clé = une ligne de la table.
--
-- ORDRE. À rejouer APRÈS 20261014200000 (c'est le cas dans ordre-migrations.txt : l'horodatage est postérieur). Si la
-- base reçoit D06 après cette migration, la ligne de correspondance manque : l'inscrire à la main (insert … on conflict
-- do nothing, voir le LISEZ-MOI des retours arrière) avant le prochain passage de la tâche.
--
-- À L'INTÉGRATION, la tâche devient la neuvième : les tests du lot D06 qui comptent HUIT tâches pg_cron doivent être
-- mis à jour (tests/arret-taches-planifiees.test.ts « couvre exactement les tâches planifiées » ; tests/sauvegarde-
-- taches-planifiees.test.ts, deux cas ; docs/sauvegarde-et-restauration.md, « Huit tâches SQL »), ainsi que le miroir
-- `TACHES_SQL` de src/lib/nom-arret-supervision.ts. Rien de tout cela n'existe dans la branche de ce lot.
--
-- Ce que cette migration NE fait PAS : elle ne réécrit aucune donnée ; elle n'arrête pas la purge manuelle des motifs
-- de liste noire de `maintenance_artisans()` (usage manuel du super-administrateur, non planifiée, hors D06) ; elle ne
-- crée ni la table ni le prédicat de D06.
--
-- Elle se rejoue sans effet : `create or replace` (même définition, droits reposés) et `insert … on conflict do nothing`.

create or replace function public.maintenance_artisans_interne()
returns integer
language plpgsql security definer set search_path = '' as $$
-- Audit du 14/10 (AUT-01), D42 option B : la caducité des devis SEULE, pour pg_cron (aucune garde d'identité).
-- Audit du 14/10 (AUT-01, D06) : l'arrêt d'urgence l'arrête aussi (global, ou clé « rappels ») : aucun effet.
declare
  v_devis integer;
  -- Le jour de Paris, comme l'écran : un devis valable « jusqu'au » un jour l'est toute la journée.
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
  v_autorisee boolean := true;
begin
  -- Arrêt d'urgence, lu AVANT tout effet. Le prédicat est celui du lot « arrêt d'urgence » (fermé à tous les rôles,
  -- lu ici par le propriétaire de la fonction) ; absent, il n'y a rien à lire.
  if pg_catalog.to_regprocedure('public.tache_planifiee_autorisee(text)') is not null then
    execute 'select public.tache_planifiee_autorisee($1)' into v_autorisee using 'maintenance-artisans';
    if not v_autorisee then
      return 0;
    end if;
  end if;

  -- Tâche de plateforme : sans identité (pg_cron), la garde d'abonnement refuse toute écriture sur une agence
  -- suspendue ; une seule agence dans ce cas ferait échouer le passage pour TOUTES. La caducité d'un devis ne
  -- dépend pas de la situation commerciale de l'agence (c'est l'usage prévu de tache_systeme(), « à appeler en tête
  -- d'une tâche planifiée »). Le drapeau ne vaut que pour la transaction en cours, et il est rendu à sa valeur
  -- d'avant avant de sortir (appel manuel inclus).
  perform public.tache_systeme();

  update public.incident_devis set statut = 'expire'
  where statut = 'depose' and valide_jusqu_au < v_jour;
  get diagnostics v_devis = row_count;

  update public.incident_sollicitations s set statut = 'expiree'
  where s.statut in ('envoyee', 'devis_depose')
    and exists (select 1 from public.incident_devis d
                where d.sollicitation_id = s.id and d.statut = 'expire');

  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return v_devis;
end;
$$;
revoke all on function public.maintenance_artisans_interne() from public, anon, authenticated, service_role;

-- Si la table de correspondance de l'arrêt d'urgence (D06) existe déjà, la tâche y est inscrite. Sans ce lot, rien à faire.
-- L'instruction est dynamique : elle ne doit pas être analysée tant que la table n'existe pas.
do $correspondance$
begin
  if pg_catalog.to_regclass('public.supervision_taches_arret') is not null then
    execute $ligne$insert into public.supervision_taches_arret (tache, cle)
                    values ('maintenance-artisans', 'rappels') on conflict do nothing$ligne$;
  end if;
end $correspondance$;

select public.fermer_fonctions_a_anon();
