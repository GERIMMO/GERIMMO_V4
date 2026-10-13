-- SA003 : relais daté, alertes internes et arrêt coopératif. Aucun fournisseur.
create table public.supervision_vacances (
 id uuid primary key default gen_random_uuid(), numero integer not null default 1, precedent uuid references public.supervision_vacances(id),
 titre text not null check(length(btrim(titre)) between 3 and 120), debut timestamptz not null, fin timestamptz not null check(fin>debut),
 fuseau text not null default 'Europe/Paris' check(fuseau='Europe/Paris'), responsable uuid not null references public.accounts(id),
 consigne_version uuid references public.supervision_consignes_versions(id), delai_minutes integer not null check(delai_minutes between 1 and 10080),
 etat text not null default 'programme' check(etat in ('programme','actif','termine','annule')),
 arrete boolean not null default false, cree_par uuid not null references public.accounts(id), cree_le timestamptz not null default now()
);
create table public.supervision_alertes_internes (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.supervision_vacances(id), cle text not null check(length(cle) between 1 and 160),
 titre text not null check(length(titre) between 3 and 240), destinataire uuid not null references public.accounts(id),
 statut text not null default 'ouverte' check(statut in ('ouverte','escalade','accusee','non_acheminee')),
 cree_le timestamptz not null default now(), echeance timestamptz not null, escalade_le timestamptz,
 accusee_le timestamptz, accusee_par uuid references public.accounts(id), unique(plan_id,cle)
);
create table public.supervision_arrets (
 cle text primary key check(cle in ('global','consignes','veille','appels','quittances','relances','rappels','abonnements','signatures','marketing','territoire','purge','orchestrateur','sauvegarde')),
 arrete boolean not null, motif text not null check(length(btrim(motif)) between 5 and 1000), auteur uuid not null references public.accounts(id), modifie_le timestamptz not null default now()
);
create function public.enregistrer_vacances(p_precedent uuid,p_titre text,p_debut timestamptz,p_fin timestamptz,p_fuseau text,p_responsable uuid,p_consigne_version uuid,p_delai_minutes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare identifiant uuid; n integer:=1; garde_arret boolean:=false;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Supervision permanente et double vérification requises'; end if;
 if not public.responsable_supervision_habilite(p_responsable) or p_responsable=auth.uid() then raise exception 'Désignez un autre responsable déjà habilité'; end if;
 if p_fuseau is distinct from 'Europe/Paris' or p_debut is null or p_fin is null or not isfinite(p_debut) or not isfinite(p_fin) or p_fin<=p_debut or p_fin<=now() then raise exception 'Dates de vacances ou fuseau invalides'; end if;
 perform pg_advisory_xact_lock(hashtextextended('supervision_vacances',0));
 if p_precedent is not null then
  select numero+1,arrete into n,garde_arret from public.supervision_vacances where id=p_precedent and etat in ('programme','actif') for update;
  if n is null then raise exception 'Ce plan a déjà été remplacé ou terminé'; end if;
 end if;
 if exists(select 1 from public.supervision_vacances where etat in ('programme','actif') and id is distinct from p_precedent and debut<p_fin and fin>p_debut) then raise exception 'Un autre plan couvre déjà ces dates'; end if;
 if p_consigne_version is not null and not exists(select 1 from public.supervision_consignes_versions v join public.supervision_consignes c on c.id=v.consigne_id join public.supervision_consignes_accords a on a.version_id=v.id where v.id=p_consigne_version and a.accepte and c.version_courante=v.numero and not c.suspendue and v.responsable=p_responsable and v.debut<=p_debut and v.fin>=p_fin) then raise exception 'Choisissez une consigne approuvée pour ce responsable et toute la période'; end if;
 if p_precedent is not null then update public.supervision_vacances set etat='annule',arrete=true where id=p_precedent; end if;
 insert into public.supervision_vacances(numero,precedent,titre,debut,fin,fuseau,responsable,consigne_version,delai_minutes,cree_par,arrete)
 values(n,p_precedent,btrim(p_titre),p_debut,p_fin,p_fuseau,p_responsable,p_consigne_version,p_delai_minutes,auth.uid(),garde_arret) returning id into identifiant;
 insert into public.supervision_operations(objet,action,auteur,details) values(identifiant,'vacances_version',auth.uid(),jsonb_build_object('version',n,'precedent',p_precedent));
 return identifiant;
end $$;
create function public.commander_arret_supervision(p_cle text,p_plan uuid,p_arreter boolean,p_motif text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Supervision permanente et double vérification requises'; end if;
 if p_arreter is null or p_motif is null or length(btrim(p_motif)) not between 5 and 1000 then raise exception 'Choisissez arrêt ou reprise et indiquez un motif'; end if;
 if p_plan is not null then
  if p_cle is distinct from 'plan' then raise exception 'Périmètre du plan invalide'; end if;
  update public.supervision_vacances set arrete=p_arreter where id=p_plan and etat in ('programme','actif');
  if not found then raise exception 'Plan terminé ou inconnu'; end if;
 else
  insert into public.supervision_arrets(cle,arrete,motif,auteur) values(p_cle,p_arreter,btrim(p_motif),auth.uid()) on conflict(cle) do update set arrete=excluded.arrete,motif=excluded.motif,auteur=excluded.auteur,modifie_le=now();
 end if;
 insert into public.supervision_operations(objet,action,auteur,details) values(p_plan,'arret_supervision',auth.uid(),jsonb_build_object('perimetre',p_cle,'arrete',p_arreter,'motif',btrim(p_motif)));
end $$;
create function public.verifier_arret_supervision(p_mission text,p_plan uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' and public.is_permanent_super_admin() is not true then raise exception 'Accès réservé au traitement ou à la supervision'; end if;
 if p_mission is null or p_mission not in ('consignes','veille','appels','quittances','relances','rappels','abonnements','signatures','marketing','territoire','purge','orchestrateur','sauvegarde') then raise exception 'Mission inconnue'; end if;
 if exists(select 1 from public.supervision_arrets where cle in ('global',p_mission) and arrete) then return false; end if;
 if p_plan is not null and not exists(select 1 from public.supervision_vacances where id=p_plan and etat='actif' and not arrete and debut<=now() and fin>now() and public.responsable_supervision_habilite(responsable)) then return false; end if;
 return true;
end $$;
create function public.signaler_urgence_vacances(p_plan uuid,p_cle text,p_titre text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.supervision_vacances; identifiant uuid;
begin
 if auth.role() is distinct from 'service_role' and public.is_permanent_super_admin() is not true then raise exception 'Accès refusé'; end if;
 select * into p from public.supervision_vacances where id=p_plan and etat in ('programme','actif') and debut<=now() and fin>now() for update;
 if p.id is null then raise exception 'Aucun plan actif pour cette urgence'; end if;
 insert into public.supervision_alertes_internes(plan_id,cle,titre,destinataire,echeance,statut)
 values(p.id,p_cle,p_titre,p.responsable,now()+make_interval(mins=>p.delai_minutes),case when public.responsable_supervision_habilite(p.responsable) then 'ouverte' else 'non_acheminee' end)
 on conflict(plan_id,cle) do nothing returning id into identifiant;
 if identifiant is null then select id into identifiant from public.supervision_alertes_internes where plan_id=p.id and cle=p_cle;
 else insert into public.supervision_operations(objet,action,auteur,details) values(identifiant,'alerte_interne',auth.uid(),jsonb_build_object('plan',p.id,'canal','interne')); end if;
 return identifiant;
end $$;
create function public.accuser_alerte_vacances(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Responsable habilité et double vérification requis'; end if;
 update public.supervision_alertes_internes set statut='accusee',accusee_le=now(),accusee_par=auth.uid() where id=p_id and statut<>'accusee';
 if found then insert into public.supervision_operations(objet,action,auteur) values(p_id,'alerte_accusee',auth.uid()); end if;
end $$;
create function public.traiter_vacances() returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.supervision_vacances; t record; passage record; nombre integer:=0;
begin
 if auth.role() is distinct from 'service_role' and public.is_permanent_super_admin() is not true then raise exception 'Accès refusé'; end if;
 perform pg_advisory_xact_lock(hashtextextended('supervision_vacances',0));
 for p in select * from public.supervision_vacances where etat in ('programme','actif') order by debut for update loop
  if p.fin<=now() then
   update public.supervision_vacances set etat='termine' where id=p.id;
   insert into public.supervision_operations(objet,action,auteur) values(p.id,'vacances_terminees',auth.uid());continue;
  end if;
  if p.debut>now() then continue; end if;
  if p.etat='programme' then
   update public.supervision_vacances set etat='actif' where id=p.id;
   insert into public.supervision_operations(objet,action,auteur) values(p.id,'vacances_actives',auth.uid());
  end if;
  if not public.responsable_supervision_habilite(p.responsable) then
   perform public.signaler_urgence_vacances(p.id,'responsable_non_habilite','Le responsable a perdu son habilitation. Aucune tâche du plan ne peut démarrer.');
   update public.supervision_alertes_internes set statut='non_acheminee' where plan_id=p.id and statut in ('ouverte','escalade');continue;
  end if;
  for passage in select id from public.agent_passages where etat in ('a_reprendre','interrompu') and debut>=p.debut loop
   perform public.signaler_urgence_vacances(p.id,'passage:'||passage.id::text,'Un passage demande une vérification dans le suivi des équipes.');
  end loop;
  if public.verifier_arret_supervision('consignes',p.id) then
   for t in select id from public.supervision_consignes_taches where version_id=p.consigne_version and etat='approuvee' order by type loop
    begin perform public.executer_tache_consigne(t.id,p.id);nombre:=nombre+1;
    exception when others then perform public.signaler_urgence_vacances(p.id,'tache:'||t.id::text,'Une lecture autorisée est bloquée. Vérifiez sa version, sa période et son budget.'); end;
   end loop;
  end if;
 end loop;
 -- Une alerte non acquittée demeure visible après la fin des vacances.
 for t in update public.supervision_alertes_internes a set statut=case when public.responsable_supervision_habilite(source_plan.cree_par) then 'escalade' else 'non_acheminee' end,escalade_le=now(),destinataire=source_plan.cree_par
 from public.supervision_vacances source_plan where source_plan.id=a.plan_id and a.statut='ouverte' and a.echeance<=now() returning a.id,a.statut loop
  insert into public.supervision_operations(objet,action,auteur,details) values(t.id,'alerte_escalade',auth.uid(),jsonb_build_object('statut',t.statut));
 end loop;
 return jsonb_build_object('lectures_executees',nombre,'canal','interne','observe_le',now());
end $$;
-- Ni départ/fin de vacances ni reprise du plan ne modifient agent_missions.
-- Les arrêts explicites restent en vigueur jusqu'à une reprise explicite.
do $$ declare n text; begin
 foreach n in array array['supervision_vacances','supervision_alertes_internes','supervision_arrets'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('create policy supervision_lecture on public.%I for select to authenticated using(public.is_permanent_super_admin())',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
  execute format('grant select on public.%I to authenticated,service_role',n);
 end loop;
end $$;
revoke all on function public.enregistrer_vacances(uuid,text,timestamptz,timestamptz,text,uuid,uuid,integer),public.commander_arret_supervision(text,uuid,boolean,text),public.verifier_arret_supervision(text,uuid),public.signaler_urgence_vacances(uuid,text,text),public.accuser_alerte_vacances(uuid),public.traiter_vacances() from public,anon;
grant execute on function public.enregistrer_vacances(uuid,text,timestamptz,timestamptz,text,uuid,uuid,integer),public.commander_arret_supervision(text,uuid,boolean,text),public.verifier_arret_supervision(text,uuid),public.signaler_urgence_vacances(uuid,text,text),public.accuser_alerte_vacances(uuid),public.traiter_vacances() to authenticated;
grant execute on function public.verifier_arret_supervision(text,uuid),public.signaler_urgence_vacances(uuid,text,text),public.traiter_vacances() to service_role;

-- Une interruption ne prétend pas connaître les effets déjà produits par le handler.
create function public.interrompre_mission_supervision(p_id uuid,p_indisponible boolean,p_bilan jsonb default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Accès réservé au traitement'; end if;
 update public.agent_passages set fin=now(),etat='interrompu',resume=case when p_indisponible then 'Contrôle indisponible : effets déjà réalisés à vérifier avant reprise.' else 'Arrêt demandé : effets déjà réalisés conservés, à vérifier avant reprise.' end,bilan=coalesce(p_bilan,'{}'::jsonb)||jsonb_build_object('compte_inconnu',true) where id=p_id and etat='en_cours';
end $$;
revoke all on function public.interrompre_mission_supervision(uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.interrompre_mission_supervision(uuid,boolean,jsonb) to service_role;
