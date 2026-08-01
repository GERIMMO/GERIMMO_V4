-- Sprint 6 : ventilation d'une dépense au niveau du bien → une écriture par lot,
-- répartie via la clé de répartition en vigueur (une saisie, plusieurs rapports).
create function public.ventiler_depense_bien(
  p_bien uuid, p_categorie text, p_montant numeric,
  p_date_piece date, p_date_imputation date, p_libelle text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_cle uuid;
  v_crees int := 0;
  r record;
begin
  select organization_id into v_org from public.biens where id = p_bien;
  if v_org is null then raise exception 'Bien introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;
  if coalesce(btrim(p_categorie), '') = '' then raise exception 'Catégorie obligatoire'; end if;

  select id into v_cle from public.cles_repartition
  where bien_id = p_bien and invalidated_at is null limit 1;

  if v_cle is not null then
    for r in select lot_id, pourcentage from public.cle_repartition_lignes where cle_id = v_cle loop
      insert into public.ecritures
        (organization_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle)
      values (v_org, r.lot_id, p_categorie, 'depense', round(p_montant * r.pourcentage / 100, 2),
              p_date_piece, p_date_imputation,
              coalesce(p_libelle, '') || ' (quote-part ' || r.pourcentage || ' %)');
      v_crees := v_crees + 1;
    end loop;
  else
    for r in select id as lot_id from public.lots where bien_id = p_bien and etat <> 'archive' loop
      insert into public.ecritures
        (organization_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle)
      values (v_org, r.lot_id, p_categorie, 'depense', p_montant, p_date_piece, p_date_imputation, p_libelle);
      v_crees := v_crees + 1;
    end loop;
  end if;

  if v_crees = 0 then raise exception 'Aucun lot à ventiler pour ce bien'; end if;
  return v_crees;
end;
$$;
revoke execute on function public.ventiler_depense_bien(uuid, text, numeric, date, date, text) from public, anon;
