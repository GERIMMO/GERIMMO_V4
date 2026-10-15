-- X11 (FIN-09, décisions du 14 octobre 2026) : la capture fiscale d'un encaissement de loyer ne
-- dépend plus de l'ordre dans lequel le moteur déclenche les lignes d'un INSERT multi-lignes.
--
-- Problème. `capturer_composantes_fiscales()` (déclencheur AFTER INSERT sur `ecritures`, migration
-- 20261012224000) calcule « déjà encaissé avant » en additionnant TOUS les autres encaissements du bail
-- visibles à cet instant. Dans un INSERT à plusieurs lignes sur `encaissements`, toutes les lignes
-- existent déjà quand le déclencheur de la première est exécuté : la première compte la seconde comme
-- « avant », la seconde compte la première, et la ventilation est fausse sans message (deux paiements de
-- 500 € sur un appel de 840 € : 680 € affectés au lieu de 840 €, 320 € non ventilés au lieu de 160 €).
-- Aucun chemin actuel de l'application n'insère plusieurs encaissements d'un même bail dans un seul
-- INSERT ; le défaut attendait un import ou un script de support.
--
-- Correction. « Déjà encaissé avant » = les autres encaissements du bail, SAUF ceux qui attendent leur tour :
-- un autre encaissement ne compte pas s'il n'a pas encore été capté ET s'il n'est pas plus ancien que celui
-- qu'on capte. Ainsi :
--   · une saisie plus ancienne (y compris un encaissement d'avant la fonction, jamais capté) compte toujours ;
--   · une saisie déjà captée compte toujours, même si son horodatage est plus récent (deux transactions
--     concurrentes sur un même bail, que le verrou du bail range dans l'ordre de leur validation) ;
--   · une ligne du MÊME INSERT qui n'est pas encore passée dans le déclencheur ne compte pas : chaque ligne est
--     ventilée comme si elle était saisie seule, dans l'ordre où le moteur la traite, exactement comme
--     deux INSERT successifs. Le total ventilé ne dépend donc plus de l'ordre des lignes ; seule la répartition
--     entre les lignes suit l'ordre de la liste (premier arrivé, premier ventilé).
-- Le critère « déjà capté » se lit dans `fiscal_encaissements_composantes` : il vaut aussi pour un INSERT
-- multi-lignes directement sur `ecritures` (import).
--
-- Ce que cette migration NE fait PAS : aucune ligne existante n'est lue ni réécrite (ni encaissement, ni
-- écriture, ni capture déjà figée). Seule la définition d'une fonction change. Une capture déjà faussée par un
-- ancien INSERT multi-lignes (aucun cas connu) resterait telle quelle : la requête de contrôle en lecture seule
-- du registre (fiche FIN-09) permet de les repérer.
--
-- La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme
-- 20261013120000 : une réécriture à la main écraserait une garde ajoutée par une migration suivante. Elle se
-- rejoue sans effet : si la marque `X11 (FIN-09)` est déjà dans la définition, rien n'est fait. Si la
-- définition en vigueur n'est pas celle attendue (ancre absente ou répétée), la migration s'arrête.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

do $correctif$
declare
  v_def   text;
  v_ancre text;
begin
  if to_regprocedure('public.capturer_composantes_fiscales()') is null then
    raise exception 'Correctif X11 : la fonction public.capturer_composantes_fiscales() est absente (base inattendue)';
  end if;
  v_def := pg_get_functiondef('public.capturer_composantes_fiscales()'::regprocedure);

  -- Rejeu : le correctif est déjà là.
  if position('X11 (FIN-09)' in v_def) > 0 then
    return;
  end if;

  v_ancre := $ancre$select coalesce(sum(montant),0) into avant from public.encaissements
  where bail_id=enc.bail_id and organization_id=enc.organization_id and id<>enc.id;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif X11 : définition inattendue (ancre « déjà encaissé avant » absente ou répétée)';
  end if;

  v_def := replace(v_def, v_ancre, $nouveau$-- X11 (FIN-09) : « avant » ignore les encaissements qui attendent leur tour (même INSERT,
 -- pas encore captés, pas plus anciens que celui-ci) ; voir la migration 20261014420000.
 select coalesce(sum(o.montant),0) into avant from public.encaissements o
  where o.bail_id=enc.bail_id and o.organization_id=enc.organization_id and o.id<>enc.id
    and (o.created_at<enc.created_at
         or exists(select 1 from public.ecritures x
                   join public.fiscal_encaissements_composantes c on c.ecriture_id=x.id
                   where x.encaissement_id=o.id and x.contre_ecriture_de is null));$nouveau$);

  execute v_def;
end $correctif$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
