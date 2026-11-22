-- LE DÉCOMPTE DE SORTIE NE RETIENT PLUS DEUX FOIS UN COMPLÉMENT DE CHARGES DÉJÀ PAYÉ (audit palier 1, P0-02, 22/11/2026).
--
-- LE DÉFAUT, REJOUÉ SUR LE BANC LE 22/11. Un complément de charges de 120 € (régularisation, écart négatif) entre dans la
-- dette du bail calculée par `montants_reels_bail` : c'est voulu, il se solde au plus tard à la sortie. Mais quand le
-- locataire le règle par l'échéancier de charges (20261101152354), `agir_echeancier_charges` consigne la somme reçue dans
-- l'échéancier et pose une écriture de recette — jamais une ligne d'`encaissements`. Or `montants_reels_bail` ne retranche
-- que les `encaissements`. Résultat mesuré : après réception confirmée des 120 €, le décompte comptait encore 120,00 €
-- d'impayés, qui auraient été retenus sur le dépôt de garantie. La même somme était donc réclamée deux fois.
--
-- LA RÈGLE. La dette du bail retranche aussi ce que le propriétaire a confirmé avoir reçu par les échéanciers de charges du
-- bail (`echeanciers_charges.echeances[*].recu_cents`). Un échéancier non entamé ne change rien ; un échéancier réglé pour
-- moitié laisse l'autre moitié due.
--
-- CE QUI NE CHANGE PAS. Le calcul des loyers dus, le prorata du mois de sortie, le trop-perçu, le dépôt encaissé, les
-- écritures comptables de l'échéancier, et tout bail sans échéancier de charges : mêmes montants qu'avant.
--
-- LA MÉTHODE. `montants_reels_bail` est modifiée EN RELISANT sa définition en vigueur (ancre exacte, marque d'idempotence),
-- comme les correctifs du 20/11 : une définition inattendue arrête la migration sans rien changer ; un rejeu est sans effet.
-- Aucune donnée lue ni réécrite par la migration.
--
-- RETOUR ARRIÈRE : supabase/retours-arriere/20261122110000_decompte_sortie_echeancier_charges.retour.sql
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.montants_reels_bail(uuid)'::regprocedure) into v_def;
  if position('P0-02 (22/11/2026)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$
      - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0) as solde
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'P0-02 : définition inattendue de montants_reels_bail (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$
      - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0)
      -- P0-02 (22/11/2026) : ce que le propriétaire a confirmé avoir reçu par un échéancier de charges est déjà payé.
      -- Ces sommes vivent dans l'échéancier, pas dans `encaissements` : sans cette ligne, le complément serait
      -- retenu une seconde fois sur le dépôt de garantie.
      - coalesce((select sum((l.value->>'recu_cents')::bigint)
                    from public.echeanciers_charges ec
                    cross join lateral jsonb_array_elements(ec.echeances) l
                   where ec.bail_id = p_bail), 0)::numeric / 100 as solde
$nouveau$);
  execute v_def;
end $correctif$;

-- Droits : inchangés, redits pour qu'un rejeu ne les élargisse jamais (fonction lue par la restitution et par l'écran du bail).
revoke all on function public.montants_reels_bail(uuid) from public, anon;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
