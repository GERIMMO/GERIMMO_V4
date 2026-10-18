-- Supervision : coûts déclarés, journal immuable et annuaire complet.
create table public.supervision_couts (
 id uuid primary key default gen_random_uuid(),
 fournisseur text not null check(length(btrim(fournisseur)) between 2 and 120),
 categorie text not null check(categorie in ('hebergement','ia','email','signature','marketing','autre')),
 jour date not null,
 montant_cents bigint not null check(montant_cents between -1000000000 and 1000000000 and montant_cents<>0),
 reference text not null check(length(btrim(reference)) between 2 and 200),
 preuve text not null check(length(btrim(preuve)) between 3 and 2000),
 auteur uuid not null default auth.uid() references public.accounts(id),
 cree_le timestamptz not null default now(),
 unique(fournisseur,reference)
);
create index supervision_couts_jour on public.supervision_couts(jour,id);
alter table public.supervision_couts enable row level security;
revoke all on public.supervision_couts from anon,authenticated;
grant select,insert on public.supervision_couts to authenticated;
create policy couts_superviseur on public.supervision_couts for select to authenticated using ((select public.is_permanent_super_admin()));
create policy couts_ajout on public.supervision_couts for insert to authenticated with check ((select public.is_permanent_super_admin()) and auteur=(select auth.uid()));
comment on table public.supervision_couts is 'Registre immuable des coûts payés en EUR, montant TTC signé ; correction par avoir référencé, aucun paiement déclenché.';
create function public.supervision_total_couts(p_debut date,p_fin date) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('total',coalesce(sum(montant_cents),0),'nombre',count(*))
 from public.supervision_couts where jour>=p_debut and jour<p_fin and (select public.is_permanent_super_admin());
$$;
revoke all on function public.supervision_total_couts(date,date) from public,anon;
grant execute on function public.supervision_total_couts(date,date) to authenticated;
-- Une ligne par compte ; les fiches sans compte restent retrouvables séparément.
-- Vue invoker : ne contourne aucune RLS et exige en plus le superviseur permanent.
create view public.supervision_utilisateurs with (security_invoker=true) as
with identites as (
 select 'compte:'||a.id as cle,a.id as account_id,null::uuid as person_id,null::uuid as artisan_id,
 coalesce((select nullif(string_agg(distinct concat_ws(' ',p.prenom,p.nom),' / '), '') from public.persons p where p.account_id=a.id),a.email) as nom,
 a.email,a.created_at,false as archive
 from public.accounts a
 union all
 select 'personne:'||p.id,null,p.id,null,concat_ws(' ',p.prenom,p.nom),p.email,p.created_at,p.archived_at is not null from public.persons p where p.account_id is null
 union all
 select 'artisan:'||a.id,null,null,a.id,a.raison_sociale,a.email,a.created_at,false from public.artisans a where a.account_id is null
), appartenances as (
 select case when p.account_id is null then 'personne:'||p.id else 'compte:'||p.account_id end as cle,
 null::text as role,p.organization_id as org,'fiche'::text as etat from public.persons p
 union all
 select 'compte:'||m.account_id as cle,case when m.role::text like 'proprietaire_%' then 'proprietaire' when m.role::text='super_admin' then 'superviseur' else m.role::text end as role,m.organization_id as org,m.status::text as etat from public.memberships m
 union all
 select 'compte:'||d.account_id,'superviseur_delegue',null::uuid,case when not d.active or d.revoquee_le is not null then 'révoqué' when d.termine_le<=now() then 'expiré' when d.commence_le>now() then 'à venir' else 'actif' end from public.supervision_delegations d
 union all
 select case when p.account_id is null then 'personne:'||p.id else 'compte:'||p.account_id end,
 'proprietaire',p.organization_id,'fiche' from public.persons p where exists(select 1 from public.detentions d where d.person_id=p.id)
 union all
 select case when p.account_id is null then 'personne:'||p.id else 'compte:'||p.account_id end,
 'locataire',p.organization_id,'fiche' from public.persons p where exists(select 1 from public.baux b where b.locataire_principal=p.id) or exists(select 1 from public.bail_personnes b where b.person_id=p.id and b.role='colocataire')
 union all
 select case when p.account_id is null then 'personne:'||p.id else 'compte:'||p.account_id end,
 'garant',p.organization_id,'fiche' from public.persons p where exists(select 1 from public.bail_personnes b where b.person_id=p.id and b.role='garant')
 union all
 select case when a.account_id is null then 'artisan:'||a.id else 'compte:'||a.account_id end,'artisan',null,a.statut_plateforme::text from public.artisans a
), liens as (
 select cle,array_remove(array_agg(distinct role),null) as roles,array_remove(array_agg(distinct org),null) as organisations,string_agg(distinct etat,', ') as etats from appartenances group by cle
)
select i.*,case when cardinality(l.roles)>0 then l.roles else array['sans_role']::text[] end as roles,coalesce(l.organisations,array[]::uuid[]) as organisations,
 coalesce(l.etats,'Fiche sans accès') as etats,
 coalesce((select string_agg(distinct o.name,' · ') from public.organizations o where o.id=any(l.organisations)),'') as espaces,
 coalesce((select p.organization_id from public.persons p where p.id=i.person_id),null) as organization_id
