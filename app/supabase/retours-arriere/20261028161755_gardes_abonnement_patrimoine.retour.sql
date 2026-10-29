-- Pas de désactivation : retirer ces gardes réouvrirait les écritures des espaces
-- suspendus. Les déclencheurs sont supprimés avec leur table lors du retour de
-- chaque module. Rejouer la pose maintient aussi les gardes des tables restantes.
select public.poser_gardes_abonnement();
