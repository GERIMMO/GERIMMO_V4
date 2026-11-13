-- Le processus prépare les calculs et PDF. La validation et la diffusion
-- gardent leurs RPC authentifiées avec les contrôles métier existants.
create or replace function public.geste_facture_automatique(p_facture uuid,p_geste text,p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.factures_automatiques where id=p_facture and jeton=(p_args->>'_jeton')::uuid and verrou_jusqua>now() for update;
 if not found then raise exception 'Réservation expirée ou absente'; end if;
 if p_geste in ('valider_repartition_fourniture','diffuser_pdf_repartition') then
   raise exception 'Confirmation du propriétaire requise.';
 end if;
 return public.geste_facture_automatique_metier(p_facture,p_geste,p_args-'_jeton');
end $$;

create function consommations_interne.reveiller_apres_validation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.factures_automatiques set revision=revision+1, disponible_le=now(), tentatives=0,
   etat=case when verrou_jusqua>now() then etat else 'a_traiter' end
 where id=new.facture_id and organization_id=new.organization_id and actif;
 return new;
end $$;
revoke all on function consommations_interne.reveiller_apres_validation() from public, anon, authenticated, service_role;
create trigger factures_reveil_validation after update of statut on public.repartitions_fourniture
for each row when (new.statut='validee' and old.statut is distinct from new.statut)
execute function consommations_interne.reveiller_apres_validation();
