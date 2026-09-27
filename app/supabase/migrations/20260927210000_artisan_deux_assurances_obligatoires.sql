-- DÉCISION DU PORTEUR DU 27/09 : LES DEUX ASSURANCES SONT OBLIGATOIRES.
--
-- L'audit console du 27/09 avait retenu « au moins une assurance en cours »
-- (décennale OU RC pro) entre deux sources qui divergeaient : la page
-- [[Artisan]] (décision du 04/09 : l'artisan dépose RC pro ET décennale) et le
-- module 8 (seule la décennale bloque, selon la nature des travaux). Le
-- porteur a tranché le 27/09 : une inscription ne se valide qu'avec une
-- décennale valide ET une RC pro en cours. Le message dit laquelle manque.
--
-- La règle d'affectation par nature de travaux (`decennale_requise`) ne change
-- pas : elle continue de retirer des listes un artisan dont la décennale expire.
--
-- Idempotent : create or replace, mêmes signatures, mêmes droits.

create or replace function public.artisan_assurance_deposee(p_artisan uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.artisan_decennale_valide(p_artisan) and exists (
    select 1 from public.artisan_pieces p
    where p.artisan_id = p_artisan and p.type = 'rc_pro' and p.retiree_le is null
      and (p.expire_le is null or p.expire_le >= current_date));
$$;
revoke all on function public.artisan_assurance_deposee(uuid) from public, anon, authenticated;
grant execute on function public.artisan_assurance_deposee(uuid) to service_role;

create or replace function public.traiter_inscription_artisan_atomique(
  p_artisan uuid, p_operation text, p_motif text default null,
  p_verification_effectuee boolean default false, p_pieces_relues boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_statut public.artisan_statut_plateforme;
  v_siret public.artisan_siret_etat;
  v_attendu public.artisan_statut_plateforme;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé à la supervision Gerimmo.';
  end if;
  if p_operation is null or p_operation not in
    ('verifier_siret', 'validation', 'refus', 'remise_en_attente', 'suspension') then
    raise exception 'Choisissez une décision proposée sur cet écran.';
  end if;

  select a.statut_plateforme, a.siret_etat
    into v_statut, v_siret
    from public.artisans a
    where a.id = p_artisan
    for update;
  if not found then
    raise exception 'Inscription introuvable.';
  end if;
  v_attendu := case p_operation when 'remise_en_attente' then 'refuse'
    when 'suspension' then 'valide' else 'en_attente' end;
  if v_statut <> v_attendu then
    raise exception 'Cette inscription a déjà changé d’état. Rechargez la page.';
  end if;
  if p_operation = 'verifier_siret' and p_verification_effectuee is distinct from true then
    raise exception 'Confirmez avoir vérifié le SIRET avant d’enregistrer ce constat.';
  end if;
  if p_operation = 'validation' then
    if v_siret <> 'verifie' then
      raise exception 'Vérifiez d’abord le SIRET.';
    end if;
    if p_pieces_relues is distinct from true then
      raise exception 'Confirmez avoir relu les justificatifs avant de valider l’inscription.';
    end if;
    -- Décision du porteur (27/09) : décennale ET RC pro en cours, toutes deux.
    if public.artisan_assurance_deposee(p_artisan) is not true then
      raise exception 'Une inscription se valide avec une décennale ET une RC pro en cours : il manque %. Demandez le justificatif à l’artisan.',
        case
          when not public.artisan_decennale_valide(p_artisan) and not exists (
            select 1 from public.artisan_pieces p where p.artisan_id = p_artisan and p.type = 'rc_pro'
              and p.retiree_le is null and (p.expire_le is null or p.expire_le >= current_date))
            then 'la décennale et la RC pro'
          when not public.artisan_decennale_valide(p_artisan) then 'la décennale'
          else 'la RC pro' end;
    end if;
  end if;
  if p_operation in ('refus', 'suspension') and length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Indiquez le motif objectif : il sera visible par l’artisan.';
  end if;

  -- La trace et la décision sont validées ensemble. Une panne de la trace
  -- empêche la mutation ; une décision refusée ne laisse pas de faux succès.
  perform public.log_sa_access(null, 'examen_inscription_artisan',
    jsonb_build_object('artisan_id', p_artisan, 'operation_demandee', p_operation));
  if p_operation = 'verifier_siret' then
    perform public.artisan_definir_siret_etat(p_artisan, 'verifie');
  else
    perform public.artisan_decider_plateforme(p_artisan,
      p_operation::public.artisan_decision_plateforme, nullif(trim(coalesce(p_motif, '')), ''));
  end if;
end;
$$;
