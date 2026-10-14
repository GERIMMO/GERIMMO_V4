-- VÉRIFIER L'ÉTAT des migrations 20261013110000, 20261013120000, 20261014210000 et 20261014211000 (lecture seule, ne modifie rien).
-- À jouer avant un retour arrière (on doit lire « migrée (B) »), après (on doit lire « antérieure (A) »),
-- et en cas de doute : psql "$URL" -f verifier-etat.sql
-- « migrée (B) » : la marque du correctif figure dans la définition en vigueur ; « antérieure (A) » : elle est absente.
-- Une fonction réécrite depuis par une autre migration sans cette marque se lit « antérieure (A)» à tort :
-- relire alors le dépôt (git log -- app/supabase/migrations) avant de conclure.

with f(migration, signature, marque) as (values
  ('20261013110000', 'public.cible_preparation_marketing()', 'cible_preparation_marketing_interne'),
  ('20261013110000', 'public.preparation_marketing_due()', 'cible_preparation_marketing_interne'),
  ('20261013120000', 'public.definir_equipements_lot(uuid,uuid[])', 'Audit du 13/10 (AUD-A-01)'),
  ('20261013120000', 'public.contre_ecriture(uuid,text)', 'Audit du 13/10 (AUD-A-02)'),
  ('20261013120000', 'public.annuler_mission(uuid,uuid,text)', 'Audit du 13/10 (AUD-A-03)'),
  ('20261013120000', 'public.supprimer_detention(uuid)', 'Audit du 13/10 (AUD-A-04)'),
  ('20261013120000', 'public.poser_gardes_diagnostic_artisan()', '''supervision_arrets'',''supervision_operations'',''supervision_vacances'''),
  ('20261013120000', 'public.traiter_vacances()', 'Audit du 13/10 (SUP-08)'),
  ('20261013120000', 'public.contre_proposer_creneaux(uuid,uuid,jsonb)', 'Audit du 13/10 (REP-01)'),
  ('20261013120000', 'public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid)', 'Audit du 13/10 (ARC-10)'),
  ('20261013120000', 'public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)', 'Audit du 13/10 (ARC-10)'),
  ('20261014210000', 'public.maintenance_artisans()', 'maintenance_artisans_interne'),
  ('20261014211000', 'public.maintenance_artisans_interne()', 'Audit du 14/10 (AUT-01, D06)'))
select migration, signature as objet,
       case when to_regprocedure(signature) is null then 'ABSENTE (anormal)'
            when position(marque in pg_get_functiondef(to_regprocedure(signature))) > 0 then 'migrée (B)'
            else 'antérieure (A)' end as etat
  from f
union all
select '20261013110000', 'public.cible_preparation_marketing_interne()',
       case when to_regprocedure('public.cible_preparation_marketing_interne()') is null then 'antérieure (A) : absente' else 'migrée (B) : présente' end
union all
select '20261013120000', 'contrainte incident_evenements_type_check',
       coalesce((select case when pg_get_constraintdef(oid) like '%mission_annulee%' then 'migrée (B)' else 'antérieure (A)' end
                         || case when convalidated then '' else ' — NOT VALID (lignes mission_annulee conservées)' end
                   from pg_constraint where conrelid = 'public.incident_evenements'::regclass and conname = 'incident_evenements_type_check'),
                'ABSENTE (anormal)')
union all
select '20261013120000', 'lignes incident_evenements.type = mission_annulee', count(*)::text
  from public.incident_evenements where type = 'mission_annulee'
union all
select '20261013120000', 'déclencheurs diagnostic_artisan_lecture sur supervision_arrets/operations/vacances',
       (select count(*)::text || ' sur 3 (3 = antérieur A, 0 = migré B)' from pg_trigger t
         where not t.tgisinternal and t.tgname = 'diagnostic_artisan_lecture'
           and t.tgrelid in ('public.supervision_arrets'::regclass, 'public.supervision_operations'::regclass, 'public.supervision_vacances'::regclass))
union all
select '20261013120000', 'lignes audit_log contre_ecriture / detention_supprimee (jamais défaites par le retour)',
       (select count(*) from public.audit_log where action = 'contre_ecriture')::text || ' / ' || (select count(*) from public.audit_log where action = 'detention_supprimee')::text
union all
select '20261014210000', 'public.maintenance_artisans_interne()',
       case when to_regprocedure('public.maintenance_artisans_interne()') is null then 'antérieure (A) : absente' else 'migrée (B) : présente' end
union all
select '20261014210000', 'tâche pg_cron maintenance-artisans',
       coalesce((select 'migrée (B) : ' || schedule || ' — ' || command from cron.job where jobname = 'maintenance-artisans'), 'antérieure (A) : absente')
union all
select '20261014210000', 'devis « expire » / sollicitations « expiree » (jamais restaurés par le retour)',
       (select count(*) from public.incident_devis where statut = 'expire')::text || ' / ' || (select count(*) from public.incident_sollicitations where statut = 'expiree')::text
union all
-- La table de correspondance appartient au lot « arrêt d'urgence » (D06) : si elle n'existe pas, on ne l'interroge pas.
select '20261014211000', 'ligne de la tâche maintenance-artisans dans supervision_taches_arret (lot D06)',
       case when to_regclass('public.supervision_taches_arret') is null then 'lot D06 non intégré : pas de table, rien à lire'
            else (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.supervision_taches_arret where tache = ''maintenance-artisans''', false, true, '')))[1]::text
                 || ' ligne(s) (1 = migrée B, 0 = antérieure A)' end
order by 1, 2;

-- Historique des migrations : doit citer les quatre versions si elles sont appliquées, aucune si le retour a été fait.
select version from supabase_migrations.schema_migrations where version in ('20261013110000', '20261013120000', '20261014210000', '20261014211000') order by 1;