from identites i left join liens l using(cle) where (select public.is_permanent_super_admin());
revoke all on public.supervision_utilisateurs from anon,authenticated;
grant select on public.supervision_utilisateurs to authenticated;
create table public.supervision_executions_decisions (
 id uuid primary key default gen_random_uuid(), decision_id uuid not null references public.decisions_du_matin(id),
 accord boolean not null, etat text not null default 'en_cours' check(etat in ('en_cours','reussie','echec')),
 resultat text check(length(resultat)<=2000), commence_le timestamptz not null default now(),termine_le timestamptz,
 auteur uuid not null default auth.uid() references public.accounts(id)
);
create unique index supervision_decision_en_cours on public.supervision_executions_decisions(decision_id) where etat='en_cours';
create index supervision_execution_decision_date on public.supervision_executions_decisions(decision_id,commence_le desc);
alter table public.supervision_executions_decisions enable row level security;
revoke all on public.supervision_executions_decisions from anon,authenticated;
grant select,insert on public.supervision_executions_decisions to authenticated;
grant update(etat,resultat,termine_le) on public.supervision_executions_decisions to authenticated;
create policy executions_lecture on public.supervision_executions_decisions for select to authenticated using ((select public.is_permanent_super_admin()));
create policy executions_creation on public.supervision_executions_decisions for insert to authenticated with check((select public.is_permanent_super_admin()) and auteur=(select auth.uid()) and etat='en_cours' and termine_le is null);
create policy executions_resultat on public.supervision_executions_decisions for update to authenticated using ((select public.is_permanent_super_admin()) and etat='en_cours' and auteur=(select auth.uid())) with check ((select public.is_permanent_super_admin()) and etat in ('reussie','echec') and termine_le is not null);
-- Paramètres publics de l'éditeur : valeurs métier uniquement, jamais de secret.
create table public.supervision_identite (
 singleton boolean primary key default true check(singleton), revision integer not null default 0,
 valeurs jsonb not null default '{}' check(jsonb_typeof(valeurs)='object' and octet_length(valeurs::text)<20000),
 modifie_le timestamptz not null default now(),modifie_par uuid references public.accounts(id)
);
insert into public.supervision_identite(singleton) values(true);
alter table public.supervision_identite enable row level security;
revoke all on public.supervision_identite from anon,authenticated;
grant select on public.supervision_identite to anon,authenticated;
grant update(valeurs,revision) on public.supervision_identite to authenticated;
create policy identite_publique on public.supervision_identite for select to anon,authenticated using(true);
create policy identite_admin on public.supervision_identite for update to authenticated using((select public.is_permanent_super_admin())) with check((select public.is_permanent_super_admin()));

