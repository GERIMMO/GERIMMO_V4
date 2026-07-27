-- Les frais de mise en place et la gestion annuelle étaient AFFICHÉS au client (page /tarifs
-- et espace abonnement) mais jamais facturés : le paiement Stripe ne contenait qu'une seule
-- ligne, l'abonnement mensuel. Sur une agence 51-150 biens, cela représentait 399 € perdus à
-- la souscription puis 199 € chaque année.
--
-- Chaque offre a donc désormais trois tarifs Stripe :
--   - stripe_price_id        : l'abonnement mensuel (existant) ;
--   - stripe_setup_price_id  : les frais de mise en place, tarif « one-time », ajoutés à la
--                              première facture du même paiement ;
--   - stripe_annual_price_id : la gestion annuelle, tarif récurrent annuel.
--
-- La gestion annuelle fait l'objet d'un ABONNEMENT SÉPARÉ : Stripe interdit de mélanger
-- plusieurs rythmes de facturation (mensuel + annuel) au sein d'un même abonnement.
alter table public.subscription_plans
  add column if not exists stripe_setup_price_id text,
  add column if not exists stripe_annual_price_id text;

comment on column public.subscription_plans.stripe_setup_price_id is
  'Tarif Stripe « one-time » des frais de mise en place (setup_fee_cents). Ajouté à la première facture.';
comment on column public.subscription_plans.stripe_annual_price_id is
  'Tarif Stripe récurrent annuel de la gestion (annual_fee_cents). Abonnement distinct du mensuel.';
