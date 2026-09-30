-- 30/09/2026 — une agence souscrite avec 0 lot sous mandat (socle de 39 €)
-- recevait une capacité de 0 : la garde refusait ensuite la création du
-- moindre bien (« Votre abonnement couvre 0 lot sous mandat »). Deux règles :
--  1. le socle couvre ses lots (10) même quand l'agence en gère moins — la
--     capacité enregistrée ne descend jamais sous le socle, quoi que porte
--     la métadonnée Stripe ;
--  2. pour une agence, seuls les lots SOUS MANDAT comptent : créer un bien ou
--     un lot ne coûte rien tant qu'aucun mandat ne le couvre. La garde des
--     biens ne s'applique donc qu'aux particuliers.

create or replace function public.socle_agence_lots()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(max(t.borne_haute), 0)::integer
  from public.tarif_tranches t
  where t.grille = '2026-09-28' and t.public = 'agence' and t.forfait_cents > 0;
$$;
revoke execute on function public.socle_agence_lots() from public, anon;
grant execute on function public.socle_agence_lots() to authenticated, service_role;

create or replace function public.abonnement_details(p_customer text, p_periodicite text, p_formule text, p_unites integer, p_montant_periode_cents bigint, p_periode_debut timestamp with time zone)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_avant integer;
  v_a_couvrir integer;
  v_type public.organization_type;
  v_unites integer := p_unites;
begin
  select a.organization_id, a.unites_souscrites into v_org, v_avant
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then return null; end if;
  if p_periodicite not in ('mensuel', 'annuel') then
    raise exception 'Périodicité inconnue : %', p_periodicite;
  end if;
  -- Règle 1 : le socle d'une agence couvre ses lots, quelle que soit la
  -- capacité annoncée par la métadonnée.
  select o.type into v_type from public.organizations o where o.id = v_org;
  if v_type = 'agence' and v_unites is not null then
    v_unites := greatest(v_unites, public.socle_agence_lots());
  end if;
  update public.abonnements set
    periodicite = p_periodicite,
    formule = nullif(btrim(coalesce(p_formule, '')), ''),
    unites_souscrites = v_unites,
    montant_periode_cents = p_montant_periode_cents,
    montant_mensuel_cents = case when p_periodicite = 'annuel'
      then round(coalesce(p_montant_periode_cents, 0) / 12.0)::bigint
      else coalesce(p_montant_periode_cents, 0) end,
    periode_debut = coalesce(p_periode_debut, periode_debut),
    periodicite_suivante = case when periodicite_suivante = p_periodicite then null
                                else periodicite_suivante end,
    updated_at = now()
  where organization_id = v_org;
  if v_avant is distinct from v_unites then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_capacite',
            jsonb_build_object('avant', v_avant, 'apres', v_unites, 'formule', p_formule,
                               'periodicite', p_periodicite, 'montant_periode_cents', p_montant_periode_cents));
    v_a_couvrir := public.unites_a_couvrir(v_org);
    if v_unites is not null and v_a_couvrir > v_unites then
      insert into public.audit_log (organization_id, action, details)
      values (v_org, 'abonnement_capacite_insuffisante',
              jsonb_build_object('capacite', v_unites, 'a_couvrir', v_a_couvrir));
    end if;
  end if;
  return v_org;
end;
$function$;

-- Règle 2 : la garde des biens ne concerne que les particuliers.
create or replace function public.garde_capacite_biens()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_type public.organization_type;
begin
  select o.type into v_type from public.organizations o where o.id = new.organization_id;
  if v_type = 'agence' then
    return case when tg_op = 'INSERT' then new else null end;
  end if;
  if tg_op = 'INSERT' then
    perform public.garde_capacite(new.organization_id, 1);
    return new;
  end if;
  if old.archived_at is not null and new.archived_at is null then
    perform public.garde_capacite(new.organization_id, 0);
  end if;
  return null;
end;
$function$;

-- Rattrapage : les agences déjà souscrites sous le socle.
update public.abonnements a
set unites_souscrites = public.socle_agence_lots(), updated_at = now()
from public.organizations o
where o.id = a.organization_id
  and o.type = 'agence'
  and o.grille_tarifaire = '2026-09-28'
  and a.stripe_subscription_id is not null
  and a.unites_souscrites is not null
  and a.unites_souscrites < public.socle_agence_lots();
