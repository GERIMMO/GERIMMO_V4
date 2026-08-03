-- A-10 — L'état du lot pouvait contredire la réalité du bail.
--
-- Le déclencheur validait la *forme* des transitions (quel état mène à quel
-- autre) mais jamais leur *fondement*. Deux boutons hérités d'avant le module
-- bail permettaient donc :
--   · « Marquer loué » sur un lot sans aucun bail — le lot compte comme loué au
--     tableau de bord, aucun loyer n'est appelé, aucun locataire n'existe ;
--   · « Passer en préavis » sans congé — pas de date d'effet, pas d'alerte
--     d'état des lieux de sortie, aucune trace du congé légal.
--
-- Et dans l'autre sens, enregistrer un congé passait le BAIL en préavis sans
-- toucher au LOT : le parc affichait « loué » pour un logement dont le locataire
-- partait. Les deux machines à états divergeaient dès le premier congé.
--
-- On adosse donc l'état du lot au bail : c'est le bail qui fait foi.

create or replace function public.verifier_transition_lot()
returns trigger language plpgsql set search_path to '' as $function$
declare
  v_blocages text[];
begin
  if old.etat in ('loue', 'preavis') then
    if new.surface_m2 is distinct from old.surface_m2
       or new.pieces is distinct from old.pieces
       or new.surface_carrez is distinct from old.surface_carrez then
      raise exception 'Lot loué : surface et pièces sont verrouillées (avenant au bail requis)';
    end if;
  end if;

  if new.etat = old.etat then return new; end if;

  if not (
    (old.etat = 'brouillon'  and new.etat in ('disponible', 'archive'))
    or (old.etat = 'disponible' and new.etat in ('brouillon', 'loue', 'archive'))
    or (old.etat = 'loue'       and new.etat = 'preavis')
    or (old.etat = 'preavis'    and new.etat in ('loue', 'disponible'))
    or (old.etat = 'archive'    and new.etat = 'brouillon')
  ) then
    raise exception 'Transition interdite : % → %', old.etat, new.etat;
  end if;

  if new.etat = 'disponible' and old.etat = 'brouillon' then
    v_blocages := public.lot_blocages_location(new.id);
    if array_length(v_blocages, 1) is not null then
      raise exception 'Passage en disponible impossible : %',
        array_to_string(v_blocages, ' · ');
    end if;
  end if;

  -- Un lot n'est loué que s'il porte un bail vivant. Sans cela, le parc affiche
  -- un logement occupé par personne.
  if new.etat = 'loue' then
    if not exists (select 1 from public.baux b
                    where b.lot_id = new.id and b.etat in ('actif', 'preavis')) then
      raise exception 'Ce lot n''a pas de bail : créez le bail et activez-le, le lot passera en loué tout seul';
    end if;
  end if;

  -- Et il n'est en préavis que si un congé a été enregistré.
  if new.etat = 'preavis' then
    if not exists (select 1 from public.baux b
                    where b.lot_id = new.id and b.etat = 'preavis') then
      raise exception 'Aucun congé enregistré sur ce bail : enregistrez le congé, le lot passera en préavis tout seul';
    end if;
  end if;

  if old.etat = 'archive' and new.etat = 'brouillon' then
    if not (
      new.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','proprietaire_direct']::public.membership_role[]))
      or public.is_super_admin()
    ) then
      raise exception 'Réactivation réservée à l''admin de l''agence';
    end if;
  end if;

  return new;
end;
$function$;

-- Le congé fait désormais suivre le lot.
create or replace function public.enregistrer_conge(
  p_bail uuid, p_par public.conge_par, p_date_presentation date,
  p_preavis_mois smallint, p_motif text default null, p_justificatif uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_zone boolean;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
begin
  select b.organization_id, b.lot_id, b.type, b.etat, coalesce(bi.zone_tendue, false)
    into v_org, v_lot, v_type, v_etat, v_zone
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;

  if p_par = 'bailleur' then
    -- Préavis légal : 6 mois (nu/colocation) / 3 mois (meublé). Motif obligatoire.
    v_preavis := case when v_type = 'meuble' then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, ramené à 1 mois de plein droit
    -- en zone tendue, ou sur justificatif dérogatoire hors zone tendue.
    if v_type = 'meuble' then
      v_preavis := 1;
    elsif v_zone then
      v_preavis := 1;   -- de plein droit, aucun justificatif exigible
    elsif p_preavis_mois = 1 then
      if p_justificatif is null then
        raise exception 'Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d''emploi, RSA/AAH…)';
      end if;
      v_preavis := 1;
    else
      v_preavis := 3;
    end if;
  end if;

  v_effet := (p_date_presentation + (v_preavis || ' months')::interval)::date;
  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet,
     motif, justificatif_document, zone_tendue)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, v_zone)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  -- Le bail fait foi : le lot suit, sinon le parc annonce « loué » pour un
  -- logement dont le locataire part.
  update public.lots set etat = 'preavis' where id = v_lot and etat = 'loue';

  insert into public.alerts (organization_id, type, criticite, titre, echeance, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser', v_effet,
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  return v_conge;
end $function$;

revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid) from public, anon;

-- Rattrapage : les lots déjà désynchronisés d'un bail en préavis.
update public.lots l set etat = 'preavis'
 where l.etat = 'loue'
   and exists (select 1 from public.baux b where b.lot_id = l.id and b.etat = 'preavis');
