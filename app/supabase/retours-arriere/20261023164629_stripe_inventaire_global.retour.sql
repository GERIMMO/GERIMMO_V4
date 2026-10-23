-- Revenir au code antérieur d’abord. Aucun abonnement ni événement n’est modifié.
-- Conserver les deux tables et leurs résultats privés pour examen ; pas de perte de preuve.
set lock_timeout = '10s';
drop function if exists public.supervision_stripe_inventaire();
drop function if exists public.stripe_inventaire_page(uuid,text,jsonb,boolean);
drop function if exists public.stripe_inventaire_prendre(uuid);
drop function if exists public.stripe_inventaire_liberer(uuid,boolean);
