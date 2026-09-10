-- Audit du 2026-09-10 — advisor de sécurité : trois fonctions déclencheur
-- portaient un GRANT EXECUTE à PUBLIC, donc au rôle anon :
--   public.contre_passer_depot_encaissement()
--   public.garde_portefeuille_agent()
--   public.mandat_titulaire_protege()
--
-- LA RÈGLE. La surface exécutable de la base est exactement l'API de
-- l'application : tout ce qui est interne est révoqué de `public` et de `anon`
-- ([[Isolation multi-organisation]] — durcissement maison « execute des helpers
-- révoqué à anon/public » ; [[Socle de sécurité]] RM-A4.7, base non exposée
-- publiquement). Une fonction déclencheur n'est JAMAIS appelée par
-- l'application : elle n'a besoin d'aucun droit d'exécution pour personne.
--
-- POURQUOI CE N'EST PAS QU'UNE QUESTION D'HYGIÈNE. L'audit avait classé le
-- point « non exploitable » au motif qu'une fonction déclencheur n'est pas
-- appelable directement (PostgreSQL refuse : « trigger functions can only be
-- called as triggers ») ni exposée en RPC par PostgREST. C'est vrai pour
-- l'appel direct, et faux pour l'ensemble : le droit EXECUTE est aussi ce qui
-- autorise à POSER la fonction en déclencheur sur une table à soi. Or anon et
-- authenticated ont le droit TEMPORARY sur la base. Rejoué sur la base locale,
-- sous le seul rôle anon, sans compte ni adhésion, avec un identifiant en dur :
--
--   set role anon;
--   create temp table piege (id uuid);
--   create trigger abus before delete on piege
--     for each row execute function public.contre_passer_depot_encaissement();
--   insert into piege values ('<id d''un depot_encaissement d''une autre agence>');
--   delete from piege;   -- → contre-écriture forgée dans le journal de la victime
--
-- La fonction étant SECURITY DEFINER, elle s'exécute sous postgres : la RLS ne
-- s'applique pas et l'écriture atterrit dans l'organisation de la victime. Cela
-- franchit la frontière d'agence (RM-A1.6/A1.7/A1.10) et fabrique une
-- contre-écriture sans motif ni auteur légitime, contre RM-A6.3/A6.4/A6.6
-- ([[Comptabilité]] : immutabilité, correction par contre-écriture motivée).
-- La voie n'est pas atteignable via PostgREST (qui n'émet pas de DDL) ; elle
-- l'est par tout accès SQL direct sous anon/authenticated.
--
-- LA CORRECTION. Révoquer EXECUTE sur les fonctions déclencheur. Un déclencheur
-- s'exécute sous le propriétaire de la fonction et le droit EXECUTE n'est
-- vérifié qu'à la CRÉATION du déclencheur : les 25 déclencheurs déjà posés
-- continuent de mordre à l'identique (vérifié en local, voir les tests de
-- non-régression). Les migrations, elles, s'appliquent sous postgres,
-- propriétaire des 31 fonctions déclencheur du schéma public : aucune n'est
-- gênée pour poser de nouveaux déclencheurs.

-- ---------------------------------------------- 1. Les trois de l'advisor
revoke execute on function public.contre_passer_depot_encaissement()
  from public, anon, authenticated, service_role;
revoke execute on function public.garde_portefeuille_agent()
  from public, anon, authenticated, service_role;
revoke execute on function public.mandat_titulaire_protege()
  from public, anon, authenticated, service_role;

-- -------------------------------- 2. La même faille sur toute sa classe
-- Le défaut ne tient pas à ces trois fonctions mais au privilège par défaut de
-- Supabase, qui accorde EXECUTE à anon/authenticated sur toute fonction créée.
-- Chaque fonction déclencheur SECURITY DEFINER qui écrit est donc un levier
-- d'écriture inter-agences dès sa création. On ferme la classe entière, pas
-- seulement les trois cas signalés (au 2026-09-10 :
-- public.encaissement_resynchronise_quittances() était dans le même état).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and pg_get_function_result(p.oid) = 'trigger'
       and p.proowner = 'postgres'::regrole
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated, service_role',
      f.signature);
  end loop;
end $$;

-- ------------------------------------------ 3. Garde-fou de la migration
-- La migration échoue plutôt que de laisser croire que la surface est propre.
do $$
declare v_reste text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_reste
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and pg_get_function_result(p.oid) = 'trigger'
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_reste is not null then
    raise exception 'Fonctions déclencheur encore exécutables par anon/authenticated : %', v_reste;
  end if;
end $$;
