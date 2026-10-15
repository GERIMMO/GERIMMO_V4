-- Décision X09 du 14 octobre 2026 (fiche FIN-03), constat de relecture du 15/10 : le contrôle de la reprise de soldes dit ce que la bascule fera.
--
-- Avant : reprendre_soldes lisait le montant d'une ligne en numeric sans le ramener au centime. Une ligne « 123,456 » (trésorerie annoncée
-- 123,46) passait le contrôle en « Prêt à reprendre. » (l'écart de 0,004 € s'arrondit à zéro), puis la bascule échouait sur la contrainte de
-- centime des encaissements (20261014412000), avec le message générique « Gerimmo n'a pas pu terminer cette action » — au moment d'une reprise.
-- La défaillance était atomique (aucune donnée écrite), mais le contrôle ne tenait plus sa promesse. Pour les autres types de ligne, les
-- montants à trois décimales étaient arrondis EN SILENCE à l'écriture (colonnes numeric(12,2)) : trois fonds de 10,004 € contre 30,01 €
-- annoncés donnaient trois lignes de 10,00 € écrites, 30,00 € au compte.
-- Maintenant : une ligne dont le montant n'est pas égal à son arrondi au centime est une ERREUR dès le contrôle, quel que soit son type :
-- « Montant au centime près : « 123,456 » a plus de deux décimales. Corrigez-le dans le fichier. » La bascule la refuse alors par le motif
-- habituel (« ligne(s) en erreur »). Un montant qui n'est pas un nombre (NaN, Infinity, -Infinity) est « illisible », comme un montant absent.
-- Ce que le contrôle accepte, la bascule l'écrit tel quel.
--
-- La règle porte sur la valeur : « 12,500 » vaut 12,50 et passe, comme la contrainte de centime l'admet. Rien d'autre ne change : mêmes
-- rattachements, mêmes contrôles par type, mêmes écritures, même écart zéro.
--
-- Cette migration NE TOUCHE AUCUNE DONNÉE : une fonction de reprise change de contrôle, rien d'autre ; aucune reprise existante n'est relue.
-- La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme 20261013120000 et 20261014120000 : une définition
-- recopiée à la main écraserait ce que d'autres migrations y auraient ajouté. Si la définition n'est pas celle attendue, la migration s'arrête.
-- Elle se rejoue sans effet : la marque du correctif, présente dans la définition, dit que c'est fait.
-- Retour arrière : supabase/retours-arriere/20261014415000_reprise_soldes_au_centime.retour.sql

do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.reprendre_soldes(uuid,uuid,jsonb,boolean)'::regprocedure) into v_def;
  if position('Décision X09 du 15/10 (FIN-03, reprise de soldes)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$elsif v_montant is null then$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif X09 (reprise de soldes) : définition inattendue (ancre absente ou répétée)';
  end if;
  -- La branche du centime passe AVANT celle du montant illisible : un montant absent donne NULL à la comparaison et n'y entre pas ;
  -- NaN et l'infini sont égaux à leur arrondi, ils n'y entrent pas non plus et tombent dans la branche suivante.
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision X09 du 15/10 (FIN-03, reprise de soldes) : un montant se reprend au centime près, comme un encaissement
    -- (encaissements_montant_centime_check) ; sinon le contrôle dirait « Prêt à reprendre » et la bascule échouerait.
    elsif v_montant <> round(v_montant, 2) then
      v_statut := 'erreur';
      v_msg := format('Montant au centime près : « %s » a plus de deux décimales. Corrigez-le dans le fichier.',
                      btrim(coalesce(v_ligne->>'montant', '')));
    elsif v_montant is null or v_montant in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then$nouveau$);

  execute v_def;
end $correctif$;

-- Droits : inchangés (authenticated et service_role exécutent ; anon et PUBLIC non). `create or replace` conserve les droits en vigueur ;
-- on les redit ici pour qu'un rejeu ne les élargisse jamais.
revoke all on function public.reprendre_soldes(uuid,uuid,jsonb,boolean) from public, anon;
grant execute on function public.reprendre_soldes(uuid,uuid,jsonb,boolean) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
