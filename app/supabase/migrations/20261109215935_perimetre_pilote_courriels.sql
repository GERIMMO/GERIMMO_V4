begin;
alter table public.courriels_durables add column circuit text;
create function public.suspendre_courriel_pilote(p_id text,p_org uuid,p_empreinte text,p_circuit text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables; raison constant text := 'Pilote limité : intervention humaine requise ; aucun nouvel envoi autorisé';
begin
 if p_circuit is null or p_circuit !~ '^[a-z0-9_./-]{1,120}$' then raise exception 'Circuit invalide'; end if;
 insert into public.courriels_durables(id,organization_id,empreinte,etat,circuit,motif,reprise_autonome)
 values(p_id,p_org,p_empreinte,'en_attente',p_circuit,raison,false) on conflict do nothing;
 select * into m from public.courriels_durables where id=p_id for update;
 if m.organization_id is distinct from p_org or m.empreinte<>p_empreinte then raise exception 'Intention incompatible'; end if;
 -- Ne jamais effacer une preuve acceptée/inconnue ni consommer les tentatives pendant la suspension.
 update public.courriels_durables set reprise_autonome=false,circuit=coalesce(circuit,p_circuit),motif=raison where id=p_id;
 if not exists(select 1 from public.courriels_evenements where courrier_id=p_id and etat='pilote_intervention_requise') then
  insert into public.courriels_evenements(courrier_id,etat) values(p_id,'pilote_intervention_requise');
 end if;
 return jsonb_build_object('etat',m.etat,'fournisseur_id',m.fournisseur_id);
end $$;
revoke all on function public.suspendre_courriel_pilote(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.suspendre_courriel_pilote(text,uuid,text,text) to service_role;
-- Garde d'autorisation de l'émetteur relue avec les données actuelles.
-- Les anciens contextes sont conservés pour le rapprochement ; la porte pilote exige
-- un acteur pour les envois manuels, ou le consentement automatique de l'organisation.
alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_metier_courriel_document;
create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 if p_contexte ? 'acteur' and not exists(
  select 1 from public.memberships where organization_id=p_org and account_id=(p_contexte->>'acteur')::uuid
  and status='active' and role in ('proprietaire_direct','admin_agence')
 ) then return null; end if;
 return public.empreinte_metier_courriel_document(p_org,p_contexte);
end $$;
revoke all on function public.empreinte_metier_courriel(uuid,jsonb),public.empreinte_metier_courriel_document(uuid,jsonb) from public,anon,authenticated,service_role;
commit;
