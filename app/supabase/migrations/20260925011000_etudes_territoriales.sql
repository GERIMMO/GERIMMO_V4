-- Études traçables, indépendantes de la collecte quotidienne. Aucune dépense.
create table public.territory_studies (
 id bigint generated always as identity primary key,
 departement text not null check(departement ~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$' and departement<>'20' and departement<>'975'),
 indicateur text not null check(indicateur in ('concurrence','acquisition')),
 valeur integer not null check(valeur between 0 and 99999999),
 clients integer check(clients>0), depense_cents integer check(depense_cents>=0),
 debut date not null, fin date not null check(fin>=debut),
 source text not null check(length(btrim(source)) between 10 and 1000),
 methode text not null check(length(btrim(methode)) between 20 and 3000),
 cree_par uuid not null references public.accounts(id), created_at timestamptz not null default now(),
 check(indicateur<>'concurrence' or valeur<=9999),
 check(indicateur<>'acquisition' or (clients is not null and depense_cents is not null and valeur=round(depense_cents::numeric/clients)))
);
create index territory_studies_auteur_idx on public.territory_studies(cree_par);
create index territory_studies_recent_idx on public.territory_studies(departement,indicateur,created_at desc,id desc);
alter table public.territory_studies enable row level security;
create policy territory_studies_lecture on public.territory_studies for select to authenticated using(public.is_permanent_super_admin());
revoke all on public.territory_studies from public,anon,authenticated;
grant select on public.territory_studies to authenticated;
grant all on public.territory_studies to service_role;
grant usage,select on sequence public.territory_studies_id_seq to service_role;
create function public.enregistrer_etude_territoriale(p_departement text,p_indicateur text,p_nombre integer,p_depense_cents integer,p_debut date,p_fin date,p_source text,p_methode text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_fin is null or p_debut is null or p_fin>current_date or p_debut>p_fin or p_fin<current_date-400 then raise exception 'Vérifiez les dates de l’étude'; end if;
 if p_nombre is null or p_nombre<0 or (p_indicateur='acquisition' and (p_nombre=0 or p_depense_cents is null or p_depense_cents<0)) then raise exception 'Vérifiez les résultats mesurés'; end if;
 insert into public.territory_studies(departement,indicateur,valeur,clients,depense_cents,debut,fin,source,methode,cree_par)
 values(p_departement,p_indicateur,case when p_indicateur='acquisition' then round(p_depense_cents::numeric/p_nombre)::integer else p_nombre end,
 case when p_indicateur='acquisition' then p_nombre end,case when p_indicateur='acquisition' then p_depense_cents end,p_debut,p_fin,btrim(p_source),btrim(p_methode),(select auth.uid()));
end $$;
revoke all on function public.enregistrer_etude_territoriale(text,text,integer,integer,date,date,text,text) from public,anon;
grant execute on function public.enregistrer_etude_territoriale(text,text,integer,integer,date,date,text,text) to authenticated;
create view public.territory_studies_latest with(security_invoker=true) as
 select distinct on(departement,indicateur) * from public.territory_studies order by departement,indicateur,created_at desc,id desc;
revoke all on public.territory_studies_latest from public,anon;
grant select on public.territory_studies_latest to authenticated,service_role;