create table public.supervision_prospects (
 id uuid primary key default gen_random_uuid(),nom text not null check(length(btrim(nom)) between 2 and 160),
 email text not null check(length(email) between 3 and 254),telephone text check(length(telephone)<=50),
 origine text not null check(length(origine) between 2 and 160),demande_id uuid unique references public.demandes_devis(id),
 etape text not null default 'nouveau' check(etape in ('nouveau','qualifie','demonstration','offre','gagne','perdu')),
 responsable uuid references public.accounts(id),prochaine_action text check(length(prochaine_action)<=1000),echeance date,
 organisation_id uuid references public.organizations(id),notes text not null default '' check(length(notes)<=4000),
 revision integer not null default 0,cree_le timestamptz not null default now(),modifie_le timestamptz not null default now(),
 auteur uuid not null default auth.uid() references public.accounts(id),
 check(etape<>'gagne' or organisation_id is not null),
 check(etape<>'perdu' or length(btrim(notes))>=5),
 check(etape in ('gagne','perdu') or (coalesce(length(btrim(prochaine_action)),0)>=3 and echeance is not null))
);
create index supervision_prospects_echeance on public.supervision_prospects(etape,echeance,id);
alter table public.supervision_prospects enable row level security;
revoke all on public.supervision_prospects from anon,authenticated;
grant select,insert on public.supervision_prospects to authenticated;
grant update(nom,email,telephone,origine,etape,responsable,prochaine_action,echeance,organisation_id,notes,revision) on public.supervision_prospects to authenticated;
create policy prospects_lecture on public.supervision_prospects for select to authenticated using((select public.is_permanent_super_admin()));
create policy prospects_creation on public.supervision_prospects for insert to authenticated with check((select public.is_permanent_super_admin()) and auteur=(select auth.uid()));
create policy prospects_modification on public.supervision_prospects for update to authenticated using((select public.is_permanent_super_admin())) with check((select public.is_permanent_super_admin()));

create table public.supervision_registre (
 id uuid primary key default gen_random_uuid(),objet text not null,objet_id text not null,
 avant jsonb,apres jsonb not null,auteur uuid not null default auth.uid() references public.accounts(id),cree_le timestamptz not null default now()
);
create index supervision_registre_objet_date on public.supervision_registre(objet,objet_id,cree_le desc);
alter table public.supervision_registre enable row level security;
revoke all on public.supervision_registre from anon,authenticated;
grant select,insert on public.supervision_registre to authenticated;
create policy registre_lecture on public.supervision_registre for select to authenticated using((select public.is_permanent_super_admin()));
create policy registre_ajout on public.supervision_registre for insert to authenticated with check((select public.is_permanent_super_admin()) and auteur=(select auth.uid()));

create function public.supervision_tracer_modification() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.revision<>old.revision+1 then raise exception 'Version périmée : rechargez avant de modifier';end if;
  new.modifie_le:=now();
 end if;
 if tg_table_name='supervision_identite' then new.modifie_par:=(select auth.uid());end if;
 insert into public.supervision_registre(objet,objet_id,avant,apres)
 values(tg_table_name,coalesce(to_jsonb(new)->>'id','identite'),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function public.supervision_tracer_modification() from public,anon,authenticated;
create trigger supervision_identite_trace before update on public.supervision_identite for each row execute function public.supervision_tracer_modification();
create trigger supervision_prospect_trace before insert or update on public.supervision_prospects for each row execute function public.supervision_tracer_modification();
create trigger supervision_cout_trace before insert on public.supervision_couts for each row execute function public.supervision_tracer_modification();
revoke select on public.supervision_identite from anon;
grant select(singleton,valeurs) on public.supervision_identite to anon;
alter table public.supervision_identite add constraint identite_champs_connus check (
 valeurs - array['denomination','forme','capital','siege','rcs','siret','tvaIntracommunautaire','directeurPublication','email','telephone','mediateurNom','mediateurAdresse','mediateurSite']::text[] = '{}'::jsonb
);

revoke select on public.supervision_identite from authenticated;
grant select(singleton,valeurs,revision,modifie_le) on public.supervision_identite to authenticated;

-- Preuve distincte : sa mise à jour ne révoque pas l'accord sur le code contrôlé.
alter table public.development_proposals add column preuve_publication jsonb not null default '{}' check(jsonb_typeof(preuve_publication)='object' and octet_length(preuve_publication::text)<4000);
