-- Retour de 20261028100500_index_redondants.sql (audit final, COD-06). Recrée les deux index retirés avec leur définition
-- d'origine : `appels_loyer_bail_idx` (20260801_s5_appels_loyer.sql:16) et l'index de clé étrangère de publication_id, nommé
-- par la formule de 20260922120000_autonomie_v3.sql (`fk_<table>_<10 premiers caractères du md5 de l'oid de la contrainte>`,
-- propre à chaque base). Retire la version. Aucune donnée touchée ; aucun code à remettre (aucune requête ne nomme un index).
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe, qu'elle
-- ne valide jamais. Se rejoue sans effet.
do $retour_atomique$
declare
  v_index text;
begin
  perform set_config('lock_timeout', '10s', true);
  create index if not exists appels_loyer_bail_idx on public.appels_loyer (bail_id, periode);
  -- relname, et non regclass::text : le nom ne dépend pas du search_path de la session.
  select left('fk_' || t.relname || '_' || substr(md5(c.oid::text), 1, 10), 63) into v_index
  from pg_constraint c join pg_class t on t.oid = c.conrelid
  where c.conrelid = 'public.marketing_campagnes'::regclass and c.contype = 'f'
    and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'publication_id')];
  if v_index is not null then
    execute format('create index if not exists %I on public.marketing_campagnes (publication_id)', v_index);
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261028100500';
  end if;
end;
$retour_atomique$;
