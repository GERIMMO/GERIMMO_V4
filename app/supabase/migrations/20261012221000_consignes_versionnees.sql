-- SA002 : directives structurées sans IA. Le texte n'est jamais exécuté.
-- Les seules tâches permises collectent des compteurs internes, sans effet métier.
create table public.supervision_consignes (
 id uuid primary key default gen_random_uuid(), version_courante integer not null default 1,
 suspendue boolean not null default false, cree_par uuid not null references public.accounts(id), cree_le timestamptz not null default now()
);
create table public.supervision_consignes_versions (
 id uuid primary key default gen_random_uuid(), consigne_id uuid not null references public.supervision_consignes(id),
 numero integer not null check(numero>0), titre text not null check(length(btrim(titre)) between 3 and 120),
 texte text not null check(length(btrim(texte)) between 3 and 4000),
 mission text not null references public.agent_missions(cle), debut timestamptz not null, fin timestamptz not null check(fin>debut),
 responsable uuid not null references public.accounts(id), budget_total integer not null check(budget_total between 1 and 100),
 budget_mensuel integer not null check(budget_mensuel between 1 and 100),
 auteur uuid not null references public.accounts(id), cree_le timestamptz not null default now(), unique(consigne_id,numero)
);
create table public.supervision_consignes_accords (
 version_id uuid primary key references public.supervision_consignes_versions(id), accepte boolean not null,
 auteur uuid not null references public.accounts(id), cree_le timestamptz not null default now()
);
create table public.supervision_consignes_taches (
 id uuid primary key default gen_random_uuid(), version_id uuid not null references public.supervision_consignes_versions(id),
 type text not null check(type in ('lecture_passages','lecture_missions')),
 etat text not null default 'proposee' check(etat in ('proposee','approuvee','reussie','annulee')),
 preuve jsonb, executee_le timestamptz, executee_par uuid references public.accounts(id),
 unique(version_id,type)
);
create table public.supervision_operations (
 id uuid primary key default gen_random_uuid(), objet uuid, action text not null, auteur uuid references public.accounts(id),
 cree_le timestamptz not null default now(), details jsonb not null default '{}'
);
create function public.responsable_supervision_habilite(p_compte uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where account_id=p_compte and role='super_admin' and organization_id is null and status='active');
$$;
create function public.supervision_version_immuable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Une version ou une approbation est immuable : créez une nouvelle version'; end $$;
create trigger consigne_version_immuable before update or delete on public.supervision_consignes_versions for each row execute function public.supervision_version_immuable();
create trigger consigne_accord_immuable before update or delete on public.supervision_consignes_accords for each row execute function public.supervision_version_immuable();

