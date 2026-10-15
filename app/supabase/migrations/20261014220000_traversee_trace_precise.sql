-- D08 (audit du 13 octobre 2026, fiches SA-01 et SA-09), option A seule : l'entrée du
-- super-administrateur dans un espace client est tracée plus précisément (action, objet, résultat),
-- SANS changer aucun droit. L'option C (lecture seule en traversée) viendra dans une vague ultérieure.
--
-- Constat : la ligne d'audit `traversee_action` n'avait aucun détail (ni l'action, ni l'objet, ni le
-- résultat) et partait aussi à la simple ouverture d'une page ; chaque navigation écrivait de 1 à 15
-- lignes `traversee_espace` vides (15 en une minute). L'application écrit maintenant les détails (page,
-- objet, décision d'accès : app/src/lib/traversee.ts) et n'écrit `traversee_action` que pour un geste.
--
-- Ce que fait cette migration : `log_sa_access` ne réécrit pas non plus une ligne `traversee_espace`
-- identique dans la minute (même compte, même organisation, mêmes détails — donc même page, même objet,
-- même résultat), comme elle le fait déjà pour les `consultation_*` depuis 20260927201000.
-- `traversee_action` n'est jamais dédoublonné : chaque geste est une ligne. Aucune table, aucun droit,
-- aucune ligne existante n'est modifiée ; les lignes déjà écrites (vides) restent telles quelles.
--
-- La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme le fait
-- 20261013120000 : une réécriture à la main écraserait ce qu'une autre migration y aurait ajouté. Si la
-- définition n'est pas celle attendue, la migration s'arrête. Elle se rejoue sans effet : le bloc cherche
-- la marque de son correctif dans la définition en vigueur et ne fait alors rien.
--
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration. Retour arrière :
-- app/supabase/retours-arriere/20261014220000_traversee_trace_precise.retour.sql.

do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.log_sa_access(uuid,text,jsonb)'::regprocedure) into v_def;
  if position('Audit du 14/10 (SA-01)' in v_def) > 0 then return; end if;

  if (length(v_def) - length(replace(v_def, $ancre$if sa_action like 'consultation\_%' and exists ($ancre$, '')))
     <> length($ancre$if sa_action like 'consultation\_%' and exists ($ancre$) then
    raise exception 'Correctif SA-01 : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$if sa_action like 'consultation\_%' and exists ($ancre$, $nouveau$-- Audit du 14/10 (SA-01) : décision D08. Une page de l'espace client rendue plusieurs fois dans la
  -- minute (préchargements, mises en page et pages rendues par des requêtes distinctes) n'écrit qu'une
  -- ligne « traversee_espace » : même compte, même organisation, mêmes détails. « traversee_action »
  -- n'est jamais dédoublonné : chaque geste lancé depuis un espace client est une ligne.
  if (sa_action like 'consultation\_%' or sa_action = 'traversee_espace') and exists ($nouveau$);

  execute v_def;
end $correctif$;

select public.fermer_fonctions_a_anon();
