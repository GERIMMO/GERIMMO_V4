-- Retour conservateur : aucun abonnement ni tarif sous le minimum ne doit être imposé.
-- Le code antérieur ne doit pas être remis en ligne avec cette grille sans nouvelle validation.
do $$ begin raise exception 'Retour tarifaire à préparer explicitement : ne pas rétablir automatiquement des prix inférieurs à 4,90 par bien et par mois.'; end $$;
