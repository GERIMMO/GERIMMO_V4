-- Décision X14 du 14 octobre 2026 (fiche PR178-B-03), recommandation suivie : un plancher et un message clair pour un encaissement
-- trop petit pour porter des honoraires.
--
-- Avant : sur un bail géré sous mandat (honoraires > 0), un encaissement de 0,01 € était accepté par le contrôle de l'action
-- (« au centime près »), puis refusé par la base : le déclencheur ecrire_encaissement arrondit les honoraires à 0,00 € et leur
-- écriture viole ecritures_montant_check (montant > 0). L'utilisateur lisait « Gerimmo n'a pas pu terminer cette action. Réessayez
-- dans un instant… », alors que réessayer ne changerait rien. Aucun encaissement n'était créé.
-- Maintenant : avant d'écrire les honoraires, ecrire_encaissement vérifie qu'ils ne seront pas arrondis à 0,00 €. Sinon l'encaissement
-- est refusé, sous la même annulation qu'avant (ni encaissement, ni pièce de loyer, ni pièce d'honoraires), avec un message qui dit
-- le montant minimal pour CE mandat : le plus petit montant au centime dont les honoraires arrondis ne sont pas nuls, soit
-- ceil(50 / taux) centimes (7 % : 0,08 € ; 10 % : 0,05 € ; 1 % : 0,50 €).
--
-- Le plancher dépend du taux d'honoraires du mandat à la date du paiement : la base seule le connaît, c'est pourquoi la règle vit ici
-- et non dans la lecture du montant de l'application (lireMontant refuse déjà zéro, le négatif et les fractions de centime).
-- Sans mandat, ou à 0 %, il n'y a pas d'honoraires et donc pas de plancher : rien ne change.
--
-- Cette migration NE TOUCHE AUCUNE DONNÉE : un déclencheur de plus ne refuse que les encaissements à venir qui auraient échoué de toute façon.
-- La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme 20261013120000 et 20261014120000 :
-- une définition recopiée à la main écraserait ce que d'autres migrations y auraient ajouté. Si la définition n'est pas celle
-- attendue, la migration s'arrête. Elle se rejoue sans effet : la marque du correctif, présente dans la définition, dit que c'est fait.
-- Retour arrière : supabase/retours-arriere/20261014413000_encaissement_plancher_honoraires.retour.sql

do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.ecrire_encaissement()'::regprocedure) into v_def;
  if position('Décision X14 du 15/10 (PR178-B-03)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$if v_taux is not null and v_taux > 0 then$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif X14 (plancher d''honoraires) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision X14 du 15/10 (PR178-B-03) : des honoraires arrondis à 0,00 € violeraient ecritures_montant_check et l'utilisateur
  -- lirait un message générique. L'encaissement est refusé ici, avec le montant minimal : le plus petit montant au centime dont les
  -- honoraires arrondis ne sont pas nuls (ceil(50 / taux) centimes). Rien n'est écrit : l'exception annule l'insertion entière.
  if v_taux is not null and v_taux > 0 and round(new.montant * v_taux / 100, 2) < 0.01 then
    raise exception 'Ce montant est trop petit pour être encaissé sur ce bail : les honoraires de gestion qui s’y rattachent seraient arrondis à 0,00 €. Saisissez au moins % €.',
      replace(to_char(ceil(50 / v_taux) / 100, 'FM999999990.00'), '.', ',');
  end if;
  if v_taux is not null and v_taux > 0 then$nouveau$);

  execute v_def;
end $correctif$;

-- Droits : inchangés. C'est une fonction de déclencheur, qu'aucun compte n'appelle (elle n'a de droit que pour son propriétaire) :
-- `create or replace` conserve les droits en vigueur ; on les redit ici pour qu'un rejeu ne les élargisse jamais.
revoke all on function public.ecrire_encaissement() from public, anon, authenticated;

select public.fermer_fonctions_a_anon();
