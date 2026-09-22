create table public.continuity_plan (
 id boolean primary key default true check(id), delai_jours integer not null default 7 check(delai_jours between 1 and 90),
 responsable uuid references public.accounts(id), consignes text not null default '' check(length(consignes)<=3000),
 updated_at timestamptz not null default now(), modifie_par uuid references public.accounts(id)
);
create index continuity_plan_responsable_idx on public.continuity_plan(responsable);
create index continuity_plan_auteur_idx on public.continuity_plan(modifie_par);
insert into public.continuity_plan(id) values(true);
alter table public.continuity_plan enable row level security;
create policy continuity_plan_lecture on public.continuity_plan for select to authenticated using(public.is_permanent_super_admin());
revoke all on public.continuity_plan from public,anon,authenticated;
grant select on public.continuity_plan to authenticated;
grant all on public.continuity_plan to service_role;
create function public.enregistrer_plan_continuite(p_email text,p_jours integer,p_consignes text) returns void language plpgsql security definer set search_path='' as $$
declare compte uuid;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_jours is null or p_jours not between 1 and 90 or length(coalesce(p_consignes,''))>3000 then raise exception 'Délai ou consignes invalides'; end if;
 if nullif(btrim(p_email),'') is not null then
  select a.id into compte from public.accounts a where lower(a.email)=lower(btrim(p_email))
    and exists(select 1 from public.memberships m where m.account_id=a.id and m.role='super_admin' and m.organization_id is null and m.status='active');
  if compte is null or compte=(select auth.uid()) then raise exception 'Désignez un autre superviseur permanent déjà habilité'; end if;
 end if;
 update public.continuity_plan set responsable=compte,delai_jours=p_jours,consignes=coalesce(p_consignes,''),modifie_par=(select auth.uid()),updated_at=now() where id;
end $$;
create function public.etat_continuite() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare derniere timestamptz; plan public.continuity_plan; nom text;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 select * into plan from public.continuity_plan where id;
 select max(s.derniere_presence) into derniere from public.supervision_presence s
 where exists(select 1 from public.memberships m where m.account_id=s.account_id and m.role='super_admin' and m.organization_id is null and m.status='active');
 select email into nom from public.accounts where id=plan.responsable;
 return jsonb_build_object('derniere_presence',derniere,'absence',derniere is not null and derniere<now()-make_interval(days=>plan.delai_jours),
 'responsable',nom,'delai_jours',plan.delai_jours,'consignes',plan.consignes,
 'responsable_habilite',exists(select 1 from public.memberships where account_id=plan.responsable and role='super_admin' and organization_id is null and status='active'));
end $$;
revoke all on function public.enregistrer_plan_continuite(text,integer,text),public.etat_continuite() from public,anon;
grant execute on function public.enregistrer_plan_continuite(text,integer,text),public.etat_continuite() to authenticated;
alter table public.continuity_plan add column absence_signalee_le timestamptz;
create function public.surveiller_continuite() returns void language plpgsql security definer set search_path='' as $$
declare derniere timestamptz; plan public.continuity_plan;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Accès réservé au traitement'; end if;
 select * into plan from public.continuity_plan where id for update;
 select max(s.derniere_presence) into derniere from public.supervision_presence s where exists(select 1 from public.memberships m where m.account_id=s.account_id and m.role='super_admin' and m.organization_id is null and m.status='active');
 if derniere is null then return; end if;
 if derniere<now()-make_interval(days=>plan.delai_jours) and plan.absence_signalee_le is null then
  update public.continuity_plan set absence_signalee_le=now() where id;
  perform public.log_tech('absence_supervision',jsonb_build_object('resultat','Absence prolongée : les traitements déjà autorisés continuent ; les décisions sensibles attendent un responsable habilité.'));
 elsif derniere>=now()-make_interval(days=>plan.delai_jours) and plan.absence_signalee_le is not null then
  update public.continuity_plan set absence_signalee_le=null where id;
 end if;
end $$;
revoke all on function public.surveiller_continuite() from public,anon,authenticated;
grant execute on function public.surveiller_continuite() to service_role;
