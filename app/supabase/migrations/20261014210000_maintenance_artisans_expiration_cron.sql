-- La caducité des devis d'artisan n'était jamais lancée (14/10/2026, audit AUT-01, décision D42, option B).
--
-- Constat : `maintenance_artisans()` (migration 20260911180000) porte deux travaux — passer à « expiré » les devis
-- dont la validité est dépassée (RM-9.2.3) et purger les motifs de liste noire arrivés à échéance (matrice A2) — et
-- se dit « appelée par une planification, pas par un écran ». Aucune planification ne l'appelait, et aucune ne
-- pouvait le faire : la fonction exige `is_super_admin()` (jeton de second facteur et adhésion super_admin), qu'une
-- tâche pg_cron n'a pas. Même cause que la préparation du soir du marketing (20261013110000).
-- Effet réel (code lu, voir la fiche AUT-01) : un devis périmé restait « déposé » ; sa sollicitation restait
-- « vivante » et occupait l'une des deux places de la mise en concurrence (RM-9.1.1) ; l'artisan ne pouvait ni
-- décliner ni redéposer ; un incident dont les deux artisans avaient déposé un devis périmé n'avait plus d'issue
-- par l'écran. La sélection d'un devis périmé était déjà refusée par `retenir_devis`.
--
-- Correction, même schéma que 20261013110000 :
--   1. `maintenance_artisans_interne()` : SANS garde d'identité, fermée à tous les rôles d'API (seul le propriétaire
--      de la fonction — l'identité de pg_cron — l'exécute). Elle ne fait QUE la caducité : les devis « déposés »
--      dont la validité est passée deviennent « expirés », et leur sollicitation, « expirée ».
--   2. `maintenance_artisans()` est conservée avec sa garde de super-administrateur ; elle appelle l'interne pour la
--      caducité et GARDE la purge des motifs de liste noire, pour l'usage manuel.
--   3. La tâche `maintenance-artisans` appelle l'interne chaque jour à 04 h 30 UTC : après les alertes de restitution
--      de 04 h 15, avant le cycle mensuel de 05 h, et après 02 h UTC pour que le jour soit déjà celui de Paris.
--
-- Ce que cette migration NE fait PAS (option B de D42) :
--   · la purge des motifs de liste noire n'est PAS planifiée : elle lève une mesure prise contre une personne et ses
--     durées (3 ans en local, 5 ans en global) restent à faire valider ; rien n'est de toute façon à purger avant
--     septembre 2029 (première inscription en liste noire : module du 11/09/2026) ;
--   · les sollicitations restées SANS réponse (« envoyée », sans devis) ne sont pas traitées : elles gardent leur
--     place dans le plafond de deux et l'artisan peut toujours répondre ;
--   · aucun statut existant n'est réécrit par la migration elle-même : les devis déjà périmés sont passés à
--     « expiré » par le premier passage de la tâche (voir le relevé de production à faire avant, dans le retour
--     arrière) ;
--   · l'arrêt d'urgence (D06) n'est pas lu : le lot qui le prévoit (prédicat interne lu en tête des tâches SQL)
--     n'est pas intégré. Quand il le sera, cette tâche devra lire la clé `global` (qui arrête tout) ; aucune clé de
--     `supervision_arrets` ne lui est propre, la plus proche étant `rappels` (équipe « Incidents et artisans »), à
--     désigner dans la table de correspondance de D06.
--
-- Elle se rejoue sans effet : `create or replace` (définitions identiques, droits reposés à l'identique) et
-- `cron.schedule` avec un nom de tâche déjà connu met la tâche à jour sans en créer une seconde.

create or replace function public.maintenance_artisans_interne()
returns integer
language plpgsql security definer set search_path = '' as $$
-- Audit du 14/10 (AUT-01), D42 option B : la caducité des devis SEULE, pour pg_cron (aucune garde d'identité).
declare
  v_devis integer;
  -- Le jour de Paris, comme l'écran : un devis valable « jusqu'au » un jour l'est toute la journée.
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
begin
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

create or replace function public.maintenance_artisans()
returns table (devis_expires integer, motifs_purges integer)
language plpgsql security definer set search_path = '' as $$
-- Audit du 14/10 (AUT-01), D42 option B : la caducité des devis est faite par maintenance_artisans_interne(), que
-- pg_cron appelle chaque jour ; cette version-ci, réservée au super-administrateur, la rejoue à la demande et GARDE
-- la purge des motifs de liste noire, qui n'est pas planifiée.
declare v_devis integer; v_motifs integer; v_n integer;
begin
  if not public.is_super_admin() then raise exception 'Accès refusé'; end if;

  v_devis := public.maintenance_artisans_interne();

  -- A2 : « au-delà, un artisan doit pouvoir repartir sans que son passé le
  -- suive ». Purger le seul motif laisserait une liste noire sans motif — ce
  -- que la contrainte interdit, et à juste titre : une sanction sans motif
  -- n'est plus opposable. La purge LÈVE donc la mesure. Localement, la
  -- relation retombe sur « désactivée » (neutre, sans motif) : l'agence
  -- décide de la réactiver ou non, mais elle ne le sanctionne plus.
  update public.artisan_agences
  set blacklist_le = null, blacklist_motif = null, blacklist_par = null,
      purge_motif_le = null
  where purge_motif_le is not null and purge_motif_le <= current_date;
  get diagnostics v_motifs = row_count;

  update public.artisans
  set blacklist_globale_le = null, blacklist_globale_motif = null,
      blacklist_globale_par = null, purge_motif_le = null
  where purge_motif_le is not null and purge_motif_le <= current_date
    and blacklist_globale_le is not null;
  get diagnostics v_n = row_count;

  return query select v_devis, v_motifs + v_n;
end;
$$;
revoke execute on function public.maintenance_artisans() from public, anon;

select cron.schedule('maintenance-artisans', '30 4 * * *',
  $$select public.maintenance_artisans_interne()$$);

select public.fermer_fonctions_a_anon();
