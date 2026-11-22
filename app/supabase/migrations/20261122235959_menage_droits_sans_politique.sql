-- MÉNAGE DE LA BASE (audit palier 1 du 22/11/2026, P2-08) : droits d'écriture qu'aucune règle n'autorise, et une
-- exception consignée. Aucune donnée n'est modifiée ; aucune table, aucune fonction n'est supprimée.
--
-- 1. DROITS DE TABLE SANS POLITIQUE (relevé R13 de l'audit).
--    Sur 21 tables, les comptes connectés (`authenticated`) détiennent un droit d'insertion, de modification ou de
--    suppression qu'AUCUNE politique de cloisonnement n'autorise : la base refuse déjà toute ligne. Ces droits ne
--    servent donc à rien aujourd'hui ; ils deviendraient une porte ouverte le jour où une politique « pour toutes les
--    commandes » serait ajoutée par mégarde. Ils sont retirés, table par table, commande par commande.
--    Rien ne change pour les écrans : sur ces tables, les écritures passent par des fonctions de la base, qui
--    n'utilisent pas ces droits.
--    Par prudence, chaque retrait est revérifié AU MOMENT de s'appliquer : si, dans la base où la migration tourne,
--    une politique autorise la commande, ou si le cloisonnement de la table n'est pas actif, le droit est LAISSÉ et la
--    migration le dit. Elle ne peut donc retirer que des droits déjà sans effet.
--
-- 2. VUE `organisations_portail` : EXCEPTION CONSIGNÉE.
--    L'outil de contrôle de Supabase la signale (« security_definer_view ») parce qu'elle s'exécute avec les droits
--    de son propriétaire. C'est voulu : elle ne rend à un compte que les organisations dont il est membre, avec les
--    seules colonnes d'affichage du portail, et l'IBAN au seul locataire actif. La convertir ferait perdre au
--    locataire le nom et les couleurs de son espace. Un commentaire sur la vue dit pourquoi ; la vue n'est pas touchée.
--
-- Ce que cette migration NE fait PAS (décisions laissées au dirigeant, QUESTIONS.md) : supprimer les tables
-- abandonnées (`site_pages`, `liste_attente`…), fermer les fonctions jamais appelées, changer la procédure
-- `fermetures_comptes_nuit` (lui fixer un chemin de recherche l'empêcherait de valider ses étapes : erratum de l'audit).
--
-- Retour arrière : supabase/retours-arriere/20261122235959_menage_droits_sans_politique.retour.sql.

do $menage$
declare
  r record;
  v_table regclass;
  v_lettre "char";
begin
  for r in
    select * from (values
      ('annonces', 'UPDATE'),
      ('appels_loyer', 'INSERT'), ('appels_loyer', 'UPDATE'), ('appels_loyer', 'DELETE'),
      ('bail_personnes', 'UPDATE'),
      ('bien_infos_pratiques', 'DELETE'),
      ('clotures_comptables', 'INSERT'), ('clotures_comptables', 'UPDATE'), ('clotures_comptables', 'DELETE'),
      ('demandes_devis', 'DELETE'),
      ('depot_encaissements', 'INSERT'), ('depot_encaissements', 'UPDATE'),
      ('ecritures', 'UPDATE'), ('ecritures', 'DELETE'),
      ('equipements_catalogue', 'DELETE'),
      ('intentions_conge', 'INSERT'), ('intentions_conge', 'UPDATE'), ('intentions_conge', 'DELETE'),
      ('intervention_rappels', 'INSERT'), ('intervention_rappels', 'UPDATE'), ('intervention_rappels', 'DELETE'),
      ('lot_equipements', 'UPDATE'),
      ('messages', 'INSERT'), ('messages', 'UPDATE'), ('messages', 'DELETE'),
      ('quittances', 'INSERT'), ('quittances', 'DELETE'),
      ('rapports_gestion', 'INSERT'), ('rapports_gestion', 'UPDATE'), ('rapports_gestion', 'DELETE'),
      ('regularisations_charges', 'INSERT'), ('regularisations_charges', 'UPDATE'), ('regularisations_charges', 'DELETE'),
      ('relances', 'UPDATE'),
      ('restitutions', 'INSERT'), ('restitutions', 'UPDATE'), ('restitutions', 'DELETE'),
      ('retenues', 'INSERT'), ('retenues', 'UPDATE'), ('retenues', 'DELETE'),
      ('revisions_loyer', 'INSERT'), ('revisions_loyer', 'UPDATE'), ('revisions_loyer', 'DELETE'),
      ('site_pages', 'INSERT'), ('site_pages', 'UPDATE'), ('site_pages', 'DELETE')
    ) as t(nom_table, commande)
  loop
    v_table := to_regclass('public.' || quote_ident(r.nom_table));
    if v_table is null then
      raise exception 'Ménage P2-08 : la table public.% est absente de cette base.', r.nom_table;
    end if;
    v_lettre := case r.commande when 'INSERT' then 'a' when 'UPDATE' then 'w' else 'd' end;
    if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = v_table) then
      raise notice 'Ménage P2-08 : cloisonnement inactif sur % : droit % laissé, à examiner.', r.nom_table, r.commande;
      continue;
    end if;
    if exists (
      select 1 from pg_catalog.pg_policy p
       where p.polrelid = v_table and p.polpermissive
         and (p.polcmd = v_lettre or p.polcmd = '*')
         and (p.polroles = '{0}'::oid[] or 'authenticated'::regrole = any (p.polroles))
    ) then
      raise notice 'Ménage P2-08 : une politique autorise % sur % dans cette base : droit laissé.', r.commande, r.nom_table;
      continue;
    end if;
    execute format('revoke %s on table %s from authenticated', r.commande, v_table);
  end loop;
end
$menage$;

comment on view public.organisations_portail is
  'Exception consignée (audit palier 1, P2-08, 22/11/2026). Vue exécutée avec les droits de son propriétaire, volontairement (security_barrier) : elle ne rend à un compte que les organisations dont il est membre (user_org_ids()), avec les seules colonnes d''affichage du portail, et l''IBAN au seul locataire actif. Signalée « security_definer_view » par l''outil de contrôle de Supabase : voulu. Ne pas la passer en security_invoker sans donner d''abord aux locataires une autre lecture du nom et des couleurs de leur espace.';

notify pgrst, 'reload schema';
