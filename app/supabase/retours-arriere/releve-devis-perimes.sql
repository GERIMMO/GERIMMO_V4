-- RELEVÉ AVANT LA PREMIÈRE EXÉCUTION de la tâche `maintenance-artisans` (migration 20261014210000, audit AUT-01, D42 B).
-- LECTURE SEULE : aucune instruction de ce fichier n'écrit en base. À jouer sur la production AVANT d'appliquer la
-- migration (ou, au plus tard, avant 04 h 30 UTC le jour de son application), puis à CONSERVER.
--
-- Pourquoi : le premier passage de la tâche va passer d'un coup à « expiré » TOUS les devis encore « déposés » dont la
-- validité est dépassée, et à « expirée » leur sollicitation. Rien dans la base ne garde l'état d'avant : le retour
-- arrière (20261014210000_…retour.sql) retire la tâche et rétablit la fonction, mais ne remet aucun statut. Ce relevé
-- est la seule trace de ce qui sera changé ; il ne contient que des identifiants et des dates (ni montant, ni nom,
-- ni coordonnée).
--
-- Usage (mot de passe par PGPASSWORD, jamais dans la ligne de commande) :
--   psql "$URL" -v ON_ERROR_STOP=1 -f releve-devis-perimes.sql
--   puis, pour garder la liste exacte (2e requête) :
--   psql "$URL" -c "\copy (<2e requête sans le point-virgule>) to 'releve-devis-perimes.csv' csv header"
--
-- Le jour retenu est le jour de Paris, comme la tâche : un devis valable « jusqu'au » un jour l'est toute la journée.

-- 1. Combien de devis la première exécution va-t-elle passer à « expiré » ? (les chiffres à mettre dans la décision)
select count(*)                                          as devis_deposes_perimes,
       count(distinct d.incident_id)                     as incidents_concernes,
       count(distinct d.organization_id)                 as agences_concernees,
       min(d.valide_jusqu_au)                            as plus_ancienne_validite,
       max(d.valide_jusqu_au)                            as plus_recente_validite
  from public.incident_devis d
 where d.statut = 'depose'
   and d.valide_jusqu_au < (now() at time zone 'Europe/Paris')::date;

-- 2. La liste exacte, avec l'état de la sollicitation et de la mise en concurrence : c'est ce qu'il faudrait
--    remettre « déposé » / « devis_depose » si l'on décidait de défaire, identifiant par identifiant.
select d.id                     as devis_id,
       d.statut                 as devis_statut_avant,
       d.valide_jusqu_au,
       d.sollicitation_id,
       s.statut                 as sollicitation_statut_avant,
       s.consultation_id,
       c.statut                 as consultation_statut,
       d.incident_id,
       d.organization_id
  from public.incident_devis d
  join public.incident_sollicitations s on s.id = d.sollicitation_id
  join public.incident_consultations c on c.id = s.consultation_id
 where d.statut = 'depose'
   and d.valide_jusqu_au < (now() at time zone 'Europe/Paris')::date
 order by d.organization_id, d.incident_id, d.valide_jusqu_au;

-- 3. Les incidents aujourd'hui sans issue par l'écran : une mise en concurrence ouverte dont TOUTES les
--    sollicitations vivantes portent un devis périmé. La tâche libère leurs places ; ils retrouveront des artisans
--    proposables (hors ceux déjà sollicités sur la même mise en concurrence).
select c.incident_id, c.organization_id, c.id as consultation_id,
       count(*) filter (where s.statut in ('envoyee', 'devis_depose', 'retenue')) as sollicitations_vivantes,
       count(*) filter (where s.statut = 'devis_depose' and d.statut = 'depose'
                          and d.valide_jusqu_au < (now() at time zone 'Europe/Paris')::date) as dont_devis_perimes
  from public.incident_consultations c
  join public.incident_sollicitations s on s.consultation_id = c.id
  left join public.incident_devis d on d.sollicitation_id = s.id
 where c.statut = 'ouverte'
 group by c.incident_id, c.organization_id, c.id
having count(*) filter (where s.statut in ('envoyee', 'devis_depose', 'retenue')) > 0
   and count(*) filter (where s.statut in ('envoyee', 'devis_depose', 'retenue'))
     = count(*) filter (where s.statut = 'devis_depose' and d.statut = 'depose'
                          and d.valide_jusqu_au < (now() at time zone 'Europe/Paris')::date)
 order by c.organization_id, c.incident_id;

-- 4. À titre d'information, ce que la tâche NE traitera PAS : les sollicitations « envoyées » restées sans réponse
--    (aucun devis, aucun refus). Elles gardent leur place dans le plafond de deux ; l'artisan peut toujours répondre.
select count(*)                                                        as sollicitations_sans_reponse,
       count(*) filter (where s.envoyee_le < now() - interval '30 days') as dont_de_plus_de_30_jours,
       min(s.envoyee_le)::date                                         as la_plus_ancienne
  from public.incident_sollicitations s
  join public.incident_consultations c on c.id = s.consultation_id
 where s.statut = 'envoyee' and c.statut = 'ouverte';

-- 5. Garde-fou : la tâche ne doit pas déjà exister (une tâche créée hors migrations ne se voit pas dans le dépôt).
select jobid, jobname, schedule, command
  from cron.job
 where jobname = 'maintenance-artisans' or command ~* 'maintenance_artisans';
