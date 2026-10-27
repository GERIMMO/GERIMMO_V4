-- Audit final du 27/10 (COD-06) : deux index strictement redondants avec un index unique (mêmes colonnes, même ordre).
--
-- `appels_loyer_bail_idx` (bail_id, periode), posé par 20260801_s5_appels_loyer.sql, doublonne la clé unique
-- `appels_loyer_bail_id_periode_key` sur les mêmes colonnes. L'index de clé étrangère `fk_marketing_campagnes_<empreinte>`
-- (publication_id), posé par la boucle de 20260922120000_autonomie_v3.sql, doublonne l'index unique
-- `marketing_campagnes_publication_unique` recréé le 25/09. Chacun coûte une écriture par ligne sans rien apporter en
-- lecture : le planificateur dispose déjà de l'index unique sur les mêmes colonnes.
-- L'empreinte du second est `substr(md5(oid de la contrainte), 1, 10)` : elle diffère d'une base à l'autre (production,
-- CI, banc). On le retrouve donc par sa définition — index non unique de marketing_campagnes, nommé `fk_…`, sur exactement
-- les colonnes de l'index unique — et jamais par un nom écrit en dur.
-- `points_du_matin_jour_idx` (jour desc, equipe) n'est pas touché : son ordre diffère de la clé unique (jour, equipe) ;
-- un btree se parcourt dans les deux sens, le gain serait nul et le choix est laissé.
-- Aucune donnée n'est réécrite. Rejouable : `drop index if exists`, boucle vide au second passage.
-- Retour arrière : supabase/retours-arriere/20261028100500_index_redondants.retour.sql (recrée les deux index).
drop index if exists public.appels_loyer_bail_idx;

do $$
declare
  v_index text;
begin
  for v_index in
    select i.indexrelid::regclass::text
    from pg_index i
    join pg_index u on u.indrelid = i.indrelid and u.indisunique and u.indexrelid <> i.indexrelid
      and u.indkey::text = i.indkey::text and u.indclass::text = i.indclass::text
      and u.indpred is null and i.indpred is null and u.indexprs is null and i.indexprs is null
    where i.indrelid = 'public.marketing_campagnes'::regclass and not i.indisunique
      and u.indexrelid::regclass::text = 'marketing_campagnes_publication_unique'
      and i.indexrelid::regclass::text like 'fk\_marketing\_campagnes\_%'
  loop
    execute format('drop index if exists public.%I', v_index);
  end loop;
end $$;

select public.fermer_fonctions_a_anon();
