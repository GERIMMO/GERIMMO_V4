-- Audit du 2026-09-10 — le rôle « anon » n'écrit plus rien en base.
--
-- LA RÈGLE. `anon` est le rôle du visiteur NON CONNECTÉ : toute requête portant
-- la clé publiable sans session s'exécute sous ce rôle. Le socle du projet pose
-- que l'anonyme est refusé AVANT la RLS — défense en profondeur, pas seulement
-- un `qual` bien écrit (wiki/regles-metier/Isolation multi-organisation, volet
-- « durcissement » : l'`execute` des fonctions d'autorisation est déjà révoqué à
-- `anon`/`public` ; wiki/regles-metier/Socle de sécurité, RM-A4.6 « base non
-- exposée publiquement »). RM-A1.6 impose `organization_id` sur toute donnée
-- d'agence et RM-A1.7 un test d'isolation par table : or un visiteur anonyme
-- n'a AUCUNE organisation, donc aucune écriture ne peut lui être légitime —
-- sauf le formulaire de devis du site vitrine, qui n'est pas une donnée
-- d'agence (voir plus bas).
--
-- CE QUI ÉTAIT CONSTATÉ. 26 tables de `public` accordaient encore à `anon`
-- l'ACL complète (`arwdDxt` = select, insert, update, delete, truncate,
-- references, trigger) — héritage des privilèges par défaut Supabase :
--   annonces, appel_charges_postes, appels_charges, appels_loyer,
--   bien_infos_pratiques, clotures_comptables, demandes_devis,
--   demandes_signature, depot_encaissements, ecritures, edl_cles,
--   edl_compteurs, encaissements, intentions_conge, inventaire_lignes,
--   lot_pieces, messages, pieces_demandees, quittances, rapports_gestion,
--   regularisations_charges, relances, restitutions, retenues,
--   revisions_loyer, site_pages.
-- (L'audit en comptait 34 : les 8 autres — invitations, artisan_candidatures,
--  signature_circuits, signature_signataires, reprises_portefeuille,
--  reprise_soldes, mouvements_mandants, controles_solvabilite — ont déjà été
--  fermées par 20260910150000_tables_non_cablees_fermees.sql.)
--
-- POURQUOI C'EST UN DÉFAUT RÉEL, ET PAS SEULEMENT THÉORIQUE. La RLS ne
-- s'applique pas au TRUNCATE : seul le privilège compte. Rejoué en local sous
-- `set local role anon`, `truncate table public.encaissements` PASSE — de même
-- sur 21 des 26 tables (les 5 autres ne résistent que par une clé étrangère,
-- qu'un `cascade` emporterait). Le journal des encaissements, les quittances,
-- les clôtures comptables et les fils de messages sont ainsi effaçables par un
-- rôle qui ne devrait tenir aucune plume. Les privilèges `trigger` et
-- `references` ouvrent en outre la pose d'un déclencheur sur une table qu'on ne
-- possède pas — même famille d'abus que celle corrigée le même jour sur les
-- fonctions déclencheur SECURITY DEFINER.
--
-- CE QUI EST PRÉSERVÉ, ET POURQUOI.
--  * `demandes_devis` GARDE `insert`. C'est le seul geste d'écriture
--    légitimement anonyme de l'application : le formulaire de devis du site
--    vitrine (`src/app/formulaire-devis-vitrine.tsx` → `demanderDevis` dans
--    `src/app/actions/devis.ts`) écrit EN DIRECT via le client Supabase sans
--    session, et la table porte pour cela la politique
--    `demandes_devis_insert_public` (`for insert to anon, authenticated`).
--    Lui retirer `insert` casserait la vitrine. Ses `update`/`delete`/
--    `truncate`, eux, ne servent à personne : la lecture et le traitement sont
--    réservés au super admin.
--  * Le `select` n'est pas touché : ce lot ne traite que l'écriture, et
--    `site_pages` sert ses maquettes de démonstration à des visiteurs anonymes
--    (politique « lecture publique des maquettes »).
--  * Les fonctions SECURITY DEFINER ne sont PAS concernées : elles s'exécutent
--    sous leur propriétaire, avec ses privilèges. L'auto-inscription du
--    propriétaire direct (`initialiser_espace_proprietaire`, SECURITY DEFINER,
--    `execute` réservé à `authenticated`) et tout le circuit Auth (signUp,
--    réinitialisation de mot de passe — GoTrue, schéma `auth`) continuent
--    d'écrire normalement. C'est précisément ce qui rend cette révocation sûre.
--
-- Flux anonymes vérifiés un à un (chemins publics du proxy `src/proxy.ts` :
-- `/`, `/confidentialite`, `/connexion`, `/inscription`, `/mot-de-passe-oublie`,
-- `/nouveau-mot-de-passe`, `/auth/confirm`) : seul `demanderDevis` écrit en
-- table sous le rôle `anon`. Aucun autre écran, aucune route, aucune action
-- serveur n'écrit sans session.
--
-- La révocation est balayée sur tout le schéma plutôt qu'énumérée table à
-- table : la règle est universelle (« l'anonyme n'écrit pas »), et un balayage
-- rattrape aussi une éventuelle dérive de production.
--
-- MAIS UN BALAYAGE NE SUFFIT PAS : il ne vaut que pour les tables du jour. La
-- brèche vient des PRIVILÈGES PAR DÉFAUT du schéma (`alter default privileges
-- … grant … on tables to anon`, posés par l'installation Supabase) — c'est
-- l'unique origine possible des 26 tables constatées, puisque AUCUNE migration
-- du dépôt ne porte de `grant` de table à `anon`. La preuve tient en une
-- ligne : `20260906130000_demandes_devis.sql` crée la table du formulaire
-- vitrine avec sa politique `to anon` mais SANS aucun `grant` — si les
-- privilèges par défaut n'accordaient rien à `anon`, ce formulaire n'aurait
-- jamais fonctionné en production. Sans le geste ci-dessous, la première table
-- créée par la prochaine migration rouvrirait donc la brèche à l'identique,
-- TRUNCATE compris, et le garde-fou de cette migration ne serait plus là pour
-- la voir. Rejoué sur le banc local dans une transaction annulée : en
-- rétablissant la matrice de production (cf. `e2e/local/bootstrap-supabase-local.sql`,
-- « privilèges anon fidèles à la production »), une table créée APRÈS le
-- balayage redonne à `anon` insert/update/delete — et truncate quand le défaut
-- est un `grant all`.
-- Le `select` par défaut n'est pas touché : ce lot ne traite que l'écriture.

do $$
declare
  t record;
  touchees text[] := '{}';
begin
  for t in
    select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')  -- tables ordinaires et partitionnées
       and (
            has_table_privilege('anon', c.oid, 'insert')
         or has_table_privilege('anon', c.oid, 'update')
         or has_table_privilege('anon', c.oid, 'delete')
         or has_table_privilege('anon', c.oid, 'truncate')
         or has_table_privilege('anon', c.oid, 'references')
         or has_table_privilege('anon', c.oid, 'trigger')
       )
     order by c.relname
  loop
    if t.relname = 'demandes_devis' then
      -- Le formulaire public du site vitrine garde son droit d'insertion,
      -- et rien d'autre.
      execute 'revoke update, delete, truncate, references, trigger on public.demandes_devis from anon';
      touchees := touchees || 'demandes_devis (insert conservé)'::text;
    else
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on public.%I from anon',
        t.relname);
      touchees := touchees || t.relname::text;
    end if;
  end loop;

  raise notice 'anon : privilèges d''écriture révoqués sur % table(s) : %',
    cardinality(touchees), array_to_string(touchees, ', ');
end $$;

-- Le formulaire de devis de la vitrine tenait son droit d'insertion du seul
-- privilège par défaut, hérité sans être voulu. On le rend EXPLICITE avant de
-- fermer ce défaut : la seule écriture anonyme de l'application devient un
-- `grant` délibéré, lisible, qui ne dépend plus d'un réglage d'installation.
grant insert on public.demandes_devis to anon;

-- Les privilèges par défaut : on retire `anon` de toute entrée qui lui
-- accorderait une écriture sur les tables À VENIR de `public`. Une table future
-- devra recevoir son `grant` explicitement, en même temps que sa politique —
-- c'est l'effet recherché.
do $$
declare r record;
begin
  for r in
    select distinct pg_get_userbyid(d.defaclrole) as proprio
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
     where n.nspname = 'public'
       and d.defaclobjtype = 'r'              -- tables
       and a.grantee = 'anon'::regrole
       and a.privilege_type in
           ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  loop
    begin
      execute format(
        'alter default privileges for role %I in schema public
           revoke insert, update, delete, truncate, references, trigger on tables from anon',
        r.proprio);
      raise notice 'anon retiré des privilèges par défaut des tables de public (rôle %)',
        r.proprio;
    exception when insufficient_privilege then
      raise exception 'impossible de retirer anon des privilèges par défaut du rôle % : '
        'appliquer cette migration sous un rôle membre de %', r.proprio, r.proprio;
    end;
  end loop;
end $$;

-- Garde-fou : après ce balayage, la seule écriture qu'`anon` conserve dans
-- `public` doit être `demandes_devis / INSERT`. Toute autre survivance est une
-- erreur — on préfère échouer bruyamment ici plutôt que la découvrir en
-- production.
do $$
declare restes text;
begin
  select string_agg(format('%s/%s', c.relname, p.priv), ', ' order by c.relname, p.priv)
    into restes
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral (
      values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(priv)
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and has_table_privilege('anon', c.oid, p.priv)
     and not (c.relname = 'demandes_devis' and p.priv = 'INSERT');
  if restes is not null then
    raise exception 'anon conserve des privilèges d''écriture : %', restes;
  end if;
end $$;

-- Second garde-fou, celui de la DURABILITÉ : plus aucun privilège par défaut de
-- `public` ne doit accorder d'écriture à `anon`, sans quoi la prochaine table
-- créée rouvrirait la brèche en silence.
do $$
declare restes text;
begin
  select string_agg(
           format('%s → %s', pg_get_userbyid(d.defaclrole), a.privilege_type),
           ', ' order by pg_get_userbyid(d.defaclrole), a.privilege_type)
    into restes
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
   where n.nspname = 'public'
     and d.defaclobjtype = 'r'
     and a.grantee = 'anon'::regrole
     and a.privilege_type in
         ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');
  if restes is not null then
    raise exception 'les privilèges par défaut de public accordent encore des écritures à anon : %',
      restes;
  end if;
end $$;

comment on table public.demandes_devis is
  'Demandes de devis du site vitrine. Seule table où le rôle anon conserve un privilège d''écriture (INSERT), pour le formulaire public — audit 2026-09-10.';
