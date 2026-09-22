-- Toutes les décisions sensibles restent contrôlées en base avec MFA.
create function public.creer_relais_supervision(p_email text,p_jours integer,p_motif text)
returns uuid language plpgsql security definer set search_path='' as $$
declare compte uuid; identifiant uuid;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Réservé au superviseur permanent'; end if;
 if p_jours is null or p_jours not between 1 and 90 or length(btrim(coalesce(p_motif,''))) not between 5 and 500 then raise exception 'Indiquez une durée de 1 à 90 jours et un motif'; end if;
 select id into compte from public.accounts where lower(email)=lower(btrim(p_email));
 if compte is null then raise exception 'Ce compte doit d’abord être créé et vérifié dans Gerimmo'; end if;
 if compte=(select auth.uid()) then raise exception 'Choisissez un autre compte pour assurer le relais'; end if;
 insert into public.supervision_delegations(account_id,commence_le,termine_le,pouvoirs,motif,cree_par)
 values(compte,now(),now()+make_interval(days=>p_jours),array['lecture'],btrim(p_motif),(select auth.uid())) returning id into identifiant;
 insert into public.audit_log(account_id,action,details) values((select auth.uid()),'relais_supervision_cree',jsonb_build_object('delegation',identifiant,'compte',compte,'jours',p_jours));
 return identifiant;
end $$;
revoke all on function public.creer_relais_supervision(text,integer,text) from public,anon;
grant execute on function public.creer_relais_supervision(text,integer,text) to authenticated;
create function public.revoquer_relais_supervision(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Réservé au superviseur permanent'; end if;
 update public.supervision_delegations set active=false,revoquee_le=now() where id=p_id and active;
 if not found then raise exception 'Ce relais a déjà pris fin ou n’existe plus'; end if;
 insert into public.audit_log(account_id,action,details) values((select auth.uid()),'relais_supervision_revoque',jsonb_build_object('delegation',p_id));
end $$;
revoke all on function public.revoquer_relais_supervision(uuid) from public,anon;
grant execute on function public.revoquer_relais_supervision(uuid) to authenticated;

create function public.resume_relais_supervision()
returns table(famille text,a_traiter bigint,urgents bigint,en_attente bigint)
language plpgsql security definer set search_path='' as $$
begin
 if public.has_supervision_power('lecture') is not true then raise exception 'Le relais n’est pas actif pour votre compte'; end if;
 return query select c.dossier_type,count(*) filter(where c.etat in ('a_faire','bloque')),count(*) filter(where c.priorite='urgente'),count(*) filter(where c.etat='en_attente')
 from public.orchestration_cases c where c.etat<>'termine' group by c.dossier_type;
end $$;
revoke all on function public.resume_relais_supervision() from public,anon;
grant execute on function public.resume_relais_supervision() to authenticated;

create or replace function public.decider_developpement(p_id uuid,p_revision text,p_accepter boolean)
returns void language plpgsql security definer set search_path='' as $$
declare proposition public.development_proposals%rowtype;
begin
 if public.is_permanent_super_admin() is not true then raise exception 'Réservé au superviseur permanent'; end if;
 select * into proposition from public.development_proposals where id=p_id for update;
 if not found or proposition.statut<>'autorisation' then raise exception 'Cette version n’attend plus de décision'; end if;
 p_revision:=lower(nullif(btrim(p_revision),''));
 if p_accepter is null or p_revision is null or p_revision !~ '^[0-9a-f]{40}$' or proposition.revision is distinct from p_revision then raise exception 'Cette version a changé : actualisez la page avant de décider'; end if;
 if p_accepter and (proposition.rapport_controles->>'resultat' is distinct from 'reussi' or proposition.rapport_controles->>'revision' is distinct from p_revision) then raise exception 'Les contrôles doivent réussir avant votre accord'; end if;
 update public.development_proposals set statut=case when p_accepter then 'preproduction' else 'annulee' end,
 autorisee_le=case when p_accepter then now() end,autorisee_par=case when p_accepter then (select auth.uid()) end where id=p_id;
 insert into public.audit_log(account_id,action,details) values((select auth.uid()),'developpement_decide',jsonb_build_object('proposition',p_id,'revision',p_revision,'accepte',p_accepter));
end $$;
revoke all on function public.decider_developpement(uuid,text,boolean) from public,anon;
grant execute on function public.decider_developpement(uuid,text,boolean) to authenticated;

-- Aucune délégation ni règle de secours ne crée silencieusement un super-admin.
-- La consultation du suivi est séparée des données personnelles des dossiers.
