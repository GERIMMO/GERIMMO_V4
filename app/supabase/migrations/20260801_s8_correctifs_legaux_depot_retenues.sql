-- Correctifs légaux du module 2 (garanties).
-- 1) Plafond du dépôt : c'est le caractère MEUBLÉ DU LOGEMENT qui ouvre les
--    2 mois (loi 89-462 art. 25-6), pas le type de bail. Une colocation d'un
--    lot meublé était plafonnée à tort à 1 mois.
create or replace function public.encaisser_depot(
  p_bail uuid, p_montant numeric, p_date date, p_moyen text,
  p_versant_person uuid default null, p_versant_libelle text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_plafond numeric; v_cumul numeric; v_mois integer; v_meuble boolean;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;

  -- Meublé : par le type de bail, ou par le lot lui-même (colocation meublée)
  select coalesce(l.meuble, false) into v_meuble from public.lots l where l.id = v.lot_id;
  v_mois := case when v.type = 'meuble' or v_meuble then 2 else 1 end;
  v_plafond := coalesce(v.loyer_hc, 0) * v_mois;
  if coalesce(v.depot_garantie, 0) > v_plafond then
    raise exception 'Dépôt de % € supérieur au plafond légal de % € (% mois hors charges)',
      v.depot_garantie, v_plafond, v_mois;
  end if;

  select coalesce(sum(montant), 0) into v_cumul from public.depot_encaissements where bail_id = p_bail;
  if v_cumul + p_montant > coalesce(v.depot_garantie, 0) then
    raise exception 'Encaissement (% €) dépasse le dépôt dû restant (% €)',
      p_montant, coalesce(v.depot_garantie, 0) - v_cumul;
  end if;

  insert into public.depot_encaissements
    (organization_id, bail_id, montant, date_encaissement, moyen, versant_person_id, versant_libelle)
  values (v.organization_id, p_bail, p_montant, coalesce(p_date, current_date), p_moyen,
          p_versant_person, p_versant_libelle);
  return v_cumul + p_montant;
end $$;

-- 2) Retenues : élément entièrement amorti = AUCUNE retenue possible (RM-2.4.5) ;
--    3) retenue sans justificatif acceptée mais TRACÉE et alertée (RM-2.4.6).
alter table public.retenues add column sans_justificatif boolean not null default false;

create or replace function public.ajouter_retenue(
  p_restitution uuid, p_libelle text, p_cout numeric,
  p_duree_vie numeric, p_age numeric, p_justificatif uuid default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_montant numeric;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte finalisé — plus de retenue possible'; end if;
  if v.sans_edl_entree then
    raise exception 'Sans état des lieux d''entrée, aucune retenue n''est possible : restitution intégrale (RM-2.4.3)';
  end if;
  if p_cout is null or p_cout <= 0 then raise exception 'Coût de remise en état invalide'; end if;

  if p_duree_vie is null or p_duree_vie <= 0 or p_age is null then
    v_montant := round(p_cout, 2);
  else
    -- Élément amorti : la vétusté a consommé toute la valeur, rien n'est dû (RM-2.4.5)
    if p_age >= p_duree_vie then
      raise exception 'Élément entièrement amorti (% ans sur % ans) : aucune retenue possible (RM-2.4.5)',
        p_age, p_duree_vie;
    end if;
    v_montant := round(p_cout * ((p_duree_vie - p_age) / p_duree_vie), 2);
  end if;

  insert into public.retenues
    (organization_id, restitution_id, libelle, cout, duree_vie_ans, age_ans, montant_retenu,
     justificatif_document, sans_justificatif)
  values (v.organization_id, p_restitution, p_libelle, p_cout, p_duree_vie, p_age, v_montant,
          p_justificatif, p_justificatif is null);

  -- Sans devis ni facture, la retenue est difficilement défendable : on la trace
  if p_justificatif is null then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v.organization_id, 'retenue_sans_justificatif', 'normale',
            'Retenue sans justificatif — difficilement défendable',
            jsonb_build_object('restitution_id', p_restitution, 'libelle', p_libelle,
                               'montant', v_montant));
  end if;
  return v_montant;
end $$;
