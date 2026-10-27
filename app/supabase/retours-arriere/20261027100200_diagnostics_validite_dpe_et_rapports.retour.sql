-- Retour de 20261027100200_diagnostics_validite_dpe_et_rapports.sql. Remettre le code précédent avant ce retour : le code
-- de la migration appelle diagnostics_a_renouveler (bibliothèque Documents).
-- Conserve les pièces déjà reclassées en « Diagnostic » (leur diagnostic les cite ; la liste est dans audit_log, action
-- « document_reclasse_diagnostic ») et ne touche à aucune échéance enregistrée (la migration n'en réécrit aucune).
-- RÉINTRODUIT : un DPE réalisé avant le 01/07/2021 et saisi « valable dix ans » lève de nouveau le blocage de mise en
-- location ; un rapport rangé en « Autre » ne se reclasse plus.
begin;
set local lock_timeout = '10s';

drop trigger if exists diagnostics_reclasser_rapport on public.diagnostics;
drop function if exists public.reclasser_rapport_diagnostic();
drop function if exists public.diagnostics_a_renouveler(uuid, date, uuid[]);

-- Texte de 20260802_lot_blocages_habitation_inclut_immeuble.sql.
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

-- Texte en vigueur avant la migration (20260830120000, tête d'arrêt d'urgence de 20261014200000).
create or replace function public.generer_alertes_diagnostics()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_diag record;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_diagnostics: reserve au cron et au super admin';
  end if;
  -- Audit du 14/10 (SUP-01) : l'arrêt d'urgence couvre aussi cette tâche pg_cron. Arrêt actif : aucun effet.
  if not public.tache_planifiee_autorisee('alertes-diagnostics-quotidiennes') then
    return 0;
  end if;

  for v_diag in
    select d.id, d.organization_id, d.type, d.date_expiration,
           coalesce(l.nom, b2.nom) as cible,
           coalesce(b.nom, b2.nom) as bien_nom
    from public.diagnostics d
    left join public.lots l on l.id = d.lot_id
    left join public.biens b on b.id = l.bien_id
    left join public.biens b2 on b2.id = d.bien_id
    where d.archived_at is null and d.date_expiration is not null
      and d.date_expiration <= current_date + 90
  loop
    v_seuil := case
      when v_diag.date_expiration <= current_date then 'J+0'
      when v_diag.date_expiration <= current_date + 30 then 'J-30'
      else 'J-90'
    end;
    v_criticite := case v_seuil
      when 'J+0' then 'critique'::public.alerte_criticite
      when 'J-30' then 'normale'::public.alerte_criticite
      else 'informative'::public.alerte_criticite
    end;
    v_crees := v_crees + public.poser_alerte_seuil(
      v_diag.organization_id, 'diagnostic_expiration', 'diagnostic_id', v_diag.id, v_seuil,
      v_criticite,
      format('%s — %s : %s',
        upper(v_diag.type::text), v_diag.bien_nom,
        case when v_seuil = 'J+0'
          then 'diagnostic expiré (bail bloqué tant qu''il n''est pas redéposé)'
          else format('expire le %s', to_char(v_diag.date_expiration, 'DD/MM/YYYY')) end),
      jsonb_build_object('diagnostic_id', v_diag.id, 'type_diagnostic', v_diag.type),
      v_diag.date_expiration);
  end loop;

  return v_crees;
end;
$function$;

drop function if exists public.echeance_reglementaire_diagnostic(text, date, date);
notify pgrst, 'reload schema';
delete from supabase_migrations.schema_migrations where version = '20261027100200';
commit;
