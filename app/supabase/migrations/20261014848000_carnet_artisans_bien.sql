-- Carnet d'artisans vu pour UN bien : pourquoi un artisan ne peut pas y être sollicité (relecture du 15/10/2026 du lot
-- « invitation-artisan »).
--
-- Constat : le carnet du propriétaire affichait « Validé — peut être sollicité » pour tout artisan validé par Gerimmo,
-- alors que la sollicitation se juge bien par bien (`artisan_affectable`) : la zone d'intervention de l'artisan doit
-- couvrir le code postal du bien, et une décennale valide est exigée pour les travaux autres que l'entretien courant.
-- Un artisan validé hors de sa zone, ou sans décennale, disparaissait de la fiche de l'incident sans explication.
--
-- Correctif : une fonction de LECTURE, `carnet_artisans_bien(p_org, p_bien)`, rend pour chaque artisan du carnet de
-- l'organisation (`artisan_agences`) les conditions de `artisan_affectable` pour ce bien, chacune calculée au serveur :
-- relation active (ni désactivé ni sur la liste noire locale), inscription validée (validé, SIRET vérifié, sans
-- exclusion de la plateforme), métiers, zone qui couvre le code postal du bien (`zone_artisan_couvre`), décennale valide
-- (`artisan_decennale_valide`). L'écran en déduit les motifs pour le métier et la nature de travaux choisis
-- (`motifsCarnetPourBien`, src/lib/invitations-artisan.ts). Accès : celui de `artisans_disponibles_bien`
-- (`reseau_verifier_acces_bien` : gérant de l'organisation, bien de l'organisation, portefeuille de l'agent).
-- Elle ne rend rien de plus que ce que l'organisation lit déjà de son carnet (fiche, métiers, zone) : aucune pièce,
-- aucun motif de décision de Gerimmo.
--
-- Aucune fonction existante n'est modifiée ; aucune ligne n'est touchée. Rejouable sans effet (`create or replace`).
-- Retour arrière : app/supabase/retours-arriere/20261014848000_carnet_artisans_bien.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

create or replace function public.carnet_artisans_bien(p_org uuid, p_bien uuid)
returns table(artisan_id uuid, raison_sociale text, metiers text[], sollicitable_plateforme boolean,
              relation_active boolean, zone_couvre boolean, decennale_valide boolean, code_postal text)
language plpgsql stable security definer set search_path = '' as $$
declare v_cp text;
begin
  perform public.reseau_verifier_acces_bien(p_org, p_bien);
  select b.postal_code into v_cp from public.biens b where b.id = p_bien;
  return query
    select a.id, a.raison_sociale,
           coalesce((select array_agg(m.metier::text order by m.metier) from public.artisan_metiers m where m.artisan_id = a.id), '{}'::text[]),
           (a.statut_plateforme = 'valide' and a.siret_etat = 'verifie' and a.blacklist_globale_le is null),
           (aa.statut = 'actif' and aa.blacklist_le is null),
           -- Comme `artisan_affectable` : sans code postal connu, la zone n'est pas contrôlée.
           (v_cp is null or exists (select 1 from public.artisan_zones z
                                    where z.artisan_id = a.id and public.zone_artisan_couvre(z.code_postal, v_cp))),
           public.artisan_decennale_valide(a.id),
           v_cp
    from public.artisan_agences aa
    join public.artisans a on a.id = aa.artisan_id
    where aa.organization_id = p_org
    order by a.raison_sociale, a.id;
end $$;

-- Droits explicites : les clients connectés (la fonction vérifie l'accès au bien), jamais `anon` ni PUBLIC.
revoke all on function public.carnet_artisans_bien(uuid, uuid) from public, anon;
grant execute on function public.carnet_artisans_bien(uuid, uuid) to authenticated;

select public.fermer_fonctions_a_anon();
