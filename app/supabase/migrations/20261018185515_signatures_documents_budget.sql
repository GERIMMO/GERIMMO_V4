-- Extension du circuit éprouvé, un historique distinct par document.
alter table public.bail_signature_circuits
 add column modele text not null default 'bail' check(modele in ('bail','avenant','cautionnement','edl','protocole_apurement','autorisation_travaux')),
 add column cible_id uuid,
 add column options jsonb not null default '{}' check(jsonb_typeof(options)='object'),
 add column essai boolean not null default false;
update public.bail_signature_circuits set cible_id=coalesce(bail_id,document_id);
alter table public.bail_signature_circuits alter column cible_id set not null;
create function public.initialiser_cible_signature() returns trigger language plpgsql set search_path='' as $$
begin
 new.cible_id:=coalesce(new.cible_id,new.bail_id,new.document_id);
 return new;
end $$;
revoke all on function public.initialiser_cible_signature() from public,anon,authenticated;
create trigger signature_cible before insert on public.bail_signature_circuits for each row execute function public.initialiser_cible_signature();
drop index public.bail_signature_un_circuit_actif;
create unique index bail_signature_un_circuit_actif on public.bail_signature_circuits(bail_id,modele,cible_id,(coalesce(options->>'garant','')))
 where etat in ('pret','preparation','en_cours','a_verifier');

-- Crédit = unité fournisseur. L'estimation inclut le premier SMS de chacun,
-- pas les renvois déclenchés chez Zoho. Aucune somme n'est présentée comme encaissée.
create table public.signature_budget (
 singleton boolean primary key default true check(singleton),
 plafond_demi_credits integer not null default 0 check(plafond_demi_credits between 0 and 2000000),
 seuil_alerte_pct integer not null default 80 check(seuil_alerte_pct between 1 and 100),
 revision integer not null default 1,
 modifie_le timestamptz not null default now()
);
insert into public.signature_budget(singleton) values(true);
alter table public.signature_budget enable row level security;
revoke all on public.signature_budget from anon,authenticated;
grant select on public.signature_budget to authenticated;
grant all on public.signature_budget to service_role;
create policy signature_budget_admin on public.signature_budget for select to authenticated using(public.is_permanent_super_admin());
create policy signature_budget_serveur on public.signature_budget for all to service_role using(true) with check(true);
create table public.signature_consommations (
 circuit_id uuid primary key references public.bail_signature_circuits(id),
 mois_paris date not null,
 demi_credits integer not null check(demi_credits between 11 and 35),
 reserve_le timestamptz not null default now()
);
create index signature_consommations_mois on public.signature_consommations(mois_paris);
alter table public.signature_consommations enable row level security;
revoke all on public.signature_consommations from anon,authenticated;
grant select on public.signature_consommations to authenticated;
grant all on public.signature_consommations to service_role;
create policy signature_consommations_admin on public.signature_consommations for select to authenticated using(public.is_permanent_super_admin());
create policy signature_consommations_serveur on public.signature_consommations for all to service_role using(true) with check(true);

