-- Espace locataire v10 (maquette du 05/09) — trois briques :
--  1. mon_bail_locataire v4 : RÉPARE la perte de document_signe (la version du
--     04/09 était repartie de la définition du 23/08 au lieu de celle du
--     26/08) et ajoute ce que le nouvel accueil affiche — surface, pièces,
--     étage, meublé, adresse du bien, zone tendue.
--  2. mon_conge_locataire : le locataire donne son congé depuis son espace.
--     Préavis calculé (meublé → 1 mois ; nu en zone tendue → 1 mois ; sinon
--     3 mois — le préavis réduit sur motif dérogatoire reste un geste de
--     l'agence, justificatif à l'appui). Bail en préavis, alerte au gérant.
--  3. mon_gestionnaire_locataire : qui gère mon logement — l'agence (nom,
--     téléphone, e-mail de contact) et, si le mandat du lot a un titulaire,
--     l'e-mail de l'agent.

-- 1. ------------------------------------------------------------------
drop function if exists public.mon_bail_locataire(uuid);

create function public.mon_bail_locataire(p_org uuid)
returns table (bail_id uuid, type public.bail_type, etat public.bail_etat,
               loyer_hc numeric, charges numeric, date_debut date, date_fin date,
               lot_nom text, document_signe uuid, charges_mode text,
               jour_echeance smallint, surface_m2 numeric, pieces integer,
               etage text, meuble boolean, adresse text, ville text,
               zone_tendue boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.type, b.etat, b.loyer_hc, b.charges, b.date_debut, b.date_fin,
         l.nom, b.document_signe, b.charges_mode, b.jour_echeance,
         l.surface_m2, l.pieces, l.etage, l.meuble,
         bi.address_line1 || ', ' || bi.postal_code || ' ' || bi.city,
         bi.city, coalesce(bi.zone_tendue, false)
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc;
$$;
revoke execute on function public.mon_bail_locataire(uuid) from public, anon;

-- 2. ------------------------------------------------------------------
create function public.mon_conge_locataire(p_org uuid, p_motif text default null)
returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_bail record;
  v_zone boolean;
  v_preavis smallint;
  v_effet date;
begin
  -- Le bail ACTIF dont l'appelant est locataire principal ou colocataire
  select b.* into v_bail
  from public.baux b
  where b.organization_id = p_org and b.etat = 'actif'
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc limit 1;
  if v_bail.id is null then
    raise exception 'Aucun bail actif à votre nom — contactez votre gestionnaire';
  end if;

  select coalesce(bi.zone_tendue, false) into v_zone
  from public.lots l join public.biens bi on bi.id = l.bien_id
  where l.id = v_bail.lot_id;

  -- Meublé : 1 mois. Nu : 3 mois, réduit à 1 mois en zone tendue.
  v_preavis := case when v_bail.type = 'meuble' or v_zone then 1 else 3 end;
  -- Remis via l'espace : la notification vaut réception ce jour.
  v_effet := (current_date + (v_preavis || ' months')::interval)::date;

  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois,
     date_effet, motif, zone_tendue)
  values
    (p_org, v_bail.id, 'locataire', current_date, v_preavis, v_effet,
     nullif(trim(coalesce(p_motif, '')), ''), v_zone);

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now()
  where id = v_bail.id;

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'edl_sortie', 'normale',
          'Congé du locataire reçu — état des lieux de sortie à planifier',
          jsonb_build_object('bail_id', v_bail.id, 'lot_id', v_bail.lot_id,
                             'date_effet', v_effet, 'preavis_mois', v_preavis));

  return v_effet;
end;
$$;
revoke execute on function public.mon_conge_locataire(uuid, text) from public, anon;

-- 3. ------------------------------------------------------------------
create function public.mon_gestionnaire_locataire(p_org uuid)
returns table (agence text, telephone text, email_contact text, agent_email text)
language sql stable security definer set search_path = '' as $$
  select o.name, o.telephone, o.email_contact,
    (select a.email
     from public.baux b
     join public.mandat_lignes ml on ml.lot_id = b.lot_id and ml.date_fin is null
     join public.mandats m on m.id = ml.mandat_id and m.etat = 'actif'
     join public.accounts a on a.id = m.agent_account_id
     where b.organization_id = p_org and b.etat in ('actif', 'preavis')
       and exists (
         select 1 from public.persons p
         where p.organization_id = p_org and p.account_id = (select auth.uid())
           and (p.id = b.locataire_principal
                or exists (select 1 from public.bail_personnes bp
                           where bp.bail_id = b.id and bp.person_id = p.id
                             and bp.role = 'colocataire')))
     order by b.created_at desc limit 1)
  from public.organizations o
  where o.id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active');
$$;
revoke execute on function public.mon_gestionnaire_locataire(uuid) from public, anon;
