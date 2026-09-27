-- AUDIT CONSOLE DU 27/09 — MAJEUR 1 : UNE DÉCISION DU POINT DU MATIN SUIT L'ÉTAT RÉEL.
--
-- Une décision tranchée sur son propre écran (veille, article, artisan, retour,
-- évolution) restait « en attente » dans le point et dans tous les badges
-- jusqu'au prochain assemblage. Pire : « Valider » sur cette décision périmée
-- rappelait `decider_veille`, qui ne relisait pas l'état courant — une
-- information écartée pouvait être diffusée à tous les utilisateurs.
--
-- 1. Un déclencheur sur chaque file d'origine passe la décision en
--    `sans_objet` dès que la source n'attend plus (motif « Tranchée sur son
--    écran »), quel que soit le chemin : écran, point, traitement.
-- 2. `decider_point_du_matin` accepte la trace d'une décision que le même
--    superviseur vient d'appliquer depuis le point (le déclencheur l'a déjà
--    passée en `sans_objet` pendant l'effet métier).
-- 3. `enregistrer_point_du_matin` rouvre une décision `sans_objet` quand sa
--    source attend de nouveau (artisan suspendu, retour rouvert).
-- 4. `decider_veille` prend l'état attendu : le point exige `a_examiner`,
--    l'écran exige l'état de l'onglet affiché. Et la décision est journalisée.
--
-- Idempotent : create or replace, drop … if exists.

-- ── 1. Le déclencheur des files d'origine ──────────────────────────────────
create or replace function public.point_du_matin_source_changee() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_source text := tg_argv[0]; v_id uuid; v_attend_encore boolean; n jsonb; o jsonb;
begin
 -- Une fonction pour cinq tables : les colonnes se lisent par to_jsonb, une
 -- référence directe (new.statut) échouerait sur la table qui ne l'a pas.
 if tg_op = 'DELETE' then
  v_id := old.id; v_attend_encore := false;
 else
  v_id := new.id; n := to_jsonb(new); o := to_jsonb(old);
  v_attend_encore := case v_source
   when 'veille' then n->>'statut' = 'a_examiner'
   when 'publication' then n->>'statut' in ('proposition','brouillon')
   when 'artisan' then n->>'statut_plateforme' = 'en_attente'
   when 'retour' then n->>'etat' in ('nouveau','en_examen')
   -- Une évolution attend une autorisation SUR UNE VERSION : une nouvelle
   -- révision rend l'accord présenté caduc.
   when 'developpement' then n->>'statut' = 'autorisation' and (n->>'revision') is not distinct from (o->>'revision')
   else true end;
 end if;
 if not v_attend_encore then
  update public.decisions_du_matin
     set statut = 'sans_objet', decide_le = now(), decide_par = (select auth.uid()),
         motif = 'Tranchée sur son écran ou changée depuis la préparation du point.'
   where source = v_source and source_id = v_id and statut = 'en_attente';
 end if;
 return null;
end $$;
revoke all on function public.point_du_matin_source_changee() from public, anon, authenticated;

drop trigger if exists point_du_matin_veille on public.regulatory_watch;
create trigger point_du_matin_veille after update of statut or delete on public.regulatory_watch
 for each row execute function public.point_du_matin_source_changee('veille');
drop trigger if exists point_du_matin_publication on public.publications;
create trigger point_du_matin_publication after update of statut or delete on public.publications
 for each row execute function public.point_du_matin_source_changee('publication');
drop trigger if exists point_du_matin_artisan on public.artisans;
create trigger point_du_matin_artisan after update of statut_plateforme or delete on public.artisans
 for each row execute function public.point_du_matin_source_changee('artisan');
drop trigger if exists point_du_matin_retour on public.retours_utilisateurs;
create trigger point_du_matin_retour after update of etat or delete on public.retours_utilisateurs
 for each row execute function public.point_du_matin_source_changee('retour');
drop trigger if exists point_du_matin_developpement on public.development_proposals;
create trigger point_du_matin_developpement after update of statut, revision or delete on public.development_proposals
 for each row execute function public.point_du_matin_source_changee('developpement');

-- Rattrapage : ce qui est déjà tranché ailleurs ne reste pas « en attente ».
update public.decisions_du_matin d set statut = 'sans_objet', decide_le = now(),
  motif = 'Tranchée sur son écran ou changée depuis la préparation du point.'
 where d.statut = 'en_attente' and d.source_id is not null and not case d.source
  when 'veille' then exists(select 1 from public.regulatory_watch v where v.id = d.source_id and v.statut = 'a_examiner')
  when 'publication' then exists(select 1 from public.publications p where p.id = d.source_id and p.statut in ('proposition','brouillon'))
  when 'artisan' then exists(select 1 from public.artisans a where a.id = d.source_id and a.statut_plateforme = 'en_attente')
  when 'retour' then exists(select 1 from public.retours_utilisateurs r where r.id = d.source_id and r.etat in ('nouveau','en_examen'))
  when 'developpement' then exists(select 1 from public.development_proposals p where p.id = d.source_id and p.statut = 'autorisation')
  else true end;

