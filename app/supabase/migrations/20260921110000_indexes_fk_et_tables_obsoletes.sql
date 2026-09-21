-- Préparation au passage de quelques dizaines à plusieurs centaines de lots.
--
-- 1. Retire les cinq tables de préfiguration encore présentes. La sixième,
--    demandes_pieces, a déjà été supprimée par la migration du 6 septembre.
--    Les tables de reprise comptable ne sont pas concernées : elles alimentent
--    aujourd'hui le parcours natif de reprise de portefeuille.
-- 2. Ajoute un index couvrant chaque clé étrangère publique encore dépourvue
--    d'index. Les colonnes gardent l'ordre de la contrainte afin de servir aussi
--    les jointures usuelles et les suppressions/mises à jour de lignes parentes.

drop table if exists public.signature_signataires;
drop table if exists public.signature_circuits;
drop table if exists public.artisan_candidatures;
drop table if exists public.invitations;
drop table if exists public.controles_solvabilite;

-- Les trois chemins les plus sollicités reçoivent des noms explicites. Les
-- index composites couvrent également la clé étrangère simple placée en tête.
create index if not exists baux_lot_organisation_fk_idx
  on public.baux (lot_id, organization_id);

create index if not exists ecritures_bail_organisation_fk_idx
  on public.ecritures (bail_id, organization_id);

create index if not exists incidents_lot_organisation_fk_idx
  on public.incidents (lot_id, organization_id);

do $$
declare
  v_fk record;
  v_colonnes text;
  v_index text;
begin
  loop
    -- Une contrainte à la fois : après chaque création, le catalogue est relu.
    -- Un index composite nouvellement créé peut ainsi couvrir une autre clé
    -- étrangère simple sans créer un doublon inutile.
    select
      c.oid,
      c.conname,
      n.nspname,
      t.relname,
      c.conrelid,
      c.conkey
    into v_fk
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1
        from pg_catalog.pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indisready
          and c.conkey::smallint[]
              <@ string_to_array(i.indkey::text, ' ')::smallint[]
      )
    order by cardinality(c.conkey) desc, c.oid
    limit 1;

    exit when not found;

    select string_agg(format('%I', a.attname), ', ' order by k.ordre)
      into v_colonnes
    from unnest(v_fk.conkey) with ordinality as k(attnum, ordre)
    join pg_catalog.pg_attribute a
      on a.attrelid = v_fk.conrelid
     and a.attnum = k.attnum;

    -- Le suffixe rend le nom stable et unique même après la troncature à
    -- 63 caractères imposée par PostgreSQL.
    v_index := left('idx_fk_' || v_fk.relname || '_' || v_fk.conname, 50)
      || '_' || substr(md5(v_fk.oid::text), 1, 10);

    execute format(
      'create index %I on %I.%I (%s)',
      v_index,
      v_fk.nspname,
      v_fk.relname,
      v_colonnes
    );
  end loop;
end
$$;
