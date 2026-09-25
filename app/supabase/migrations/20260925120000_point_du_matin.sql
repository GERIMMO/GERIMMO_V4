-- 25/09 : le point du matin par équipe (E1) et le bilan réel des passages (B1).
-- Un point par jour et par équipe, généré à la fin de chaque passage ; ses
-- décisions portent chacune leur statut, leur auteur, leur date et un motif.
-- Lecture et décision réservées au superviseur permanent (double vérification).

-- B1 : le passage garde ses comptes réels, pas une phrase constante.
alter table public.agent_passages add column bilan jsonb;
drop function public.terminer_mission(uuid,boolean,integer);
create function public.terminer_mission(p_id uuid,p_ok boolean,p_compte integer,p_bilan jsonb default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Accès réservé au traitement'; end if;
 update public.agent_passages set fin=now(),etat=case when p_ok is true then 'reussi' else 'a_reprendre' end,
 resume=case when p_ok is true then 'Passage terminé.' else 'Passage à vérifier.' end,
 bilan=case when jsonb_typeof(p_bilan)='object' and length(p_bilan::text)<=4000 then p_bilan end,
 compte=greatest(0,coalesce(p_compte,0)) where id=p_id and etat='en_cours' and expiration>now();
end $$;
revoke all on function public.terminer_mission(uuid,boolean,integer,jsonb) from public,anon,authenticated;
grant execute on function public.terminer_mission(uuid,boolean,integer,jsonb) to service_role;

create table public.points_du_matin (
 id uuid primary key default gen_random_uuid(),
 jour date not null, equipe text not null check(length(equipe) between 2 and 40),
 statut text not null default 'a_lire' check(statut in ('a_lire','lu')),
 contenu jsonb not null default '{}'::jsonb,
 genere_le timestamptz not null default now(), lu_le timestamptz, lu_par uuid references public.accounts(id),
 unique(jour,equipe)
);
create index points_du_matin_jour_idx on public.points_du_matin(jour desc,equipe);
create index points_du_matin_lecteur_idx on public.points_du_matin(lu_par);
create table public.decisions_du_matin (
 id uuid primary key default gen_random_uuid(),
 point_id uuid not null references public.points_du_matin(id) on delete cascade,
 cle text not null check(length(cle) between 3 and 120),
 titre text not null check(length(titre) between 3 and 200), pourquoi text not null check(length(pourquoi)<=2000),
 options jsonb not null default '[]'::jsonb, recommandation text check(length(recommandation)<=500), lien text check(length(lien)<=300),
 -- gestes : ce que le point peut faire seul {validation, refus, attestation}, décidé à l'assemblage.
 gestes jsonb not null default '{}'::jsonb,
 source text not null check(source in ('developpement','publication','artisan','retour','veille')), source_id uuid,
 -- sans_objet : la file d'origine ne l'attend plus (tranchée sur son écran).
 statut text not null default 'en_attente' check(statut in ('en_attente','validee','refusee','sans_objet')),
 decide_par uuid references public.accounts(id), decide_le timestamptz, motif text check(length(motif)<=1000),
 cree_le timestamptz not null default now(),
 unique(point_id,cle)
);
create index decisions_du_matin_statut_idx on public.decisions_du_matin(statut,cree_le desc);
create index decisions_du_matin_auteur_idx on public.decisions_du_matin(decide_par);
alter table public.points_du_matin enable row level security;
alter table public.decisions_du_matin enable row level security;
create policy points_du_matin_lecture on public.points_du_matin for select to authenticated using(public.is_permanent_super_admin());
create policy decisions_du_matin_lecture on public.decisions_du_matin for select to authenticated using(public.is_permanent_super_admin());
revoke all on public.points_du_matin,public.decisions_du_matin from public,anon,authenticated;
grant select on public.points_du_matin,public.decisions_du_matin to authenticated;
grant all on public.points_du_matin,public.decisions_du_matin to service_role;

-- Le traitement (fin de passage) ou le superviseur (« Préparer le point ») assemble
-- le point ; les décisions déjà tranchées ne sont jamais réécrites.
create function public.enregistrer_point_du_matin(p_jour date,p_equipe text,p_contenu jsonb,p_decisions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare identifiant uuid; d jsonb; nouveautes boolean:=false; cles text[]:='{}';
begin
 if (select auth.role()) is distinct from 'service_role' and public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_jour is null or jsonb_typeof(p_contenu) is distinct from 'object' or length(p_contenu::text)>20000 then raise exception 'Point invalide'; end if;
 if jsonb_typeof(coalesce(p_decisions,'[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(p_decisions,'[]'::jsonb))>100 then raise exception 'Décisions invalides'; end if;
 insert into public.points_du_matin(jour,equipe,contenu) values(p_jour,p_equipe,p_contenu)
 on conflict(jour,equipe) do update set contenu=excluded.contenu,genere_le=now() returning id into identifiant;
 for d in select * from jsonb_array_elements(coalesce(p_decisions,'[]'::jsonb)) loop
  cles:=cles||(d->>'cle');
  insert into public.decisions_du_matin(point_id,cle,titre,pourquoi,options,recommandation,lien,gestes,source,source_id)
  values(identifiant,d->>'cle',left(d->>'titre',200),left(coalesce(d->>'pourquoi',''),2000),coalesce(d->'options','[]'::jsonb),left(d->>'recommandation',500),left(d->>'lien',300),coalesce(d->'gestes','{}'::jsonb),d->>'source',nullif(d->>'source_id','')::uuid)
  on conflict(point_id,cle) do nothing;
  if found then nouveautes:=true;
  else update public.decisions_du_matin set titre=left(d->>'titre',200),pourquoi=left(coalesce(d->>'pourquoi',''),2000),options=coalesce(d->'options','[]'::jsonb),recommandation=left(d->>'recommandation',500),lien=left(d->>'lien',300),gestes=coalesce(d->'gestes','{}'::jsonb)
   where point_id=identifiant and cle=d->>'cle' and statut='en_attente'; end if;
 end loop;
 update public.decisions_du_matin set statut='sans_objet',decide_le=now() where point_id=identifiant and statut='en_attente' and not (cle=any(cles));
 if nouveautes then update public.points_du_matin set statut='a_lire',lu_le=null,lu_par=null where id=identifiant; end if;
 return identifiant;
end $$;
revoke all on function public.enregistrer_point_du_matin(date,text,jsonb,jsonb) from public,anon;
grant execute on function public.enregistrer_point_du_matin(date,text,jsonb,jsonb) to authenticated,service_role;

create function public.marquer_point_lu(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 update public.points_du_matin set statut='lu',lu_le=now(),lu_par=(select auth.uid()) where id=p_id and statut='a_lire';
end $$;
revoke all on function public.marquer_point_lu(uuid) from public,anon;
grant execute on function public.marquer_point_lu(uuid) to authenticated;

-- Trace de la décision dans le point. L'effet métier (version autorisée, article
-- paru, inscription refusée…) passe par les fonctions existantes, appelées avant.
create function public.decider_point_du_matin(p_id uuid,p_validee boolean,p_motif text) returns void language plpgsql security definer set search_path='' as $$
declare decision public.decisions_du_matin%rowtype;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_validee is null then raise exception 'Choisissez valider ou refuser'; end if;
 if p_validee is false and length(btrim(coalesce(p_motif,'')))<3 then raise exception 'Un refus se motive'; end if;
 update public.decisions_du_matin set statut=case when p_validee then 'validee' else 'refusee' end,decide_par=(select auth.uid()),decide_le=now(),motif=left(nullif(btrim(p_motif),''),1000)
 where id=p_id and statut='en_attente' returning * into decision;
 if not found then raise exception 'Cette décision est déjà tranchée'; end if;
 insert into public.audit_log(account_id,action,details) values((select auth.uid()),'point_du_matin_decide',jsonb_build_object('decision',p_id,'cle',decision.cle,'validee',p_validee));
end $$;
revoke all on function public.decider_point_du_matin(uuid,boolean,text) from public,anon;
grant execute on function public.decider_point_du_matin(uuid,boolean,text) to authenticated;
