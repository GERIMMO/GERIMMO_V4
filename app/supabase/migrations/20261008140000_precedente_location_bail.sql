ALTER TABLE public.baux
  ADD COLUMN IF NOT EXISTS precedente_location text CHECK (precedente_location IN ('premiere', 'ancienne', 'recente')),
  ADD COLUMN IF NOT EXISTS precedent_loyer_revise boolean;
COMMENT ON COLUMN public.baux.precedente_location IS 'premiere: jamais loué; ancienne: départ depuis au moins 18 mois; recente: départ depuis moins de 18 mois';