-- ── 2. La trace d'une décision prise depuis le point ───────────────────────
create or replace function public.decider_point_du_matin(p_id uuid,p_validee boolean,p_motif text) returns void language plpgsql security definer set search_path='' as $$
declare decision public.decisions_du_matin%rowtype;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_validee is null then raise exception 'Choisissez valider ou refuser'; end if;
 if p_validee is false and length(btrim(coalesce(p_motif,'')))<3 then raise exception 'Un refus se motive'; end if;
 -- L'effet métier vient d'être appliqué par ce superviseur : le déclencheur de
 -- la file d'origine a déjà passé la décision en « sans objet » à son nom.
 update public.decisions_du_matin set statut=case when p_validee then 'validee' else 'refusee' end,decide_par=(select auth.uid()),decide_le=now(),motif=left(nullif(btrim(p_motif),''),1000)
 where id=p_id and (statut='en_attente' or (statut='sans_objet' and decide_par=(select auth.uid()) and decide_le>now()-interval '10 minutes'))
 returning * into decision;
 if not found then raise exception 'Cette décision est déjà tranchée'; end if;
 insert into public.audit_log(account_id,action,details) values((select auth.uid()),'point_du_matin_decide',jsonb_build_object('decision',p_id,'cle',decision.cle,'validee',p_validee));
end $$;
revoke all on function public.decider_point_du_matin(uuid,boolean,text) from public,anon;
grant execute on function public.decider_point_du_matin(uuid,boolean,text) to authenticated;

-- ── 3. Le réassemblage rouvre ce qui attend de nouveau ─────────────────────
create or replace function public.enregistrer_point_du_matin(p_jour date,p_equipe text,p_contenu jsonb,p_decisions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
  else
   -- Une décision « sans objet » dont la source attend de nouveau redevient à trancher.
   update public.decisions_du_matin set titre=left(d->>'titre',200),pourquoi=left(coalesce(d->>'pourquoi',''),2000),options=coalesce(d->'options','[]'::jsonb),recommandation=left(d->>'recommandation',500),lien=left(d->>'lien',300),gestes=coalesce(d->'gestes','{}'::jsonb),
     statut='en_attente',decide_par=null,decide_le=null,motif=null
   where point_id=identifiant and cle=d->>'cle' and statut in ('en_attente','sans_objet');
   if found then nouveautes:=true; end if;
  end if;
 end loop;
 update public.decisions_du_matin set statut='sans_objet',decide_le=now() where point_id=identifiant and statut='en_attente' and not (cle=any(cles));
 if nouveautes then update public.points_du_matin set statut='a_lire',lu_le=null,lu_par=null where id=identifiant; end if;
 return identifiant;
end $$;
revoke all on function public.enregistrer_point_du_matin(date,text,jsonb,jsonb) from public,anon;
grant execute on function public.enregistrer_point_du_matin(date,text,jsonb,jsonb) to authenticated,service_role;

-- ── 4. decider_veille relit l'état courant et se journalise ────────────────
drop function if exists public.decider_veille(uuid,boolean,text,text,text[],date);
create or replace function public.decider_veille(p_id uuid,p_publier boolean,p_resume text,p_action text,p_publics text[],p_application date,p_statut_attendu text default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_avant text;
begin
 if (select auth.uid()) is null or public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 if p_publier is null then raise exception 'Choisissez une décision'; end if;
 if p_statut_attendu is not null and p_statut_attendu not in ('a_examiner','publie','ecarte') then raise exception 'État attendu inconnu'; end if;
 if p_publier and (p_resume is null or length(btrim(p_resume)) not between 20 and 2000 or p_action is null or length(btrim(p_action)) not between 10 and 2000 or coalesce(cardinality(p_publics),0)=0) then raise exception 'Complétez le résumé, l’action et les publics'; end if;
 select statut into v_avant from public.regulatory_watch where id=p_id for update;
 if not found then raise exception 'Information introuvable'; end if;
 -- L'état COURANT décide : une information écartée depuis son écran n'est
 -- jamais diffusée par une décision préparée avant.
 if p_statut_attendu is not null and v_avant is distinct from p_statut_attendu then
  raise exception 'Cette information a changé d’état depuis son affichage : rechargez la page';
 end if;
 update public.regulatory_watch set statut=case when p_publier then 'publie' else 'ecarte' end,
 resume=case when p_publier then btrim(p_resume) else resume end,
 action_conseillee=case when p_publier then btrim(p_action) else action_conseillee end,
 publics=case when p_publier then p_publics else publics end,application_le=p_application,date_a_confirmer=p_application is null,
 valide_par=(select auth.uid()),valide_le=now() where id=p_id;
 insert into public.audit_log(account_id,action,details)
 values((select auth.uid()),case when p_publier then 'veille_diffusee' else 'veille_ecartee' end,jsonb_build_object('veille',p_id,'avant',v_avant));
end $$;
revoke all on function public.decider_veille(uuid,boolean,text,text,text[],date,text) from public,anon;
grant execute on function public.decider_veille(uuid,boolean,text,text,text[],date,text) to authenticated;
