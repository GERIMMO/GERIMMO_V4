-- Réutilise la réservation durable, le contrôle avant transport et la finalisation
-- sans transport. Un changement de destinataire ne crée pas un deuxième avis.
create unique index courriel_reconduction_unique on public.courriels_durables
 (organization_id,(contexte_metier->>'id')) where contexte_metier->>'type'='reconduction';

alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_metier_avant_reconduction;
create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare a record; u uuid; sub text;
begin
 if p_contexte->>'type' is distinct from 'reconduction' then
   return public.empreinte_metier_avant_reconduction(p_org,p_contexte);
 end if;
 select * into a from public.abonnements_avis_reconduction_dus(500) where organization_id=p_org;
 if not found or a.periode_fin is distinct from (p_contexte->>'id')::timestamptz
 or a.organisation is distinct from p_contexte->>'organisation'
 or a.montant_periode_cents is null or a.montant_periode_cents is distinct from (p_contexte->>'montant')::bigint
 or a.formule is distinct from p_contexte->>'formule'
 or a.unites_souscrites is distinct from (p_contexte->>'unites')::int
 or a.periodicite_suivante is distinct from p_contexte->>'suivante'
 or encode(sha256(convert_to(lower(btrim(a.destinataire)),'UTF8')),'hex') is distinct from p_contexte->>'destinataire'
 then return null; end if;
 select t.id into u from auth.users t join public.memberships m on m.account_id=t.id
 where m.organization_id=p_org and m.status='active' and m.role='proprietaire_direct'
 and t.deleted_at is null and t.email_confirmed_at is not null and (t.banned_until is null or t.banned_until<=now())
 and lower(btrim(t.email))=lower(btrim(a.destinataire)) limit 1;
 if u is null then return null; end if;
 select stripe_subscription_id into sub from public.abonnements where organization_id=p_org;
 return encode(sha256(convert_to(jsonb_build_array(to_jsonb(a),u,sub)::text,'UTF8')),'hex');
end $$;

alter function public.finaliser_courriel_metier(text) rename to finaliser_metier_avant_reconduction;
create function public.finaliser_courriel_metier(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 select * into m from public.courriels_durables where id=p_id for update;
 if not found then return false; end if;
 if m.contexte_metier->>'type' is distinct from 'reconduction' then return public.finaliser_metier_avant_reconduction(p_id); end if;
 if m.etat not in ('accepte','livre') or m.fournisseur_id is null then return false; end if;
 if m.finalisation_etat='terminee' then return true; end if;
 perform 1 from public.abonnements where organization_id=m.organization_id for update;
 if not public.verifier_contexte_courriel(p_id) then return false; end if;
 perform public.abonnement_avis_reconduction_envoye(m.organization_id,(m.contexte_metier->>'id')::timestamptz);
 update public.courriels_durables set finalisation_etat='terminee',motif=null where id=p_id;
 insert into public.courriels_evenements(courrier_id,etat) values(p_id,'finalisation_terminee');
 return true;
end $$;
revoke all on function public.empreinte_metier_avant_reconduction(uuid,jsonb), public.empreinte_metier_courriel(uuid,jsonb),
 public.finaliser_metier_avant_reconduction(text), public.finaliser_courriel_metier(text) from public,anon,authenticated,service_role;
grant execute on function public.finaliser_courriel_metier(text) to service_role;