create function public.regler_budget_signature(p_plafond integer,p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_permanent_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_plafond is null or p_plafond<0 or p_plafond>2000000 then raise exception 'Plafond invalide'; end if;
 update public.signature_budget set plafond_demi_credits=p_plafond,revision=revision+1,modifie_le=now() where singleton and revision=p_revision;
 if not found then raise exception 'Le réglage a changé. Rechargez la page.'; end if;
 insert into public.audit_log(account_id,action,details) values(auth.uid(),'signature_budget_modifie',jsonb_build_object('plafond_demi_credits',p_plafond,'revision',p_revision+1));
end $$;
revoke all on function public.regler_budget_signature(integer,integer) from public,anon;
grant execute on function public.regler_budget_signature(integer,integer) to authenticated;

create function public.reserver_budget_signature(p_circuit uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare c public.bail_signature_circuits; limite integer; utilise bigint; cout integer; mois date;
begin
 select * into strict c from public.bail_signature_circuits where id=p_circuit;
 if c.prestataire<>'zoho' or c.environnement='sandbox' or c.essai then return; end if;
 select plafond_demi_credits into strict limite from public.signature_budget where singleton for update;
 if exists(select 1 from public.signature_consommations where circuit_id=p_circuit) then return; end if;
 cout:=10+jsonb_array_length(c.signataires);
 if cout>35 then raise exception '25 signataires au maximum'; end if;
 mois:=date_trunc('month',now() at time zone 'Europe/Paris')::date;
 select coalesce(sum(demi_credits),0) into utilise from public.signature_consommations where mois_paris=mois;
 if limite=0 or utilise+cout>limite then raise exception 'La limite mensuelle des nouveaux envois de signature est atteinte ou non configurée. Contactez l’assistance.'; end if;
 insert into public.signature_consommations(circuit_id,mois_paris,demi_credits) values(p_circuit,mois,cout);
end $$;
revoke all on function public.reserver_budget_signature(uuid) from public,anon,authenticated;
grant execute on function public.reserver_budget_signature(uuid) to service_role;

-- La réservation de coût et celle d'envoi font partie de la même transaction.
do $$ declare d text; begin
 select pg_get_functiondef('public.reserver_envoi_signature_bail(uuid,uuid)'::regprocedure) into d;
 if strpos(d,'update public.bail_signature_circuits set etat=')=0 then raise exception 'Réservation inconnue'; end if;
 d:=replace(d,'update public.bail_signature_circuits set etat=',E'perform public.reserver_budget_signature(p_circuit);\n  update public.bail_signature_circuits set etat=');
 d:=replace(d,$texte$and doc.type='bail' and d.signee_le is null$texte$,$texte$and doc.type='bail' and d.signee_le is null and v.modele='bail'$texte$);
 execute d;
end $$;

-- Le document signé reprend son véritable type (EDL, courrier, bail).
do $$ declare d text; begin
 select pg_get_functiondef('public.archiver_signature_bail(uuid,uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,$texte$case when idx=0 then 'bail' else 'autre' end$texte$,$texte$case when idx=0 then original.type::text else 'autre' end$texte$);
 d:=replace(d,$texte$'Certificat de réalisation — signature du bail'$texte$,$texte$'Certificat de réalisation — '||original.titre$texte$);
 d:=replace(d,$texte$'Bail signé par toutes les parties'$texte$,$texte$case when v.modele='bail' then 'Bail signé par toutes les parties' else 'Document signé par toutes les parties' end$texte$);
 d:=replace(d,$texte$'Contrat et preuves archivés — à vérifier avant activation'$texte$,$texte$case when v.modele='bail' then 'Contrat et preuves archivés — à vérifier avant activation' else 'Document et certificat archivés' end$texte$);
 execute d;
 select pg_get_functiondef('public.activer_bail_signature_electronique(uuid)'::regprocedure) into d;
 d:=replace(d,$texte$if v.etat<>'termine'$texte$, $texte$if v.modele<>'bail' or v.essai or v.etat<>'termine'$texte$);
 execute d;
end $$;

-- Une modification de la grille et une réservation d'envoi verrouillent le
-- même EDL : un relevé ne peut plus changer une fois son PDF envoyé.
create function public.garder_edl_en_signature() returns trigger
language plpgsql security definer set search_path='' as $$
declare cible uuid; parent public.etats_des_lieux;
begin
 if tg_table_name='etats_des_lieux' then cible:=old.id;
 else cible:=case when tg_op='DELETE' then old.edl_id else new.edl_id end; end if;
 select * into parent from public.etats_des_lieux where id=cible for update;
 if exists(select 1 from public.bail_signature_circuits c where c.modele='edl' and c.cible_id=cible and c.etat in ('preparation','en_cours','a_verifier')) then
   raise exception 'Annulez le circuit de signature de cet état des lieux avant de modifier son relevé.';
 end if;
 if tg_table_name<>'etats_des_lieux' and tg_op='UPDATE' then
   if old.edl_id is distinct from new.edl_id then raise exception 'Une ligne ne peut pas être déplacée vers un autre état des lieux'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.garder_edl_en_signature() from public,anon,authenticated;
create trigger edl_circuit_verrou before update or delete on public.etats_des_lieux for each row execute function public.garder_edl_en_signature();
create trigger edl_lignes_circuit_verrou before insert or update or delete on public.edl_lignes for each row execute function public.garder_edl_en_signature();
create trigger edl_cles_circuit_verrou before insert or update or delete on public.edl_cles for each row execute function public.garder_edl_en_signature();
create trigger edl_compteurs_circuit_verrou before insert or update or delete on public.edl_compteurs for each row execute function public.garder_edl_en_signature();

-- Garde de l'EDL avant réservation, classement seulement après toutes les preuves.
do $patch$
declare d text;
begin
 select pg_get_functiondef('public.reserver_envoi_signature_bail(uuid,uuid)'::regprocedure) into d;
 d:=replace(d,'perform public.reserver_budget_signature(p_circuit);',$bloc$
 if v.modele='edl' then
   perform 1 from public.etats_des_lieux where id=v.cible_id and organization_id=v.organization_id and bail_id=v.bail_id and etat<>'signe' for update;
   if not found then raise exception 'État des lieux inaccessible ou déjà signé'; end if;
   if not exists(select 1 from public.edl_lignes where edl_id=v.cible_id) or exists(select 1 from public.edl_lignes where edl_id=v.cible_id and etat is null) then raise exception 'Complétez toute la grille de l’état des lieux avant la signature'; end if;
   if exists(select 1 from public.etats_des_lieux e join public.baux b on b.id=e.bail_id where e.id=v.cible_id and e.type='sortie' and b.etat not in ('preavis','termine')) then raise exception 'Enregistrez le congé avant de signer l’état des lieux de sortie'; end if;
 end if;
 perform public.reserver_budget_signature(p_circuit);$bloc$);
 execute d;
 select pg_get_functiondef('public.archiver_signature_bail(uuid,uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,'insert into public.alerts(organization_id,type,criticite,titre,details)',$bloc$
 -- L'essai conserve son relevé en brouillon, comme le bail fictif.
 if v.modele='edl' and not v.essai and v.environnement='production' then
   update public.etats_des_lieux set etat='signe',signe_le=now(),signature_mode='pdf_signe',preuve_signature_document=signe
   where id=v.cible_id and organization_id=v.organization_id and bail_id=v.bail_id and etat<>'signe';
   if not found then raise exception 'Le relevé de l’état des lieux doit être rapproché de son document signé'; end if;
 end if;
 insert into public.alerts(organization_id,type,criticite,titre,details)$bloc$);
 execute d;
end $patch$;

create function public.lire_budget_signatures() returns jsonb
language plpgsql security definer set search_path='' as $$
declare mois date:=date_trunc('month',now() at time zone 'Europe/Paris')::date; total bigint; nb bigint; b public.signature_budget;
begin
 if auth.uid() is null or not public.is_permanent_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into strict b from public.signature_budget where singleton;
 select coalesce(sum(demi_credits),0),count(*) into total,nb from public.signature_consommations where mois_paris=mois;
 return jsonb_build_object('mois',mois,'plafond',b.plafond_demi_credits,'utilise',total,'envois',nb,'revision',b.revision,'seuil',b.seuil_alerte_pct,
   'a_verifier',(select count(*) from public.bail_signature_circuits where etat='a_verifier'),
   'en_cours',(select count(*) from public.bail_signature_circuits where etat in ('preparation','en_cours')),
   'essais',(select count(*) from public.bail_signature_circuits where essai and created_at >= mois::timestamp at time zone 'Europe/Paris'));
end $$;
revoke all on function public.lire_budget_signatures() from public,anon;
grant execute on function public.lire_budget_signatures() to authenticated;