create function public.enregistrer_consigne(p_id uuid,p_version_attendue integer,p_titre text,p_texte text,p_mission text,p_debut timestamptz,p_fin timestamptz,p_responsable uuid,p_budget_total integer,p_budget_mensuel integer,p_types text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_num integer; v_version uuid; t text;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Supervision permanente et double vérification requises'; end if;
 if public.responsable_supervision_habilite(p_responsable) is not true then raise exception 'Le responsable doit déjà être habilité'; end if;
 if p_debut is null or p_fin is null or not isfinite(p_debut) or not isfinite(p_fin) or p_fin<=p_debut or p_fin<=now() then raise exception 'Dates de validité incohérentes ou terminées'; end if;
 if p_types is null or cardinality(p_types)>2 or exists(select 1 from unnest(p_types) x where x is null or x not in ('lecture_passages','lecture_missions')) then raise exception 'Seules les tâches de lecture connues sont autorisées'; end if;
 if p_id is null then
  if p_version_attendue is distinct from 0 then raise exception 'Version initiale attendue : zéro'; end if;
  insert into public.supervision_consignes(cree_par) values(auth.uid()) returning id into v_id;v_num:=1;
 else
  select id,version_courante+1 into v_id,v_num from public.supervision_consignes where id=p_id and version_courante=p_version_attendue for update;
  if v_id is null then raise exception 'La consigne a changé : rechargez sa dernière version'; end if;
  update public.supervision_consignes set version_courante=v_num where id=v_id;
  update public.supervision_consignes_taches set etat='annulee' where version_id in(select id from public.supervision_consignes_versions where consigne_id=v_id) and etat in ('proposee','approuvee');
 end if;
 insert into public.supervision_consignes_versions(consigne_id,numero,titre,texte,mission,debut,fin,responsable,budget_total,budget_mensuel,auteur)
 values(v_id,v_num,btrim(p_titre),btrim(p_texte),p_mission,p_debut,p_fin,p_responsable,p_budget_total,p_budget_mensuel,auth.uid()) returning id into v_version;
 foreach t in array p_types loop
  insert into public.supervision_consignes_taches(version_id,type) values(v_version,t) on conflict(version_id,type) do nothing;
 end loop;
 insert into public.supervision_operations(objet,action,auteur,details) values(v_id,'consigne_version',auth.uid(),jsonb_build_object('version',v_num,'taches',cardinality(p_types)));
 return v_version;
end $$;
create function public.decider_consigne(p_version uuid,p_accepter boolean) returns void language plpgsql security definer set search_path='' as $$
declare v public.supervision_consignes_versions;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Supervision permanente et double vérification requises'; end if;
 select v1.* into v from public.supervision_consignes_versions v1 join public.supervision_consignes c on c.id=v1.consigne_id where v1.id=p_version and c.version_courante=v1.numero and not c.suspendue for update of c;
 if v.id is null or v.fin<=now() or not public.responsable_supervision_habilite(v.responsable) then raise exception 'Version remplacée, suspendue, expirée ou responsable non habilité'; end if;
 if p_accepter is null then raise exception 'Décision requise'; end if;
 if exists(select 1 from public.supervision_consignes_accords where version_id=p_version and accepte is distinct from p_accepter) then raise exception 'Décision déjà enregistrée ; créez une nouvelle version'; end if;
 insert into public.supervision_consignes_accords(version_id,accepte,auteur) values(p_version,p_accepter,auth.uid()) on conflict do nothing;
 update public.supervision_consignes_taches set etat=case when p_accepter then 'approuvee' else 'annulee' end where version_id=p_version and etat='proposee';
 insert into public.supervision_operations(objet,action,auteur,details) values(p_version,'consigne_decision',auth.uid(),jsonb_build_object('accepte',p_accepter));
end $$;
create function public.suspendre_consigne(p_id uuid,p_suspendre boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Supervision permanente et double vérification requises'; end if;
 if p_suspendre is null then raise exception 'Choisissez suspension ou reprise'; end if;
 update public.supervision_consignes set suspendue=p_suspendre where id=p_id;
 if not found then raise exception 'Consigne inconnue'; end if;
 insert into public.supervision_operations(objet,action,auteur,details) values(p_id,'consigne_suspension',auth.uid(),jsonb_build_object('suspendue',p_suspendre));
end $$;
create function public.executer_tache_consigne(p_tache uuid,p_plan uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.supervision_consignes_taches; v public.supervision_consignes_versions; c public.supervision_consignes; resultat jsonb;
begin
 if auth.role() is distinct from 'service_role' and public.is_permanent_super_admin() is not true then raise exception 'Accès refusé'; end if;
 select * into t from public.supervision_consignes_taches where id=p_tache;
 select * into v from public.supervision_consignes_versions where id=t.version_id;
 select * into c from public.supervision_consignes where id=v.consigne_id for update;
 select * into t from public.supervision_consignes_taches where id=p_tache for update;
 if t.id is null then raise exception 'Tâche inconnue'; end if;
 if not public.responsable_supervision_habilite(v.responsable) then raise exception 'Responsable non habilité : exécution bloquée'; end if;
 if t.etat='reussie' then return t.preuve; end if;
 if c.suspendue or c.version_courante<>v.numero or t.etat<>'approuvee' or not exists(select 1 from public.supervision_consignes_accords where version_id=v.id and accepte) then raise exception 'Version non approuvée, remplacée ou suspendue'; end if;
 if now()<v.debut or now()>=v.fin then raise exception 'Consigne hors période de validité'; end if;
 if (select count(*) from public.supervision_consignes_taches z join public.supervision_consignes_versions q on q.id=z.version_id where q.consigne_id=c.id and z.etat='reussie')>=v.budget_total
 or (select count(*) from public.supervision_consignes_taches z join public.supervision_consignes_versions q on q.id=z.version_id where q.consigne_id=c.id and z.etat='reussie' and date_trunc('month',z.executee_le at time zone 'Europe/Paris')=date_trunc('month',now() at time zone 'Europe/Paris'))>=v.budget_mensuel then raise exception 'Budget de lectures épuisé'; end if;
 -- La fonction de contrôle est fournie par la migration SA003 qui suit.
 if p_plan is not null and not exists(select 1 from public.supervision_vacances where id=p_plan and consigne_version=v.id) then raise exception 'La tâche ne fait pas partie de ce plan'; end if;
 if public.verifier_arret_supervision('consignes',p_plan) is not true then raise exception 'Arrêt demandé : aucun nouvel effet'; end if;
 if t.type='lecture_passages' then
  select jsonb_build_object('source','agent_passages','mission',v.mission,'total',count(*),'a_reprendre',count(*) filter(where etat='a_reprendre'),'depuis',v.debut,'observe_le',now()) into resultat from public.agent_passages where mission=v.mission and debut>=v.debut;
 elsif t.type='lecture_missions' then
  select jsonb_build_object('source','agent_missions','mission',cle,'active',active,'observe_le',now()) into resultat from public.agent_missions where cle=v.mission;
 else raise exception 'Type de tâche interdit'; end if;
 update public.supervision_consignes_taches set etat='reussie',preuve=resultat,executee_le=now(),executee_par=auth.uid() where id=t.id;
 insert into public.supervision_operations(objet,action,auteur,details) values(t.id,'consigne_executee',auth.uid(),jsonb_build_object('version',v.id,'type',t.type,'plan',p_plan));
 return resultat;
end $$;
-- Les tables sont lisibles uniquement par la supervision permanente AAL2.
do $$ declare n text; begin
 foreach n in array array['supervision_consignes','supervision_consignes_versions','supervision_consignes_accords','supervision_consignes_taches','supervision_operations'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('create policy supervision_lecture on public.%I for select to authenticated using(public.is_permanent_super_admin())',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
  execute format('grant select on public.%I to authenticated,service_role',n);
 end loop;
end $$;
revoke all on function public.responsable_supervision_habilite(uuid),public.supervision_version_immuable() from public,anon,authenticated;
revoke all on function public.enregistrer_consigne(uuid,integer,text,text,text,timestamptz,timestamptz,uuid,integer,integer,text[]),public.decider_consigne(uuid,boolean),public.suspendre_consigne(uuid,boolean),public.executer_tache_consigne(uuid,uuid) from public,anon;
grant execute on function public.enregistrer_consigne(uuid,integer,text,text,text,timestamptz,timestamptz,uuid,integer,integer,text[]),public.decider_consigne(uuid,boolean),public.suspendre_consigne(uuid,boolean),public.executer_tache_consigne(uuid,uuid) to authenticated;
grant execute on function public.executer_tache_consigne(uuid,uuid) to service_role;
