-- ══════════════════════════════════════════════════════════════════════════
-- Réclamer une fiche artisan exige une preuve (audit du 27/09, bloquant n° 1)
-- ══════════════════════════════════════════════════════════════════════════
--
-- LE DÉFAUT. `inscrire_mon_entreprise_artisan` rattachait au compte appelant
-- toute fiche dont le SIRET correspondait et qui n'avait pas encore de compte
-- (`account_id is null`, c'est-à-dire une fiche créée par une agence). Le SIRET
-- est une information publique : n'importe quel compte connecté — un
-- locataire, un propriétaire inscrit en trente secondes — prenait la fiche,
-- héritait de son statut `valide`, voyait les missions (adresse, occupant et
-- son téléphone) et réécrivait au passage le mobile et l'e-mail de la fiche,
-- si bien que l'agence appelait ensuite l'usurpateur (preuve : aap-reclame.sql).
--
-- CE QUE DIT LE WIKI. Module 8 (sources/2026-07-24-gerimmo-v3-module-8-artisans,
-- affirmation 1) : « l'agence crée la fiche, l'artisan la maîtrise » — l'agence
-- pose la fiche puis INVITE l'artisan (module 16). Décision du 2026-09-04
-- (personas/Artisan, note « pivot assumé ») : l'artisan s'auto-inscrit et le
-- Super Admin VALIDE l'inscription avant toute première affectation.
--
-- LA RÈGLE POSÉE ICI (la plus sûre compatible avec le parcours existant,
-- qui n'a pas de jeton d'invitation artisan) :
--  1. La réclamation n'est admise que si l'adresse e-mail CONFIRMÉE du compte
--     est celle que l'agence a enregistrée sur la fiche. C'est l'équivalent
--     d'une invitation : seul celui qui lit cette boîte peut réclamer.
--  2. Elle ne réécrit JAMAIS le mobile ni l'e-mail de la fiche : ce sont les
--     coordonnées que l'agence connaît ; l'artisan les modifiera ensuite par
--     les voies prévues.
--  3. Une fiche `valide` repasse `en_attente` : réclamer, c'est s'inscrire, et
--     le Super Admin valide toute inscription (décision du 2026-09-04). Une
--     fiche `refuse` le reste — réclamer ne lève pas un refus.
--  4. Tout autre cas (e-mail différent, fiche déjà rattachée à un compte,
--     fiche sans e-mail) reçoit le MÊME message, qui ne dit pas lequel : on ne
--     révèle pas si la fiche a déjà un titulaire.
--
-- Rejouable : `create or replace`, même signature, mêmes droits.

create or replace function public.inscrire_mon_entreprise_artisan(
  p_raison_sociale text,
  p_siret text,
  p_telephone text,
  p_email text,
  p_metiers public.artisan_metier[],
  p_codes_postaux text[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artisan uuid;
  v_fiche record;
  v_email_compte text;
  v_email_confirme boolean;
begin
  if (select auth.uid()) is null then raise exception 'Accès refusé'; end if;
  if public.mon_artisan_id() is not null then
    raise exception 'Votre compte porte déjà une fiche artisan';
  end if;
  if coalesce(array_length(p_metiers, 1), 0) = 0 then
    raise exception 'Choisissez au moins un métier';
  end if;
  if length(trim(coalesce(p_telephone, ''))) = 0 then
    raise exception 'Votre mobile est obligatoire — c''est par lui qu''on vous joint sur le chantier';
  end if;

  select * into v_fiche from public.artisans a where a.siret = trim(p_siret) for update;

  if found then
    -- RM-8.1.5 : le SIRET est unique — la fiche existante se RÉCLAME, elle ne
    -- se duplique pas. Mais seulement sur preuve (voir l'en-tête).
    select lower(trim(u.email)), u.email_confirmed_at is not null
      into v_email_compte, v_email_confirme
    from auth.users u where u.id = (select auth.uid());

    if v_fiche.account_id is not null
       or v_fiche.email is null
       or not coalesce(v_email_confirme, false)
       or lower(trim(v_fiche.email)) is distinct from v_email_compte then
      raise exception 'Ce SIRET ne peut pas être inscrit depuis ce compte. Si une agence a créé votre fiche, connectez-vous avec l''adresse e-mail qu''elle a enregistrée pour vous ; sinon, écrivez-nous depuis la page Assistance.';
    end if;

    update public.artisans
    set account_id = (select auth.uid()),
        -- Réclamer, c'est s'inscrire : la supervision revalide (pivot du
        -- 2026-09-04). Un refus reste un refus.
        statut_plateforme = case when statut_plateforme = 'valide'
                                 then 'en_attente'::public.artisan_statut_plateforme
                                 else statut_plateforme end,
        statut_decide_le = case when statut_plateforme = 'valide' then null else statut_decide_le end,
        statut_decide_par = case when statut_plateforme = 'valide' then null else statut_decide_par end,
        purge_prevue_le = coalesce(purge_prevue_le, (current_date + interval '6 months')::date)
    where id = v_fiche.id
    returning id into v_artisan;
  else
    insert into public.artisans
      (account_id, raison_sociale, siret, telephone, email, purge_prevue_le)
    values ((select auth.uid()), trim(p_raison_sociale), trim(p_siret),
            trim(p_telephone), nullif(trim(coalesce(p_email, '')), ''),
            (current_date + interval '6 months')::date)
    returning id into v_artisan;
  end if;

  insert into public.artisan_metiers (artisan_id, metier)
  select v_artisan, unnest(p_metiers) on conflict do nothing;
  insert into public.artisan_zones (artisan_id, code_postal)
  select v_artisan, trim(unnest(coalesce(p_codes_postaux, array[]::text[])))
  on conflict do nothing;
  return v_artisan;
exception when unique_violation then
  -- Course entre deux inscriptions du même SIRET : même message neutre.
  raise exception 'Ce SIRET ne peut pas être inscrit depuis ce compte. Si une agence a créé votre fiche, connectez-vous avec l''adresse e-mail qu''elle a enregistrée pour vous ; sinon, écrivez-nous depuis la page Assistance.';
end;
$$;

revoke execute on function public.inscrire_mon_entreprise_artisan(
  text, text, text, text, public.artisan_metier[], text[]) from public, anon;
grant execute on function public.inscrire_mon_entreprise_artisan(
  text, text, text, text, public.artisan_metier[], text[]) to authenticated;

select public.fermer_fonctions_a_anon();
