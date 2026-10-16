-- Fiche artisan : les colonnes de décision internes à Gerimmo ne sont plus lisibles par les clients (relecture du
-- 15/10/2026 du lot « invitation-artisan », constat « important », antérieur au lot mais aggravé par lui).
--
-- Constat : `authenticated` avait le droit SELECT sur toute la table `public.artisans` ; la politique `artisans_select`
-- (`artisan_lisible`) ouvre la LIGNE à l'artisan lui-même, à la supervision et à toute organisation qui l'a dans son
-- carnet ou l'a sollicité. Un propriétaire direct (depuis l'invitation acceptée, 20261014840000) comme une agence
-- lisait donc, par une requête directe (`select *` ou nommément), des colonnes qui ne regardent que Gerimmo : motif de
-- refus, motif d'exclusion de la plateforme, auteur et date des décisions, échéances de purge, organisation qui a créé
-- la fiche.
--
-- Correctif (privilèges par colonne) : le droit SELECT de `authenticated` porte désormais sur une LISTE de colonnes,
-- celles que les écrans clients lisent (carnet, fiche de l'agence, réseau, documents, recherche) :
--   id, account_id, raison_sociale, siret, siret_etat, email, telephone, visibilite, statut_plateforme,
--   blacklist_globale_le, created_at, updated_at.
-- `account_id` reste ouvert : les politiques de `artisan_pieces` et `artisan_validations` le lisent avec les droits de
-- la session. `blacklist_globale_le` reste ouvert : l'exclusion est un fait du profil global (le carnet de l'agence dit
-- « exclu du réseau ») ; son MOTIF ne l'est pas.
-- Restent fermées : statut_motif, statut_decide_le, statut_decide_par, blacklist_globale_motif, blacklist_globale_par,
-- purge_motif_le, purge_prevue_le, cree_par_organization_id — ni `select *`, ni nommément, ni dans un filtre ou un tri.
-- Une colonne ajoutée plus tard à la table est fermée tant qu'une migration ne l'ouvre pas nommément.
--
-- Pourquoi pas une vue : les écrans et les politiques visent la table ; une vue « sûre » laisserait la table ouverte.
-- Les fonctions SECURITY DEFINER (toutes celles qui lisent ces colonnes le sont : `mon_artisan`, `artisans_a_valider`,
-- `artisan_decider_plateforme`, `maintenance_artisans`…) s'exécutent avec les droits de leur propriétaire : rien ne
-- change pour elles. L'artisan lit son motif par `mon_artisan()` (son espace, inchangé).
--
-- Pour la console de supervision, deux fonctions qui ne rendent que ce que ses écrans affichent :
--   · `decisions_artisans_supervision(p_debut, p_nombre)` : la liste « décisions prises » de /admin/artisans
--     (raison sociale, état, motif, date), triée par date de décision, paginée ;
--   · `decisions_artisan_supervision(p_artisan)` : la date de décision, l'échéance de conservation et le motif
--     d'exclusion, pour /admin/clients/artisans/[artisanId].
-- Les auteurs des décisions (`*_par`) et l'organisation créatrice ne sont rendus par aucune des deux.
--
-- Aucune ligne n'est touchée. Rejouable sans effet (révocations et droits idempotents, `create or replace`).
-- Retour arrière : app/supabase/retours-arriere/20261014842000_artisans_colonnes_internes.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration ; le code qui appelle les deux fonctions
-- doit être en production EN MÊME TEMPS (avant, /admin/artisans et la fiche d'un artisan échoueraient à la lecture).

revoke select on public.artisans from authenticated;
-- Un droit par colonne posé à la main sur une colonne interne serait conservé par la révocation de table : retiré aussi.
revoke select (statut_motif, statut_decide_le, statut_decide_par, blacklist_globale_motif, blacklist_globale_par,
               purge_motif_le, purge_prevue_le, cree_par_organization_id)
  on public.artisans from authenticated;
grant select (id, account_id, raison_sociale, siret, siret_etat, email, telephone, visibilite, statut_plateforme,
              blacklist_globale_le, created_at, updated_at)
  on public.artisans to authenticated;

-- 1. /admin/artisans, « Décisions prises » : même tri et même pagination que l'écran (date de décision la plus récente
-- d'abord, sans date en dernier, puis identifiant). Bornée à 500 lignes par appel.
create or replace function public.decisions_artisans_supervision(p_debut integer, p_nombre integer)
returns table(id uuid, raison_sociale text, statut_plateforme public.artisan_statut_plateforme, statut_motif text,
              statut_decide_le timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Accès refusé'; end if;
  if p_debut is null or p_nombre is null or p_debut < 0 or p_nombre < 1 or p_nombre > 500 then
    raise exception 'Page invalide';
  end if;
  return query
    select a.id, a.raison_sociale, a.statut_plateforme, a.statut_motif, a.statut_decide_le
    from public.artisans a
    where a.statut_plateforme in ('valide', 'refuse')
    order by a.statut_decide_le desc nulls last, a.id
    offset p_debut limit p_nombre;
end $$;

-- 2. /admin/clients/artisans/[artisanId] : ce que la fiche affiche des décisions de Gerimmo, et rien d'autre.
create or replace function public.decisions_artisan_supervision(p_artisan uuid)
returns table(statut_decide_le timestamptz, purge_prevue_le date, blacklist_globale_motif text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Accès refusé'; end if;
  return query
    select a.statut_decide_le, a.purge_prevue_le, a.blacklist_globale_motif
    from public.artisans a
    where a.id = p_artisan;
end $$;

-- Droits explicites : les clients connectés (la fonction vérifie la supervision), jamais `anon` ni PUBLIC.
revoke all on function public.decisions_artisans_supervision(integer, integer), public.decisions_artisan_supervision(uuid)
  from public, anon;
grant execute on function public.decisions_artisans_supervision(integer, integer), public.decisions_artisan_supervision(uuid)
  to authenticated;

select public.fermer_fonctions_a_anon();
