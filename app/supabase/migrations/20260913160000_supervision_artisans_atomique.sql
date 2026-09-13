-- La file de supervision relisait l'état avant une RPC distincte : deux
-- examens simultanés pouvaient tous deux accepter « en_attente », puis
-- écraser leurs décisions. Cette entrée dédiée verrouille la fiche avant de
-- contrôler la transition. Les fonctions métier existantes restent intactes.
create function public.traiter_inscription_artisan_atomique(
  p_artisan uuid,
  p_operation text,
  p_motif text default null,
  p_verification_effectuee boolean default false,
  p_pieces_relues boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut public.artisan_statut_plateforme;
  v_siret public.artisan_siret_etat;
  v_attendu public.artisan_statut_plateforme;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé à la supervision Gerimmo.';
  end if;
  if p_operation is null or p_operation not in
    ('verifier_siret', 'validation', 'refus', 'remise_en_attente') then
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
  v_attendu := case when p_operation = 'remise_en_attente'
    then 'refuse' else 'en_attente' end;
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
  end if;
  if p_operation = 'refus' and length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Indiquez le motif objectif du refus : il sera visible par l’artisan.';
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

revoke execute on function public.traiter_inscription_artisan_atomique(uuid, text, text, boolean, boolean)
  from public, anon;
grant execute on function public.traiter_inscription_artisan_atomique(uuid, text, text, boolean, boolean)
  to authenticated;

comment on function public.traiter_inscription_artisan_atomique(uuid, text, text, boolean, boolean) is
  'Examen d’inscription par le super admin : état contrôlé sous verrou, confirmations explicites, trace et opération métier dans la même transaction. Ne remplace pas les règles d’assurance propres aux interventions.';
