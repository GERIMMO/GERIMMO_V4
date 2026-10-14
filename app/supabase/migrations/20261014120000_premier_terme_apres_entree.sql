-- Décision D01 du 14 octobre 2026 (fiche PROP-14), option A : le premier terme d'un
-- bail qui commence en cours de mois n'est jamais exigible avant la date d'entrée.
--
-- Avant : generer_appels_loyer_interne posait date_echeance = début de mois + jour
-- d'échéance − 1, même quand le bail entrait le 16. Le prorata était juste, mais le
-- locataire apparaissait « Impayé » quinze jours avant d'avoir emménagé, et la tâche
-- quotidienne de relances pouvait le relancer.
-- Maintenant : date_echeance = la plus tardive de l'échéance calculée et de la date
-- d'entrée. Pour tous les termes suivants l'échéance calculée est déjà postérieure à
-- l'entrée : le résultat est identique à celui d'avant.
--
-- Option A seulement : cette migration NE TOUCHE AUCUN APPEL EXISTANT (la fonction ne
-- crée que les périodes qui manquent). L'option B (corriger les appels déjà générés)
-- reste différée, après un relevé de production en lecture seule.
--
-- La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef),
-- comme 20261013120000 : une définition recopiée à la main écraserait ce que d'autres
-- migrations y auraient ajouté. Si la définition n'est pas celle attendue, la
-- migration s'arrête. Elle se rejoue sans effet : la marque du correctif, présente
-- dans la définition, dit que c'est fait.
-- Retour arrière : supabase/retours-arriere/20261014120000_premier_terme_apres_entree.retour.sql

do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure) into v_def;
  if position('Décision D01 du 14/10 (PROP-14)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$        ((case when v.paiement_echeance = 'echu' then v_mois + interval '1 month' else v_mois end)::date
          + (coalesce(v.jour_echeance, 1) - 1) * interval '1 day')::date,$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D01 : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$        -- Décision D01 du 14/10 (PROP-14), option A : aucun terme n'est exigible avant
        -- l'entrée du locataire. Seul le premier terme d'un bail qui entre en cours de
        -- mois est concerné : pour les suivants, l'échéance calculée est déjà plus tardive.
        greatest(
          ((case when v.paiement_echeance = 'echu' then v_mois + interval '1 month' else v_mois end)::date
            + (coalesce(v.jour_echeance, 1) - 1) * interval '1 day')::date,
          v.date_debut),$nouveau$);
  execute v_def;
end $correctif$;

-- Droits : inchangés. C'est une fonction INTERNE (20260911200000 l'a retirée aux comptes :
-- elle n'a aucun contrôle d'appartenance) ; seuls le cycle mensuel et l'enveloppe publique
-- generer_appels_loyer, qui contrôle l'accès, l'appellent. `create or replace` conserve les
-- droits en vigueur ; on les redit ici pour qu'un rejeu ne les élargisse jamais.
revoke all on function public.generer_appels_loyer_interne(uuid) from public, anon, authenticated;
grant execute on function public.generer_appels_loyer_interne(uuid) to service_role;

select public.fermer_fonctions_a_anon();
