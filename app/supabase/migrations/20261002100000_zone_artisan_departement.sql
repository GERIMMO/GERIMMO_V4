-- ZONE D'INTERVENTION PAR DÉPARTEMENT (retour recette du 02/10/2026).
--
-- Un artisan déclarait sa zone code postal par code postal ; « tous ceux du
-- 91 » n'était pas saisissable. Une zone est désormais un code postal OU un
-- département (« 91 », « 2A », « 974 ») : la ligne reste dans
-- `artisan_zones.code_postal`, et c'est `zone_artisan_couvre()` qui dit si
-- elle couvre le code postal d'un bien. Les deux fonctions qui comparaient à
-- l'identique (`artisan_affectable`, `reseau_contact_dans_zone`) passent par
-- elle ; leur signature et leurs droits ne changent pas.
-- Même règle côté application : src/lib/zone-artisan.ts.

create or replace function public.zone_artisan_couvre(p_zone text, p_code_postal text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_zone is null or p_code_postal is null then false
    when p_zone = p_code_postal then true
    when p_zone = '2A' then p_code_postal ~ '^20[01]'
    when p_zone = '2B' then p_code_postal ~ '^20[2-6]'
    when p_zone ~ '^[0-9]{2}$' then left(p_code_postal, 2) = p_zone and left(p_code_postal, 2) <> '97'
    when p_zone ~ '^97[1-6]$' then left(p_code_postal, 3) = p_zone
    else false
  end;
$$;
comment on function public.zone_artisan_couvre(text, text) is
  'Une zone d''artisan (code postal ou département) couvre-t-elle ce code postal ? Règle miroir de src/lib/zone-artisan.ts.';
-- Fonction interne : jamais exposée par /rest/v1/rpc (garde-fou
-- tests/aucune-fonction-ouverte-a-anon).
revoke execute on function public.zone_artisan_couvre(text, text) from public, anon, authenticated;

alter table public.artisan_zones drop constraint if exists artisan_zones_code_postal_forme;
alter table public.artisan_zones add constraint artisan_zones_code_postal_forme
  check (code_postal ~ '^([0-9]{5}|[0-9]{2}|2A|2B|97[1-6])$');
comment on table public.artisan_zones is
  'Zone d''intervention (module 8, parcours 8.1) : codes postaux ou départements, comparés au code postal du bien par zone_artisan_couvre().';

create or replace function public.artisan_affectable(
  p_artisan uuid, p_org uuid, p_metier public.artisan_metier,
  p_nature public.nature_travaux, p_code_postal text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.artisans a
    where a.id = p_artisan
      and a.statut_plateforme = 'valide'
      and a.blacklist_globale_le is null
      and a.siret_etat = 'verifie'
      and (
        exists (select 1 from public.artisan_agences aa
                where aa.artisan_id = a.id and aa.organization_id = p_org
                  and aa.statut = 'actif' and aa.blacklist_le is null)
        or (a.visibilite = 'publique'
            and not exists (select 1 from public.artisan_agences aa
                            where aa.artisan_id = a.id and aa.organization_id = p_org
                              and (aa.blacklist_le is not null or aa.statut = 'desactive')))
      )
      and exists (select 1 from public.artisan_metiers am
                  where am.artisan_id = a.id and am.metier = p_metier)
      -- 4. Sa zone, quand on la contrôle : code postal ou département.
      and (p_code_postal is null
           or exists (select 1 from public.artisan_zones az
                      where az.artisan_id = a.id
                        and public.zone_artisan_couvre(az.code_postal, p_code_postal)))
      and (not public.decennale_requise(p_nature)
           or public.artisan_decennale_valide(a.id))
  );
$$;

create or replace function public.reseau_contact_dans_zone(p_org uuid, p_artisan uuid, p_cp text) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.reseau_contact_personnel(p_org, p_artisan) and (p_cp is null or exists(
  select 1 from public.artisan_zones z
   where z.artisan_id = p_artisan and public.zone_artisan_couvre(z.code_postal, p_cp)));
$$;

-- Les droits par défaut d'un CREATE sont refermés, comme à chaque migration.
select public.fermer_fonctions_a_anon();
