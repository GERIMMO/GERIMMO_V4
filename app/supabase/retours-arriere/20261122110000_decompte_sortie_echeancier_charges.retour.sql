-- RETOUR ARRIÈRE de 20261122110000 (le décompte de sortie retranche ce qui a été reçu par un échéancier de charges).
--
-- Rend à `montants_reels_bail` sa forme d'avant (remplacement exact inverse). ATTENTION : après ce retour, un complément
-- de charges réglé par échéancier est de nouveau compté comme impayé au décompte de sortie. À ne jouer que pour revenir
-- à une version du code antérieure, et en vérifiant d'abord qu'aucune restitution n'est en préparation sur un bail qui
-- porte un échéancier de charges entamé.
--
-- Atomique et rejouable : une définition déjà rétablie est laissée ; une forme inattendue arrête tout sans rien changer.
do $retour$
declare
  v_def text;
  v_apres text;
  v_avant text;
  n_apres integer;
  n_avant integer;
begin
  v_def := pg_get_functiondef('public.montants_reels_bail(uuid)'::regprocedure);
  v_apres := $sql$
      - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0)
      -- P0-02 (22/11/2026) : ce que le propriétaire a confirmé avoir reçu par un échéancier de charges est déjà payé.
      -- Ces sommes vivent dans l'échéancier, pas dans `encaissements` : sans cette ligne, le complément serait
      -- retenu une seconde fois sur le dépôt de garantie.
      - coalesce((select sum((l.value->>'recu_cents')::bigint)
                    from public.echeanciers_charges ec
                    cross join lateral jsonb_array_elements(ec.echeances) l
                   where ec.bail_id = p_bail), 0)::numeric / 100 as solde
$sql$;
  v_avant := $sql$
      - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0) as solde
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  n_avant := (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant);
  if n_apres = 1 and n_avant = 0 then
    execute replace(v_def, v_apres, v_avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : montants_reels_bail a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;
  revoke all on function public.montants_reels_bail(uuid) from public, anon;
  delete from supabase_migrations.schema_migrations where version = '20261122110000';
end $retour$;
notify pgrst, 'reload schema';
