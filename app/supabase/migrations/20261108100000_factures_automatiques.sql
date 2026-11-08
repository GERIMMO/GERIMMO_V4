-- Consentement par facture : les encaissements ne sont jamais automatisés.
create table public.factures_automatiques (
 id uuid primary key references public.factures_fourniture(id),
 organization_id uuid not null references public.organizations(id),
 autorise_par uuid not null references public.accounts(id),
 actif boolean not null default true,
 etat text not null default 'a_traiter' check(etat in('a_traiter','releves_attendus','a_verifier','terminee')),
 detail text, updated_at timestamptz not null default now(),
 foreign key(id,organization_id) references public.factures_fourniture(id,organization_id)
);
alter table public.factures_automatiques enable row level security;
revoke all on public.factures_automatiques from anon,authenticated;
grant select on public.factures_automatiques to authenticated;
grant select,update on public.factures_automatiques to service_role;
create policy suivi_auto on public.factures_automatiques for select to authenticated using (
 exists(select 1 from public.factures_fourniture f join public.contrats_fourniture c on c.id=f.contrat_id
 where f.id=factures_automatiques.id and consommations_interne.gerant(f.organization_id,c.bien_id,c.lot_id))
);
create function public.regler_facture_automatique(p_facture uuid,p_actif boolean) returns void
language plpgsql security definer set search_path='' as $$
declare f public.factures_fourniture; c public.contrats_fourniture;
begin
 select * into f from public.factures_fourniture where id=p_facture;
 select * into c from public.contrats_fourniture where id=f.contrat_id;
 if f.id is null or not consommations_interne.gerant(f.organization_id,c.bien_id,c.lot_id) or not public.org_ecriture_ouverte(f.organization_id) then raise exception 'Accès refusé'; end if;
 insert into public.factures_automatiques(id,organization_id,autorise_par,actif)
 values(f.id,f.organization_id,auth.uid(),p_actif)
 on conflict(id) do update set actif=p_actif,autorise_par=auth.uid(),etat=case when factures_automatiques.etat='terminee' then 'terminee' else 'a_traiter' end,detail=null,updated_at=now();
end $$;
revoke all on function public.regler_facture_automatique(uuid,boolean) from public,anon;
grant execute on function public.regler_facture_automatique(uuid,boolean) to authenticated;
-- Le planificateur peut rejouer UNIQUEMENT les gestes de cette facture autorisée.
-- Chaque geste revérifie les droits actuels du consentant et les contrôles métier existants.
create function public.geste_facture_automatique(p_facture uuid,p_geste text,p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.factures_automatiques; f public.factures_fourniture; c public.contrats_fourniture;
 ancien text:=current_setting('request.jwt.claims',true); ancien_sub text:=current_setting('request.jwt.claim.sub',true); resultat jsonb;
begin
 select * into j from public.factures_automatiques where id=p_facture for update;
 if j.id is null or not j.actif then raise exception 'Automatisation désactivée'; end if;
 select * into f from public.factures_fourniture where id=j.id;
 select * into c from public.contrats_fourniture where id=f.contrat_id;
 perform set_config('request.jwt.claims',json_build_object('sub',j.autorise_par,'role','authenticated')::text,true);
 if ancien_sub is not null then perform set_config('request.jwt.claim.sub',j.autorise_par::text,true); end if;
 if not consommations_interne.gerant(j.organization_id,c.bien_id,c.lot_id) or not public.org_ecriture_ouverte(j.organization_id)
 or not exists(select 1 from public.memberships where account_id=j.autorise_par and organization_id=j.organization_id and status='active' and role in('admin_agence','agent','proprietaire_direct'))
 then raise exception 'Autorisation du propriétaire à renouveler'; end if;
 if p_args ? 'p_org' and p_args->>'p_org'<>j.organization_id::text then raise exception 'Organisation incorrecte'; end if;
 if p_args ? 'p_facture' and p_args->>'p_facture'<>j.id::text then raise exception 'Facture incorrecte'; end if;
 if p_args ? 'p_repartition' and not exists(select 1 from public.repartitions_fourniture where id=(p_args->>'p_repartition')::uuid and facture_id=j.id and organization_id=j.organization_id) then raise exception 'Répartition incorrecte'; end if;
 case p_geste
 when 'controle' then resultat:='true';
 when 'preparer_repartition_fourniture' then resultat:=to_jsonb(public.preparer_repartition_fourniture(j.id,p_args->'p_parts',p_args->>'p_motif',p_args->>'p_mode',p_args->'p_reglages'));
 when 'valider_repartition_fourniture' then perform public.valider_repartition_fourniture((p_args->>'p_repartition')::uuid,p_args->>'p_empreinte_attendue');
 when 'demander_index_facture' then perform public.demander_index_facture(j.organization_id,j.id,(p_args->>'p_compteur')::uuid,(p_args->>'p_jour')::date);
 when 'enregistrer_pdf_repartition' then resultat:=to_jsonb(public.enregistrer_pdf_repartition(j.organization_id,(p_args->>'p_repartition')::uuid,(p_args->>'p_bail')::uuid,p_args->>'p_empreinte',p_args->>'p_storage_path',(p_args->>'p_taille')::bigint,p_args->>'p_fichier_empreinte'));
 when 'diffuser_pdf_repartition' then resultat:=to_jsonb(public.diffuser_pdf_repartition(j.organization_id,(p_args->>'p_repartition')::uuid,(p_args->>'p_bail')::uuid));
 when 'suivi' then update public.factures_automatiques set etat=p_args->>'etat',detail=left(p_args->>'detail',500),updated_at=now() where id=j.id;
 else raise exception 'Geste automatique interdit';
 end case;
 perform set_config('request.jwt.claims',coalesce(ancien,''),true);
 if ancien_sub is not null then perform set_config('request.jwt.claim.sub',ancien_sub,true); end if;
 return resultat;
exception when others then
 perform set_config('request.jwt.claims',coalesce(ancien,''),true);
 if ancien_sub is not null then perform set_config('request.jwt.claim.sub',ancien_sub,true); end if;
 raise;
end $$;
revoke all on function public.geste_facture_automatique(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.geste_facture_automatique(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
