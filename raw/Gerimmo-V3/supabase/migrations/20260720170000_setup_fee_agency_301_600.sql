-- L'offre « Agence 301 à 600 biens » était achetable en ligne avec des frais de mise en
-- place à 0, alors que la page publique annonçait « Mise en place : sur devis ». Une agence
-- de cette taille pouvait donc souscrire seule sans payer aucun frais d'installation.
--
-- Décision 2026-07-20 : frais fixés à 599 €, prolongeant la grille (199 → 399 → 399 → 599).
-- Le palier au-dessus (« plus de 600 biens ») reste sur devis et non achetable en ligne.
--
-- La description mentionnait elle aussi un devis : elle est corrigée pour ne pas contredire
-- le montant désormais facturé.
update public.subscription_plans
set setup_fee_cents = 59900,
    description = 'Accompagnement de mise en place inclus.',
    updated_at = now()
where code = 'agency_301_600';
