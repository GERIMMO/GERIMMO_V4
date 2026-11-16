-- Deux avis nommés. Leurs preuves s'ajoutent aux contrôles existants.
alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_avant_avis_echeances;
revoke all on function public.empreinte_avant_avis_echeances(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare a record; adresse text;
begin
  case p_contexte->>'type'
  when 'fin_essai_choisi' then
    select * into a from public.abonnement_courrier_contexte(p_org,true);
    if not found or a.stripe_statut is distinct from 'trialing' or a.cgu_version is null or a.cgu_acceptee_le is null
      or a.stripe_subscription_id is distinct from p_contexte->>'id' or a.organisation is distinct from p_contexte->>'organisation'
      or a.periode_fin is distinct from (p_contexte->>'fin')::timestamptz or a.periode_fin<=now()
      or a.montant_periode_cents is distinct from (p_contexte->>'montant')::bigint or a.montant_periode_cents<=0
      or not exists(select from public.abonnements b where b.organization_id=p_org and not b.annulation_demandee
                    and b.stripe_customer_id=p_contexte->>'client' for share)
    then return null; end if;
    adresse:=a.destinataire;
  when 'avertissement_inactivite' then
    if p_org is not null or p_contexte->>'version' is distinct from '2026-10-24' then return null; end if;
    select r.* into a from public.comptes_inactifs_a_prevenir('2026-10-24',1000) r
      join auth.users u on u.id=r.account_id and u.email_confirmed_at is not null and u.deleted_at is null
        and (u.banned_until is null or u.banned_until<=now()) and lower(btrim(r.email))=lower(btrim(u.email))
      where r.account_id=(p_contexte->>'id')::uuid and r.etape=p_contexte->>'etape';
    if not found or a.derniere_activite_le is distinct from (p_contexte->>'activite')::timestamptz
      or a.suppression_le is distinct from (p_contexte->>'suppression')::date
      or a.nature is distinct from p_contexte->>'nature' or a.organisation is distinct from p_contexte->>'organisation'
      or a.titulaire is distinct from (p_contexte->>'titulaire')::boolean then return null; end if;
    adresse:=a.email;
  else return public.empreinte_avant_avis_echeances(p_org,p_contexte);
  end case;
  if adresse is null or encode(sha256(convert_to(lower(btrim(adresse)),'UTF8')),'hex') is distinct from p_contexte->>'destinataire' then return null; end if;
  return encode(sha256(convert_to(p_contexte::text,'UTF8')),'hex');
end $$;
revoke all on function public.empreinte_metier_courriel(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.empreinte_metier_courriel(uuid,jsonb) to service_role;

create unique index courriel_avis_essai_unique on public.courriels_durables
 ((contexte_metier->>'id'),(contexte_metier->>'fin')) where contexte_metier->>'type'='fin_essai_choisi';
create unique index courriel_preavis_inactivite_unique on public.courriels_durables
 ((contexte_metier->>'id'),(contexte_metier->>'etape'),(contexte_metier->>'activite')) where contexte_metier->>'type'='avertissement_inactivite';

alter function public.finaliser_courriel_metier(text) rename to finaliser_avant_avis_echeances;
revoke all on function public.finaliser_avant_avis_echeances(text) from public,anon,authenticated,service_role;
create function public.finaliser_courriel_metier(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables; c jsonb; a record;
begin
  select * into m from public.courriels_durables where id=p_id for update;
  c:=m.contexte_metier;
  if c is null or c->>'type' not in ('fin_essai_choisi','avertissement_inactivite') then return public.finaliser_avant_avis_echeances(p_id); end if;
  if m.finalisation_etat='terminee' then return true; end if;
  if m.fournisseur_id is null or m.etat not in ('accepte','livre') then return false; end if;
  if c->>'type'='avertissement_inactivite' then
    if m.etat<>'livre' then return false; end if;
    -- Une livraison tardive prolonge le délai minimum. Une reconnexion, un nouvel abonnement ou un
    -- changement de destinataire interdit de consigner un préavis pour une éventuelle suppression.
    select r.* into a from public.comptes_inactifs_a_prevenir('2026-10-24',1000) r
      join auth.users u on u.id=r.account_id and u.email_confirmed_at is not null and u.deleted_at is null
        and lower(btrim(r.email))=lower(btrim(u.email)) and (u.banned_until is null or u.banned_until<=now())
      where r.account_id=(c->>'id')::uuid and r.etape=c->>'etape'
        and r.derniere_activite_le=(c->>'activite')::timestamptz
        and r.nature is not distinct from c->>'nature' and r.organisation is not distinct from c->>'organisation'
        and r.titulaire is not distinct from (c->>'titulaire')::boolean
        and encode(sha256(convert_to(lower(btrim(r.email)),'UTF8')),'hex')=c->>'destinataire';
    if not found then
      update public.courriels_durables set finalisation_etat='a_verifier',motif='Préavis livré, situation du compte à vérifier' where id=p_id;
      return false;
    end if;
    perform public.avertissement_inactivite_envoye(a.account_id,a.etape,a.derniere_activite_le,greatest(a.suppression_le,(c->>'suppression')::date));
  end if;
  update public.courriels_durables set finalisation_etat='terminee',motif=null where id=p_id;
  insert into public.courriels_evenements(courrier_id,etat) values(p_id,'finalisation_terminee');
  return true;
end $$;
revoke all on function public.finaliser_courriel_metier(text) from public,anon,authenticated;
grant execute on function public.finaliser_courriel_metier(text) to service_role;

create or replace function public.courriels_finalisations_a_reprendre() returns setof public.courriels_durables
language sql security definer set search_path='' as $$
 select * from public.courriels_durables where etat in ('accepte','livre') and finalisation_etat='en_attente'
 and (etat='livre' or (contexte_metier->>'type' is distinct from 'avertissement_inactivite'
      and (contexte_metier->>'type' is distinct from 'relance_abonnement' or contexte_metier->>'palier' is distinct from '0')))
 order by updated_at limit 20;
$$;
