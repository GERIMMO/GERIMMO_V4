-- PURGER CE QU'UN PASSAGE DE RECETTE A CRÉÉ.
--
-- CE QUE FAIT CE SCRIPT. Pour le suffixe donné, il supprime :
--   · les organisations dont le nom porte le suffixe (l'agence et le parc de
--     `preparer-comptes.sql`) et TOUTES leurs données : biens, lots, fiches
--     personnes, alertes, journal d'audit, événements d'abonnement… ;
--   · les comptes `delivered+…<suffixe>…@resend.dev` (auth.users, et en
--     cascade `accounts`, adhésions, acceptations des conditions, identités,
--     sessions) et ce qui les cite (retours, journal d'audit…) ;
--   · les fichiers Storage rangés sous ces organisations (chemin commençant
--     par leur UUID) — voir « Fichiers » plus bas.
--
-- LANCEMENT (psql, en tant que `postgres`) :
--   psql "$URL_BASE" -v ON_ERROR_STOP=1 -v suffixe=r20260927a \
--     -f e2e/recette-production/purger.sql
-- Ajouter -v simulation=1 pour tout faire SANS valider (la transaction est
-- annulée à la fin) : le bilan dit ce qui aurait été supprimé.
--
-- GARDE-FOUS. Le suffixe doit faire au moins 6 caractères. Le script REFUSE
-- de toucher une organisation où siège un compte étranger à la recette, ou un
-- compte de recette membre d'une organisation étrangère : dans les deux cas,
-- la purge emporterait des données réelles. Tout se passe dans une seule
-- transaction : si une table refuse, rien n'est supprimé.
--
-- COMMENT IL SUPPRIME, ET POURQUOI PAS UNE LISTE DE TABLES. Le schéma compte
-- plus de cent tables et en gagne chaque semaine : une liste écrite à la main
-- serait fausse au premier ajout. Le script lit le catalogue — toute table
-- publique qui porte `organization_id`, toute clé étrangère vers
-- `organizations`, `accounts` ou `auth.users`, et les tables filles de
-- celles-ci — et supprime par passes successives jusqu'à ce que plus rien ne
-- reste. Une suppression refusée par une clé étrangère est simplement rejouée
-- à la passe suivante, une fois ses filles parties.
--
-- LES VERROUS DU SCHÉMA, UN PAR UN.
--   · Abonnement fermé (`refuser_ecriture_si_fermee`) : levé par le réglage
--     local `gerimmo.systeme = on`, celui des tâches de rétention et de purge.
--   · Acceptations des conditions (ajout seul) : leur déclencheur laisse
--     passer la cascade de suppression du compte (droit à l'effacement) — on
--     ne les supprime donc jamais directement, seulement via auth.users.
--   · Journal d'audit : pas de déclencheur de suppression ; la RLS ne
--     concerne pas `postgres`. Supprimé comme les autres tables.
--   · Encaissements (motif obligatoire) : exigé seulement d'une session
--     applicative (`auth.uid()` non nul) — pas ici. Le déclencheur écrit une
--     ligne d'audit par suppression, purgée à la passe suivante.
--   · État des lieux signé, appel de charges figé (lignes « figées ») : ces
--     déclencheurs REFUSENT la suppression des lignes tant que l'en-tête est
--     signé/figé. La recette n'en crée pas. Si un passage en a laissé, la
--     purge s'arrête en nommant la table ; la faire alors, en connaissance de
--     cause, dans la même session, en neutralisant les déclencheurs
--     utilisateur le temps de la transaction :
--         begin;
--         set local session_replication_role = replica;  -- déclencheurs ET
--         -- contrôles de clés étrangères suspendus : seul ce script
--         -- s'exécute, et il supprime tout ce qui pointe vers ces lignes.
--         \ir purger.sql  -- (ou coller le bloc DO ci-dessous)
--         commit;
--     Sous Supabase, `postgres` a le droit de poser ce réglage.
--
-- FICHIERS. Le script supprime les lignes de `storage.objects` sous ces
-- organisations. Sur Supabase, cela n'efface PAS l'objet dans le stockage
-- sous-jacent, et une protection récente refuse même la suppression directe
-- (« use the Storage API ») : dans ce cas le script ne s'arrête pas, il LISTE
-- les chemins restants ; les supprimer depuis le tableau de bord Supabase
-- (Storage → bucket → dossier <UUID de l'organisation>) ou par l'API
-- (`supabase.storage.from(bucket).remove([...chemins])` avec la clé
-- service_role). La recette actuelle ne dépose aucun fichier.
--
-- CE QUI RESTE, ASSUMÉ. `tech_log` (journal technique, sans clé vers les
-- organisations) peut garder des lignes citant un UUID de la recette —
-- erreurs d'écran, tâches de nuit. Elles ne contiennent pas de données
-- personnelles et suivent leur propre rétention.

\set ON_ERROR_STOP on

\if :{?suffixe}
\else
  \echo 'Paramètre manquant : -v suffixe=… (celui du passage à purger)'
  \quit
\endif
\if :{?simulation}
\else
  \set simulation 0
\endif

begin;

select set_config('recette.suffixe', :'suffixe', true) \gset ignore_

do $purge$
declare
  v_suffixe text := current_setting('recette.suffixe');
  v_motif_email text;
  v_orgs uuid[];
  v_uids uuid[];
  v_intrus text;
  v_passe int := 0;
  v_progres boolean;
  v_n bigint;
  v_total bigint := 0;
  v_erreurs jsonb;
  v_reste_orgs int;
  v_reste_comptes int;
  r record;
begin
  if v_suffixe !~ '^[a-z0-9][a-z0-9-]{5,39}$' then
    raise exception 'Suffixe refusé (%) : 6 à 40 caractères, minuscules, chiffres, tirets', v_suffixe;
  end if;
  v_motif_email := 'delivered+%' || v_suffixe || '%@resend.dev';

  select coalesce(array_agg(o.id), '{}') into v_orgs
    from public.organizations o where o.name like '%' || v_suffixe || '%';
  select coalesce(array_agg(u.id), '{}') into v_uids
    from auth.users u where lower(u.email) like v_motif_email;

  raise notice 'Suffixe « % » : % organisation(s), % compte(s)',
    v_suffixe, coalesce(array_length(v_orgs, 1), 0), coalesce(array_length(v_uids, 1), 0);

  -- Garde-fou 1 : un compte étranger à la recette siège dans une de ces
  -- organisations → ce n'est pas (seulement) une organisation de recette.
  select string_agg(distinct a.email, ', ') into v_intrus
    from public.memberships m join public.accounts a on a.id = m.account_id
   where m.organization_id = any(v_orgs) and not (m.account_id = any(v_uids));
  if v_intrus is not null then
    raise exception 'Purge refusée : des comptes hors recette sont membres de ces organisations (%)', v_intrus;
  end if;
  -- Garde-fou 2 : un compte de recette est membre d'une organisation qui ne
  -- porte pas le suffixe → le supprimer toucherait cette organisation.
  select string_agg(distinct o.name, ', ') into v_intrus
    from public.memberships m join public.organizations o on o.id = m.organization_id
   where m.account_id = any(v_uids) and not (m.organization_id = any(v_orgs));
  if v_intrus is not null then
    raise exception 'Purge refusée : des comptes de recette sont membres d''organisations hors recette (%)', v_intrus;
  end if;

  if coalesce(array_length(v_orgs, 1), 0) = 0 and coalesce(array_length(v_uids, 1), 0) = 0 then
    raise notice 'Rien à purger.';
    return;
  end if;

  -- Verrou « abonnement fermé » levé pour cette transaction seulement.
  perform set_config('gerimmo.systeme', 'on', true);

  -- Fichiers : les lignes de storage.objects sous ces organisations.
  if to_regclass('storage.objects') is not null then
    for r in
      select o.bucket_id, o.name from storage.objects o
       where split_part(o.name, '/', 1) = any(v_orgs::text[])
    loop
      raise notice 'Fichier Storage : %/%', r.bucket_id, r.name;
    end loop;
    begin
      delete from storage.objects o where split_part(o.name, '/', 1) = any(v_orgs::text[]);
      get diagnostics v_n = row_count;
      if v_n > 0 then
        raise notice '% ligne(s) storage.objects supprimée(s) — vérifier que les objets ont disparu du stockage (voir l''en-tête)', v_n;
      end if;
    exception when others then
      raise warning 'storage.objects refuse la suppression directe (%) : supprimer les fichiers listés ci-dessus par l''API Storage', sqlerrm;
    end;
  end if;

  loop
    v_passe := v_passe + 1;
    v_progres := false;
    v_erreurs := '{}'::jsonb;

    -- (a) Toute table publique portant `organization_id`.
    for r in
      select c.oid::regclass as tbl
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
       where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'organizations'
    loop
      begin
        execute format('delete from %s where organization_id = any($1)', r.tbl) using v_orgs;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text, sqlerrm);
      end;
    end loop;

    -- (b) Toute clé étrangère (une colonne, sans cascade) vers organizations,
    --     accounts ou auth.users, sous un autre nom de colonne.
    for r in
      select con.conrelid::regclass as tbl, att.attname as col,
             con.confrelid::regclass::text as parent
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
       where con.contype = 'f' and array_length(con.conkey, 1) = 1
         and con.confdeltype in ('a', 'r')
         and con.confrelid in ('public.organizations'::regclass, 'public.accounts'::regclass, 'auth.users'::regclass)
         and not (con.confrelid = 'public.organizations'::regclass and att.attname = 'organization_id')
    loop
      begin
        execute format('delete from %s where %I = any($1)', r.tbl, r.col)
          using case when r.parent = 'organizations' then v_orgs else v_uids end;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text || '.' || r.col, sqlerrm);
      end;
    end loop;

    -- (c) Les tables filles SANS `organization_id` d'une table qui en porte
    --     une (ex. lignes d'une clé de répartition, équipements d'un lot).
    for r in
      select con.conrelid::regclass as tbl, att.attname as col,
             con.confrelid::regclass as parent, patt.attname as pcol
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
        join pg_attribute patt on patt.attrelid = con.confrelid and patt.attnum = con.confkey[1]
        join pg_class pc on pc.oid = con.confrelid
        join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
       where con.contype = 'f' and array_length(con.conkey, 1) = 1
         and con.confdeltype in ('a', 'r')
         and exists (select 1 from pg_attribute x where x.attrelid = con.confrelid
                        and x.attname = 'organization_id' and not x.attisdropped)
         and not exists (select 1 from pg_attribute y where y.attrelid = con.conrelid
                            and y.attname = 'organization_id' and not y.attisdropped)
    loop
      begin
        execute format('delete from %s where %I in (select %I from %s where organization_id = any($1))',
                       r.tbl, r.col, r.pcol, r.parent) using v_orgs;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text || '.' || r.col, sqlerrm);
      end;
    end loop;

    -- (d) Les organisations, puis les comptes (cascade : accounts,
    --     adhésions, acceptations des conditions, identités, sessions).
    begin
      delete from public.organizations where id = any(v_orgs);
      get diagnostics v_n = row_count;
      if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
    exception when others then
      v_erreurs := v_erreurs || jsonb_build_object('organizations', sqlerrm);
    end;
    begin
      delete from auth.users where id = any(v_uids);
      get diagnostics v_n = row_count;
      if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
    exception when others then
      v_erreurs := v_erreurs || jsonb_build_object('auth.users', sqlerrm);
    end;

    select count(*) into v_reste_orgs from public.organizations where id = any(v_orgs);
    select count(*) into v_reste_comptes from auth.users where id = any(v_uids);
    exit when v_reste_orgs = 0 and v_reste_comptes = 0;

    if not v_progres or v_passe >= 25 then
      raise exception 'Purge bloquée après % passe(s) : % organisation(s) et % compte(s) restent. Refus : %',
        v_passe, v_reste_orgs, v_reste_comptes, jsonb_pretty(v_erreurs)
        using hint = 'Voir « LES VERROUS DU SCHÉMA » en tête de purger.sql';
    end if;
  end loop;

  raise notice 'Purge « % » : % ligne(s) supprimée(s) en % passe(s)', v_suffixe, v_total, v_passe;
end
$purge$;

-- Bilan : tout doit être à zéro.
select 'organisations' as reste, count(*) as nombre
  from public.organizations where name like '%' || :'suffixe' || '%'
union all
select 'comptes', count(*) from auth.users
 where lower(email) like 'delivered+%' || :'suffixe' || '%@resend.dev'
union all
select 'fiches personnes', count(*) from public.persons
 where email like 'delivered+%' || :'suffixe' || '%@resend.dev'
union all
select 'biens', count(*) from public.biens where nom like '%' || :'suffixe' || '%';

\if :simulation
  \echo 'Simulation : transaction annulée, rien n''a été supprimé.'
  rollback;
\else
  commit;
\endif
