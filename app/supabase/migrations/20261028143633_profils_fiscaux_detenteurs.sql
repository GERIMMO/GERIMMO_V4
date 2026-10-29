-- Le régime appartient au détenteur pour une année, jamais à un appartement isolé.
-- Profils versionnés : aucun montant, ancienne qualification ou journal réécrit.
create table public.fiscal_profils_detenteurs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 person_id uuid not null references public.persons(id),
 annee integer not null check (annee between 1970 and 2200),
 version integer not null check (version > 0),
 qualite text not null check (qualite in ('Personne physique','Indivision (personnes physiques)','SCI familiale','SCI','Personne morale')),
 imposition text not null check (imposition in ('ir','is','a_confirmer')),
 location_nue text not null check (location_nue in ('micro','reel','non_concerne','a_confirmer')),
 location_meublee text not null check (location_meublee in ('micro','reel','non_concerne','a_confirmer')),
 justification text not null check (length(btrim(justification)) between 3 and 1000),
 auteur uuid not null references public.accounts(id),
 cree_le timestamptz not null default now(),
 unique (person_id,annee,version)
);
create index fiscal_profils_detenteurs_org_annee_idx on public.fiscal_profils_detenteurs(organization_id,annee);
create index fiscal_profils_detenteurs_auteur_idx on public.fiscal_profils_detenteurs(auteur);
alter table public.fiscal_profils_detenteurs enable row level security;
revoke all on public.fiscal_profils_detenteurs from public,anon,authenticated;
grant select on public.fiscal_profils_detenteurs to authenticated;
grant all on public.fiscal_profils_detenteurs to service_role;
create policy fiscal_profils_lecture on public.fiscal_profils_detenteurs for select to authenticated
 using (organization_id in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[])));
create trigger abonnement_fiscal_profils_detenteurs before insert or update or delete on public.fiscal_profils_detenteurs
 for each row execute function public.refuser_ecriture_si_fermee();

create function public.enregistrer_profil_fiscal_detenteur(p_personne uuid,p_annee integer,p_imposition text,p_location_nue text,p_location_meublee text,p_justification text)
returns uuid language plpgsql security definer set search_path='' as $$
declare personne public.persons; qualite text; precedent public.fiscal_profils_detenteurs; resultat uuid; nue text; meuble text;
begin
 if auth.uid() is null then raise exception 'Accès refusé'; end if;
 select * into personne from public.persons where id=p_personne for update;
 if personne.id is null or personne.organization_id not in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[])) then raise exception 'Accès refusé'; end if;
 if p_annee is null or p_annee not between 1970 and 2200 then raise exception 'Année invalide'; end if;
 if not exists(select 1 from public.detentions d where d.person_id=p_personne and d.organization_id=personne.organization_id and d.date_debut <= make_date(p_annee,12,31) and (d.date_fin is null or d.date_fin >= make_date(p_annee,1,1))) then raise exception 'Aucune détention enregistrée pour ce propriétaire cette année'; end if;
 qualite:=public.qualite_bailleur_normalisee(personne.qualite);
 if qualite is null or qualite not in ('Personne physique','Indivision (personnes physiques)','SCI familiale','SCI','Personne morale') then raise exception 'Complétez la qualité du propriétaire dans sa fiche'; end if;
 if p_imposition is null or p_imposition not in ('ir','is','a_confirmer') or p_location_nue is null or p_location_nue not in ('micro','reel','non_concerne','a_confirmer') or p_location_meublee is null or p_location_meublee not in ('micro','reel','non_concerne','a_confirmer') then raise exception 'Régime fiscal invalide'; end if;
 if p_imposition='is' and qualite in ('Personne physique','Indivision (personnes physiques)') then raise exception 'L’impôt sur les sociétés concerne la société propriétaire'; end if;
 if qualite in ('SCI familiale','SCI','Personne morale') and (p_location_nue='micro' or p_location_meublee='micro') then raise exception 'Le régime micro ne se choisit pas pour cette société'; end if;
 if qualite='Indivision (personnes physiques)' and p_location_meublee='micro' then raise exception 'La location meublée en indivision relève d’un régime réel'; end if;
 if length(btrim(coalesce(p_justification,''))) not between 3 and 1000 then raise exception 'Indiquez la référence de votre vérification'; end if;
 nue:=case when qualite in ('SCI familiale','SCI','Personne morale') then 'non_concerne' else p_location_nue end;
 meuble:=case when qualite in ('SCI familiale','SCI','Personne morale') then 'non_concerne' else p_location_meublee end;
 select * into precedent from public.fiscal_profils_detenteurs where person_id=p_personne and annee=p_annee order by version desc limit 1;
 if precedent.id is not null and (precedent.qualite,precedent.imposition,precedent.location_nue,precedent.location_meublee,precedent.justification) is not distinct from (qualite,p_imposition,nue,meuble,btrim(p_justification)) then return precedent.id; end if;
 insert into public.fiscal_profils_detenteurs(organization_id,person_id,annee,version,qualite,imposition,location_nue,location_meublee,justification,auteur)
 values(personne.organization_id,p_personne,p_annee,coalesce(precedent.version,0)+1,qualite,p_imposition,nue,meuble,btrim(p_justification),auth.uid()) returning id into resultat;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),personne.organization_id,'profil_fiscal_detenteur',jsonb_build_object('person_id',p_personne,'annee',p_annee,'version',coalesce(precedent.version,0)+1));
 return resultat;
end $$;
revoke all on function public.enregistrer_profil_fiscal_detenteur(uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.enregistrer_profil_fiscal_detenteur(uuid,integer,text,text,text,text) to authenticated;
