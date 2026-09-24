create table public.agent_missions (
 cle text primary key, active boolean not null default true,
 modifie_par uuid references public.accounts(id), updated_at timestamptz not null default now()
);
create index agent_missions_auteur_idx on public.agent_missions(modifie_par);
insert into public.agent_missions(cle) values ('quittances'),('appels'),('relances'),('rappels'),('abonnements'),('signatures'),('marketing'),('territoire');
create table public.agent_passages (
 id uuid primary key default gen_random_uuid(), mission text not null references public.agent_missions(cle),
 debut timestamptz not null default now(), fin timestamptz, expiration timestamptz not null default now()+interval '5 minutes',
 etat text not null default 'en_cours' check(etat in ('en_cours','reussi','a_reprendre','interrompu')),
 resume text, compte integer not null default 0 check(compte>=0)
);
create index agent_passages_mission_idx on public.agent_passages(mission,debut desc);
alter table public.agent_missions enable row level security;
alter table public.agent_passages enable row level security;
create policy missions_lecture on public.agent_missions for select to authenticated using(public.is_permanent_super_admin());
create policy passages_lecture on public.agent_passages for select to authenticated using(public.is_permanent_super_admin());
revoke all on public.agent_missions,public.agent_passages from public,anon,authenticated;
grant select on public.agent_missions,public.agent_passages to authenticated;
grant all on public.agent_missions,public.agent_passages to service_role;
create function public.regler_mission(p_cle text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_active is null then raise exception 'Choisissez pause ou reprise'; end if;
 update public.agent_missions set active=p_active,modifie_par=(select auth.uid()),updated_at=now() where cle=p_cle;
 if not found then raise exception 'Mission inconnue'; end if;
end $$;
revoke all on function public.regler_mission(text,boolean) from public,anon;
grant execute on function public.regler_mission(text,boolean) to authenticated;
create function public.commencer_mission(p_cle text) returns uuid language plpgsql security definer set search_path='' as $$
declare identifiant uuid; ouverte boolean;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Accès réservé au traitement'; end if;
 select active into ouverte from public.agent_missions where cle=p_cle for update;
 if ouverte is distinct from true then return null; end if;
 update public.agent_passages set etat='interrompu',fin=now(),resume='Le traitement a été interrompu. Le prochain passage reprendra les éléments restants.' where mission=p_cle and etat='en_cours' and expiration<=now();
 if exists(select 1 from public.agent_passages where mission=p_cle and etat='en_cours') then return null; end if;
 insert into public.agent_passages(mission) values(p_cle) returning id into identifiant;return identifiant;
end $$;
create function public.terminer_mission(p_id uuid,p_ok boolean,p_compte integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Accès réservé au traitement'; end if;
 update public.agent_passages set fin=now(),etat=case when p_ok is true then 'reussi' else 'a_reprendre' end,
 resume=case when p_ok is true then 'Passage terminé. Les éléments admissibles ont été traités.' else 'Une difficulté demande une vérification dans la santé du service.' end,
 compte=greatest(0,coalesce(p_compte,0)) where id=p_id and etat='en_cours' and expiration>now();
end $$;
revoke all on function public.commencer_mission(text),public.terminer_mission(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.commencer_mission(text),public.terminer_mission(uuid,boolean,integer) to service_role;
