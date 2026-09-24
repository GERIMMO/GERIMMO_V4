create table public.regulatory_watch (
 id uuid primary key default gen_random_uuid(), source_url text not null unique,
 titre text not null check(length(titre) between 5 and 300), source_nom text not null,
 publie_source_le timestamptz, reperage_le timestamptz not null default now(),
 publics text[] not null default '{}', resume text, action_conseillee text, application_le date,
 date_a_confirmer boolean not null default true,
 statut text not null default 'a_examiner' check(statut in ('a_examiner','publie','ecarte')),
 valide_par uuid references public.accounts(id), valide_le timestamptz,
 check(source_url ~ '^https://(www\.)?(service-public\.gouv\.fr|entreprendre\.service-public\.gouv\.fr|anil\.org|legifrance\.gouv\.fr|economie\.gouv\.fr|impots\.gouv\.fr|urssaf\.fr)/[^[:space:]]+$'),
 check(publics <@ array['artisan','bailleur','agence','locataire']::text[]),
 check(statut<>'publie' or (valide_par is not null and valide_le is not null and cardinality(publics)>0 and coalesce(length(btrim(resume))>=20,false) and coalesce(length(btrim(action_conseillee))>=10,false)))
);
create index regulatory_watch_auteur_idx on public.regulatory_watch(valide_par);
create index regulatory_watch_file_idx on public.regulatory_watch(statut,reperage_le desc);
alter table public.regulatory_watch enable row level security;
create policy regulatory_watch_lecture on public.regulatory_watch for select to authenticated using(public.is_permanent_super_admin());
revoke all on public.regulatory_watch from public,anon,authenticated;
grant select on public.regulatory_watch to authenticated;
grant select,insert on public.regulatory_watch to service_role;
create function public.decider_veille(p_id uuid,p_publier boolean,p_resume text,p_action text,p_publics text[],p_application date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_publier is null then raise exception 'Choisissez une décision'; end if;
 if p_publier and (p_resume is null or length(btrim(p_resume)) not between 20 and 2000 or p_action is null or length(btrim(p_action)) not between 10 and 2000 or coalesce(cardinality(p_publics),0)=0) then raise exception 'Complétez le résumé, l’action et les publics'; end if;
 update public.regulatory_watch set statut=case when p_publier then 'publie' else 'ecarte' end,
 resume=case when p_publier then btrim(p_resume) else resume end,
 action_conseillee=case when p_publier then btrim(p_action) else action_conseillee end,
 publics=case when p_publier then p_publics else publics end,application_le=p_application,date_a_confirmer=p_application is null,
 valide_par=(select auth.uid()),valide_le=now() where id=p_id;
 if not found then raise exception 'Information introuvable'; end if;
end $$;
revoke all on function public.decider_veille(uuid,boolean,text,text,text[],date) from public,anon;
grant execute on function public.decider_veille(uuid,boolean,text,text,text[],date) to authenticated;
insert into public.agent_missions(cle) values('veille');
-- La veille propose une évolution, jamais une modification de code implicite.
create unique index development_proposals_veille_unique on public.development_proposals(source_id) where source='veille_reglementaire';
alter table public.regulatory_watch add column etude jsonb, add column analyse_le timestamptz, add column analyse_erreur text, add column analyse_tentee_le timestamptz;
create function public.conserver_etude_veille(p_id uuid,p_analyse jsonb) returns void language plpgsql security definer set search_path='' as $$
declare info public.regulatory_watch;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Réservé au traitement de veille'; end if;
 if jsonb_typeof(p_analyse) is distinct from 'object' or length(p_analyse::text)>20000 or p_analyse->>'id' is distinct from p_id::text then raise exception 'Étude invalide'; end if;
 select * into info from public.regulatory_watch where id=p_id and analyse_le is null and statut='a_examiner' for update;
 if not found then return; end if;
 update public.regulatory_watch set etude=p_analyse,analyse_le=now(),analyse_erreur=null,analyse_tentee_le=now() where id=p_id;
 if length(btrim(coalesce(p_analyse->>'evolution','')))>=20 then
  insert into public.development_proposals(source,source_id,titre,probleme,solution_proposee,risque,statut,autorisation_requise)
  values('veille_reglementaire',p_id,'Adapter Gerimmo : '||left(info.titre,150),
    'Étude préparée par Gerimmo, à vérifier avant développement.'||E'\nSource : '||info.source_url||E'\nConstat : '||(p_analyse->>'resume')||E'\nIncertitudes : '||coalesce(p_analyse->>'incertitudes','À examiner'),
    (p_analyse->>'evolution')||E'\nBénéfice utilisateur : '||coalesce(p_analyse->>'benefice','À préciser')||E'\nContrôles prévus : '||coalesce(p_analyse->>'controles','À définir'),
    'moyen','a_etudier',true) on conflict(source_id) where source='veille_reglementaire' do nothing;
 end if;
end $$;
revoke all on function public.conserver_etude_veille(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.conserver_etude_veille(uuid,jsonb) to service_role;
-- La collecte peut consigner un échec d’étude, jamais publier une information.
grant update(analyse_erreur,analyse_tentee_le) on public.regulatory_watch to service_role;

-- Projection explicite : les conclusions de travail restent réservées à la supervision,
-- même lorsque le résumé relu est diffusé. La vue ne lit que les champs validés.
create view public.regulatory_watch_published with (security_barrier=true) as
 select id,titre,resume,action_conseillee,publics,source_nom,source_url,application_le,valide_le
 from public.regulatory_watch where statut='publie' and (select auth.uid()) is not null;
revoke all on public.regulatory_watch_published from public,anon,authenticated;
grant select on public.regulatory_watch_published to authenticated;
