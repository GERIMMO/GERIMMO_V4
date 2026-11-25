-- RETOUR ARRIÈRE de 20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature.sql (reprise de la relecture de la
-- fusion du 25/11/2026, constat X-01 : la marque « entrée après la signature » est remise à faux, à la sortie du
-- brouillon, pour les personnes présentes à cette signature).
--
-- Retire les deux déclencheurs (`baux_epoux_pacses_marques_a_la_signature` sur `baux`,
-- `bail_personnes_epoux_pacses_brouillon` sur `bail_personnes`) et leurs fonctions. RÉINTRODUIT le défaut X-01 : une
-- personne ajoutée à un bail actif, remis ensuite au brouillon par « Corriger » puis signé de nouveau avec elle, garde la
-- marque ; sur un bail coché, son départ et l'engagement de son garant reprennent la fin à six mois.
-- Aucune donnée modifiée : les marques remises à faux entre-temps le restent, les départs enregistrés gardent leur date de
-- fin. Droits inchangés (aucun droit n'était ouvert). Une seule instruction : le fichier passe ou s'arrête d'un bloc, avec
-- ou sans `-v ON_ERROR_STOP=1`.
-- ORDRE : à jouer AVANT le retour de 20261125153000 (joué après, il ne trouve rien qui le gêne et retire seulement ses
-- deux déclencheurs). Rejouable.

do $retour_marques_signature$
begin
  if to_regclass('public.baux') is not null then
    drop trigger if exists baux_epoux_pacses_marques_a_la_signature on public.baux;
  end if;
  drop function if exists public.marquer_presents_a_la_signature();
  if to_regclass('public.bail_personnes') is not null then
    drop trigger if exists bail_personnes_epoux_pacses_brouillon on public.bail_personnes;
  end if;
  drop function if exists public.bail_personnes_epoux_pacses_brouillon();
end $retour_marques_signature$;
