-- La première clé peut couvrir une période passée. Les validations déjà enregistrées restent immuables.
create or replace function public.valider_cle_repartition(
  p_bien uuid, p_mode public.cle_mode, p_lignes jsonb, p_date_effet date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bien record;
  v_total numeric := 0;
  v_ligne jsonb;
  v_cle uuid;
  v_nb_lots int;
begin
  select * into v_bien from public.biens where id = p_bien for update;
  if not found then raise exception 'Bien introuvable'; end if;

  if p_date_effet is null or p_date_effet > public.aujourdhui_paris() then
    raise exception 'Indiquez la date à laquelle la clé est entrée en vigueur, au plus tard aujourd’hui.';
  end if;
  if p_date_effet < public.aujourdhui_paris() and exists (
    select 1 from public.cles_repartition where bien_id = p_bien
  ) then
    raise exception 'Une clé existe déjà pour ce bien. Son historique est conservé ; seule la première clé peut être antidatée.';
  end if;
  if p_mode = 'tantiemes' and exists (
    select 1 from public.lots where bien_id = p_bien and etat <> 'archive' and coalesce(tantieme,0)<=0
  ) then
    raise exception 'Renseignez les tantièmes de chaque lot avant de valider cette clé.';
  end if;

  select count(*) into v_nb_lots from public.lots
  where bien_id = p_bien and etat <> 'archive';
  if jsonb_array_length(p_lignes) is distinct from v_nb_lots or (select count(distinct (l->>'lot_id')::uuid) from jsonb_array_elements(p_lignes) l)
     <> v_nb_lots
     or exists (
       select 1 from jsonb_array_elements(p_lignes) l
       where (l->>'lot_id')::uuid not in
         (select id from public.lots where bien_id = p_bien and etat <> 'archive')
     ) then
    raise exception 'La clé doit couvrir exactement les % lots actifs du bien', v_nb_lots;
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_total := v_total + round((v_ligne->>'pourcentage')::numeric, 2);
  end loop;
  if round(v_total, 2) <> 100.00 then
    raise exception 'La somme des pourcentages fait %, il faut exactement 100 (RM-0.4.1)', v_total;
  end if;

  update public.cles_repartition set invalidated_at = now()
  where bien_id = p_bien and invalidated_at is null;

  insert into public.cles_repartition (bien_id, organization_id, mode, created_by, date_effet)
  values (p_bien, v_bien.organization_id, p_mode, (select auth.uid()), p_date_effet)
  returning id into v_cle;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    insert into public.cle_repartition_lignes (cle_id, lot_id, pourcentage)
    values (v_cle, (v_ligne->>'lot_id')::uuid, round((v_ligne->>'pourcentage')::numeric, 2));
  end loop;

  return v_cle;
end;
$$;
revoke all on function public.valider_cle_repartition(uuid,public.cle_mode,jsonb,date) from public,anon;
grant execute on function public.valider_cle_repartition(uuid,public.cle_mode,jsonb,date) to authenticated,service_role;

-- Les clients existants conservent la signature et la date par défaut.
create or replace function public.valider_cle_repartition(p_bien uuid,p_mode public.cle_mode,p_lignes jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select public.valider_cle_repartition(p_bien,p_mode,p_lignes,public.aujourdhui_paris());
$$;
