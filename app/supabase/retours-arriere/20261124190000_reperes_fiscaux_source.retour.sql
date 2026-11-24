-- RETOUR ARRIÈRE de 20261124190000_reperes_fiscaux_source.sql (décision du 24/11/2026, Q38 : la source du contrôle
-- des repères fiscaux).
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente : l'ancien code lit `reperes_fiscaux()` et
-- règle par `regler_reperes_fiscaux(plafond, abattement)`, que cette migration n'a pas touchés ; le code nouveau, sans
-- ces deux fonctions-ci, affiche la phrase d'aide sans aucune valeur (il ne tombe pas en panne).
--
-- Supprime les deux fonctions du lot et la colonne `source`. La source enregistrée disparaît avec la colonne ; le
-- journal de la supervision (action « reperes_fiscaux ») la garde dans chaque geste. Le plafond, l'abattement et la
-- date de vérification ne sont pas touchés.
--
-- Se joue APRÈS les retours de 20261124230000 puis de 20261124210000 (seconde reprise du lot D3 : précision ajoutée
-- ici, le LISEZ-MOI le disait seul). Ces deux migrations font lire et écrire la colonne `source` par l'ancien réglage
-- `regler_reperes_fiscaux(plafond, abattement)` : joué avant leurs retours, ce retour-ci laisserait un ancien réglage
-- qui s'arrête sur une colonne absente (il suffit alors de jouer le retour de 20261124210000 pour le rétablir).
-- Se joue AVANT le retour de 20261123090000 (qui supprime la table). Rejouable.
do $retour$
begin
  drop function if exists public.regler_reperes_fiscaux_avec_source(integer, integer, text);
  drop function if exists public.reperes_fiscaux_avec_source();
  if to_regclass('public.reperes_fiscaux_reglage') is not null then
    alter table public.reperes_fiscaux_reglage drop constraint if exists reperes_fiscaux_source_lisible;
    alter table public.reperes_fiscaux_reglage drop column if exists source;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261124190000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
