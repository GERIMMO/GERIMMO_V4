-- Décision X13 du 14 octobre 2026 (fiche FIN-13), élargissement constaté le 15/10 : un loyer est « échu » au jour de Paris.
--
-- Avant : la fonction qui calcule l'état d'un appel de loyer (etat_loyers_bail_brut ; ce n'est pas une vue SQL mais une fonction,
-- et c'est la seule définition en vigueur : 20260910140000) comparait date_echeance à CURRENT_DATE, le jour du fuseau de la session
-- (UTC chez Supabase), alors que l'application raisonne au jour de Paris (aujourdhuiParis). De minuit à 2 h à Paris, un loyer échu la
-- veille s'affichait « attendu » au lieu d'« impayé » ; le test e2e encaissement-reste.spec.ts échouait de 22 h à 24 h UTC pour cette raison.
-- Maintenant : date_echeance < (now() at time zone 'Europe/Paris')::date. Mêmes colonnes, mêmes droits (fonction interne :
-- fermée aux comptes, ouverte à service_role).
--
-- Deux autres fonctions additionnent « ce qui reste dû sur les termes échus » avec la même comparaison sur les lignes de la
-- fonction ci-dessus : fiche_lot (fenêtre du lot) et contrats_du_lot (colocation). Elles suivent, sans quoi la fiche du lot et la
-- liste des loyers diraient deux choses différentes entre minuit et 2 h à Paris.
--
-- Les autres usages de current_date dans la base ne sont pas touchés : l'inventaire est dans le compte rendu du lot (tâches
-- planifiées entre 3 h et 9 h UTC, où le jour UTC et le jour de Paris sont le même ; dates de fin de validité ; essais ; etc.).
--
-- Cette migration NE RÉÉCRIT AUCUNE DONNÉE : trois fonctions de lecture changent de comparaison, rien d'autre. Chaque fonction est
-- modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme 20261013120000 et 20261014120000 : une définition
-- recopiée à la main écraserait ce que d'autres migrations y auraient ajouté (fiche_lot porte les gardes de portefeuille). Si une
-- définition n'est pas celle attendue, la migration s'arrête. Elle se rejoue sans effet : la marque du correctif, présente dans la
-- définition, dit que c'est fait.
-- Retour arrière : supabase/retours-arriere/20261014411000_loyer_echu_jour_de_paris.retour.sql

-- 1/3 : l'état d'un appel de loyer
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.etat_loyers_bail_brut(uuid)'::regprocedure) into v_def;
  if position('Décision X13 du 15/10 (FIN-13)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$when a.date_echeance < current_date then 'impaye'$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif X13 (état des loyers) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision X13 du 15/10 (FIN-13) : « échu » se lit au jour de Paris, pas au jour du fuseau de la session
      -- (UTC chez Supabase) : de minuit à 2 h à Paris, un loyer échu la veille s'affichait « attendu ».
      when a.date_echeance < (now() at time zone 'Europe/Paris')::date then 'impaye'$nouveau$);
  if position('current_date' in v_def) > 0 then
    raise exception 'Correctif X13 (état des loyers) : un jour de session subsiste dans la définition';
  end if;
  execute v_def;
end $correctif$;

-- 2/3 : « ce qui reste dû sur les termes échus » de la fenêtre du lot
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.fiche_lot(uuid)'::regprocedure) into v_def;
  if position('Décision X13 du 15/10 (FIN-13)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$x.date_echeance < current_date and x.montant_du > x.montant_couvert$ancre$;
  -- Deux occurrences exactement : le montant échu et le nombre de termes échus.
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> 2 * length(v_ancre) then
    raise exception 'Correctif X13 (fiche du lot) : définition inattendue (ancre absente ou en nombre inattendu)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$x.date_echeance < (now() at time zone 'Europe/Paris')::date /* Décision X13 du 15/10 (FIN-13) : terme échu au jour de Paris */ and x.montant_du > x.montant_couvert$nouveau$);
  if position('current_date' in v_def) > 0 then
    raise exception 'Correctif X13 (fiche du lot) : un jour de session subsiste dans la définition';
  end if;
  execute v_def;
end $correctif$;

-- 3/3 : « ce qui reste dû sur les termes échus » de chaque contrat de colocation
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.contrats_du_lot(uuid)'::regprocedure) into v_def;
  if position('Décision X13 du 15/10 (FIN-13)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$x.date_echeance < current_date and x.montant_du > x.montant_couvert$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> 2 * length(v_ancre) then
    raise exception 'Correctif X13 (contrats du lot) : définition inattendue (ancre absente ou en nombre inattendu)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$x.date_echeance < (now() at time zone 'Europe/Paris')::date /* Décision X13 du 15/10 (FIN-13) : terme échu au jour de Paris */ and x.montant_du > x.montant_couvert$nouveau$);
  if position('current_date' in v_def) > 0 then
    raise exception 'Correctif X13 (contrats du lot) : un jour de session subsiste dans la définition';
  end if;
  execute v_def;
end $correctif$;

-- Droits : inchangés. `create or replace` conserve les droits en vigueur ; on les redit ici pour qu'un rejeu ne les élargisse jamais.
-- etat_loyers_bail_brut est INTERNE (20260910140000 l'a retirée aux comptes : elle n'a aucun contrôle d'appartenance) ;
-- fiche_lot et contrats_du_lot contrôlent l'appartenance et le portefeuille eux-mêmes.
revoke all on function public.etat_loyers_bail_brut(uuid) from public, anon, authenticated;
grant execute on function public.etat_loyers_bail_brut(uuid) to service_role;
revoke all on function public.fiche_lot(uuid) from public, anon;
grant execute on function public.fiche_lot(uuid) to authenticated, service_role;
revoke all on function public.contrats_du_lot(uuid) from public, anon;
grant execute on function public.contrats_du_lot(uuid) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
