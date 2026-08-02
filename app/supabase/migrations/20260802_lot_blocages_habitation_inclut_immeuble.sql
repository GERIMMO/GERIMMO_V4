-- L'ajout du type « immeuble » laissait un trou : la définition d'habitation
-- était codée en dur ici sur ('appartement','maison'). Un logement d'immeuble
-- classé G n'aurait donc PAS été bloqué à la location (loi Climat), et son DPE
-- manquant n'aurait pas été signalé. Aligné sur TYPES_HABITATION (src/lib/parc.ts).
-- Seule la ligne v_habitation change ; le corps est réécrit à l'identique.
create or replace function public.lot_blocages_location(p_lot uuid)
returns text[] language plpgsql stable set search_path to '' as $function$
declare
  v_lot record; v_bien record; v_total numeric;
  v_blocages text[] := '{}'; v_habitation boolean;
begin
  select * into v_lot from public.lots where id = p_lot;
  if not found then return array['Lot introuvable']; end if;
  select * into v_bien from public.biens where id = v_lot.bien_id;

  if v_lot.nom is null or length(trim(v_lot.nom)) = 0 then
    v_blocages := array_append(v_blocages, 'Nom du lot manquant');
  end if;
  if v_lot.surface_m2 is null then
    v_blocages := array_append(v_blocages, 'Surface manquante');
  end if;

  select coalesce(sum(quote_part), 0) into v_total
  from public.detentions where lot_id = p_lot and date_fin is null;
  if v_total <> 100 then
    v_blocages := array_append(v_blocages,
      format('Détention incomplète (%s %% — il faut exactement 100 %%)', v_total));
  end if;

  v_habitation := v_bien.type in ('appartement', 'maison', 'immeuble');
  if v_habitation and not exists (
    select 1 from public.diagnostics d
    where d.lot_id = p_lot and d.type = 'dpe' and d.archived_at is null
      and (d.date_expiration is null or d.date_expiration >= current_date)
  ) then
    v_blocages := array_append(v_blocages, 'DPE absent ou expiré (obligatoire en habitation)');
  end if;
  if v_habitation and exists (
    select 1 from public.diagnostics d
    where d.lot_id = p_lot and d.type = 'dpe' and d.archived_at is null and d.classe_dpe = 'G'
  ) then
    v_blocages := array_append(v_blocages, 'DPE classe G : logement interdit à la location (loi Climat)');
  end if;
  if not exists (
    select 1 from public.diagnostics d
    where d.bien_id = v_lot.bien_id and d.type = 'erp' and d.archived_at is null
      and (d.date_expiration is null or d.date_expiration >= current_date)
  ) then
    v_blocages := array_append(v_blocages, 'ERP absent ou expiré (état des risques, validité 6 mois)');
  end if;
  if exists (
    select 1 from public.diagnostics d
    where (d.lot_id = p_lot or d.bien_id = v_lot.bien_id)
      and d.type not in ('dpe', 'erp') and d.archived_at is null
      and d.date_expiration is not null and d.date_expiration < current_date
  ) then
    v_blocages := array_append(v_blocages, 'Un diagnostic déposé est expiré');
  end if;

  if (select count(*) from public.lots l
      where l.bien_id = v_lot.bien_id and l.etat <> 'archive') > 1
     and not exists (
       select 1 from public.cles_repartition c
       where c.bien_id = v_lot.bien_id and c.invalidated_at is null
     ) then
    v_blocages := array_append(v_blocages, 'Clé de répartition à (re)valider');
  end if;

  return v_blocages;
end;
$function$;
