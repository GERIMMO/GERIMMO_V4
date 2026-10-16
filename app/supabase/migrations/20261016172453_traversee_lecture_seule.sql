-- D08-C : les pouvoirs de supervision ne donnent plus l'écriture métier.
-- Le garde est un trigger : les RPC SECURITY DEFINER le traversent aussi.
-- Les droits de lecture et les adhésions de gérance réelles restent inchangés.
create schema if not exists support_interne;
revoke all on schema support_interne from public, anon, authenticated;

create table if not exists support_interne.gestes_encaissement (
 id uuid primary key default gen_random_uuid(),
 auteur uuid not null,
 organization_id uuid not null,
 bail_id uuid not null,
 appel_id uuid not null,
 motif text not null check(length(btrim(motif)) between 10 and 500),
 reste numeric not null check(reste>0 and reste::text not in ('NaN','Infinity','-Infinity')),
 anterieure numeric not null check(anterieure>=0 and anterieure::text not in ('NaN','Infinity','-Infinity')),
 cree_le timestamptz not null default clock_timestamp(),
 expire_le timestamptz not null default clock_timestamp()+interval '5 minutes',
 execute_le timestamptz,
 transaction_active bigint,
 resultat jsonb,
 check(expire_le>cree_le and expire_le<=cree_le+interval '5 minutes 1 second')
);
-- Le registre conserve des UUID instantanés comme preuve, sans retenir les
-- comptes ou dossiers supprimés par leur cycle de vie légitime. Préparation et
-- exécution vérifient chacune la cible ; une cible supprimée rend le geste caduc.
alter table support_interne.gestes_encaissement
 drop constraint if exists gestes_encaissement_auteur_fkey,
 drop constraint if exists gestes_encaissement_organization_id_fkey,
 drop constraint if exists gestes_encaissement_bail_id_fkey,
 drop constraint if exists gestes_encaissement_appel_id_fkey;
create index if not exists gestes_encaissement_actif on support_interne.gestes_encaissement(auteur,transaction_active) where transaction_active is not null;
create index if not exists gestes_encaissement_expiration on support_interne.gestes_encaissement(expire_le);
alter table support_interne.gestes_encaissement enable row level security;
revoke all on support_interne.gestes_encaissement from public,anon,authenticated;

create table if not exists support_interne.controles_organisation (
 transaction_id bigint not null, auteur uuid not null, organization_id uuid not null,
 primary key(transaction_id,auteur,organization_id)
);
alter table support_interne.controles_organisation enable row level security;
revoke all on support_interne.controles_organisation from public,anon,authenticated;

-- Une maintenance manuelle reste un geste de plateforme sans paramètre métier.
-- Chaque permis décrit UNE mutation attendue ; il est privé, lié à l'acteur et
-- à la transaction, consommé par le trigger puis supprimé avant le retour RPC.
create table if not exists support_interne.maintenance_lignes (
 transaction_id bigint not null, auteur uuid not null, table_nom text not null,
 ligne_id uuid not null, avant jsonb, apres jsonb not null,
 primary key(transaction_id,auteur,table_nom,ligne_id)
);
alter table support_interne.maintenance_lignes enable row level security;
revoke all on support_interne.maintenance_lignes from public,anon,authenticated;

create or replace function support_interne.preparer_maintenance_artisans()
returns void language plpgsql security definer set search_path='' as $$
declare r record; d record; a record; j date:=public.aujourdhui_paris(); v_apres jsonb;
begin
 if auth.uid() is null or not public.is_super_admin() then raise exception 'Accès refusé'; end if;
 -- La même commande ne peut pas réutiliser une autorisation qui serait restée active.
 if exists(select 1 from support_interne.maintenance_lignes where transaction_id=txid_current() and auteur=auth.uid()) then raise exception 'Maintenance déjà active'; end if;
 if public.tache_planifiee_autorisee('maintenance-artisans') then
  for r in select x.* from public.incident_devis x where x.statut='depose' and x.valide_jusqu_au<j for update loop
   insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'incident_devis',r.id,to_jsonb(r),to_jsonb(r)||jsonb_build_object('statut','expire'));
   for a in select x.* from public.alerts x where x.organization_id=r.organization_id and x.type='devis_a_decider' and x.statut='ouverte' and x.details->>'devis_id'=r.id::text for update loop
    insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'alerts',a.id,to_jsonb(a),to_jsonb(a)||jsonb_build_object('statut','fermee','closed_at',now(),'closed_by',auth.uid(),'closed_action','Devis expiré'));
   end loop;
  end loop;
  for r in select x.* from public.incident_sollicitations x where
   (x.statut in ('envoyee','devis_depose') and exists(select 1 from public.incident_devis dv where dv.sollicitation_id=x.id and (dv.statut='expire' or (dv.statut='depose' and dv.valide_jusqu_au<j))))
   or (x.statut='revision_demandee' and x.revision_avant<j) for update loop
   insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'incident_sollicitations',r.id,to_jsonb(r),to_jsonb(r)||jsonb_build_object('statut','expiree'));
   if r.statut='revision_demandee' then
    select x.* into d from public.incident_devis x where x.sollicitation_id=r.id and x.statut='revise' order by x.version desc limit 1;
    v_apres:=to_jsonb(jsonb_populate_record(null::public.incident_evenements,jsonb_build_object('organization_id',r.organization_id,'incident_id',r.incident_id,'type','devis_revision_expiree','details',jsonb_build_object('sollicitation_id',r.id,'artisan_id',r.artisan_id,'devis_id',d.id,'version',d.version,'revision_avant',r.revision_avant))));
    insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'incident_evenements',r.id,null,v_apres-array['id','created_at']);
    v_apres:=to_jsonb(jsonb_populate_record(null::public.alerts,jsonb_build_object('organization_id',r.organization_id,'type','devis_revision_expiree','criticite','normale','titre','Révision de devis sans réponse — '||(select numero from public.incidents where id=r.incident_id),'statut','ouverte','escalades','[]'::jsonb,'assigned_all',true,'origine_type','sollicitation','origine_id',r.id,'details',jsonb_build_object('incident_id',r.incident_id,'lot_id',(select lot_id from public.incidents where id=r.incident_id),'consultation_id',r.consultation_id,'sollicitation_id',r.id,'devis_id',d.id,'revision_avant',r.revision_avant,'libelle','L''artisan n''a pas répondu à la demande de révision dans le délai : retenez un autre devis ou sollicitez un autre artisan.'))));
    insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'alerts',r.id,null,v_apres-array['id','created_at','updated_at']);
   end if;
  end loop;
 end if;
 for r in select x.* from public.artisan_agences x where x.purge_motif_le is not null and x.purge_motif_le<=current_date for update loop
  insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'artisan_agences',r.id,to_jsonb(r),to_jsonb(r)||jsonb_build_object('blacklist_le',null,'blacklist_motif',null,'blacklist_par',null,'purge_motif_le',null));
 end loop;
end $$;
revoke all on function support_interne.preparer_maintenance_artisans() from public,anon,authenticated;

-- Ancres exactes, rejouables, sans réécrire les règles de la maintenance existante.
do $maintenance$
declare d text; a text:='  v_devis := public.maintenance_artisans_interne();'; b text:='  return query select v_devis, v_motifs + v_n;';
begin
 select pg_get_functiondef('public.maintenance_artisans()'::regprocedure) into d;
 if strpos(d,'support_interne.preparer_maintenance_artisans')=0 then
  if (length(d)-length(replace(d,a,'')))/length(a)<>1 or (length(d)-length(replace(d,b,'')))/length(b)<>1 then raise exception 'maintenance_artisans : ancres D08-C inattendues'; end if;
  d:=replace(d,a,'  perform support_interne.preparer_maintenance_artisans(); -- D08-C maintenance
'||a);
  d:=replace(d,b,'  delete from support_interne.maintenance_lignes where transaction_id=txid_current() and auteur=auth.uid();
  insert into public.audit_log(account_id,action,details) values(auth.uid(),''maintenance_artisans_console'',jsonb_build_object(''auteur_reel'',auth.uid(),''devis_expires'',v_devis,''motifs_purges'',v_motifs+v_n));
'||b);
  execute d;
 end if;
end $maintenance$;

-- La sanction globale motivée conserve ses seuls effets déjà définis :
-- annuler les offres encore vivantes de CET artisan et fermer leurs alertes.
create or replace function support_interne.preparer_blacklist_globale(p_artisan uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r record; a record;
begin
 if auth.uid() is null or not public.is_super_admin() then raise exception 'Accès refusé'; end if;
 if exists(select 1 from support_interne.maintenance_lignes where transaction_id=txid_current() and auteur=auth.uid()) then raise exception 'Opération de plateforme déjà active'; end if;
 for r in select x.* from public.incident_devis x where x.artisan_id=p_artisan and x.statut='depose' for update loop
  insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'incident_devis',r.id,to_jsonb(r),to_jsonb(r)||jsonb_build_object('statut','annule'));
  for a in select x.* from public.alerts x where x.organization_id=r.organization_id and x.type='devis_a_decider' and x.statut='ouverte' and x.details->>'devis_id'=r.id::text for update loop
   insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'alerts',a.id,to_jsonb(a),to_jsonb(a)||jsonb_build_object('statut','fermee','closed_at',now(),'closed_by',auth.uid(),'closed_action','Devis annulé'));
  end loop;
 end loop;
 for r in select x.* from public.incident_sollicitations x where x.artisan_id=p_artisan and x.statut in ('envoyee','devis_depose','revision_demandee') for update loop
  insert into support_interne.maintenance_lignes values(txid_current(),auth.uid(),'incident_sollicitations',r.id,to_jsonb(r),to_jsonb(r)||jsonb_build_object('statut','annulee','repondue_le',now()));
 end loop;
end $$;
revoke all on function support_interne.preparer_blacklist_globale(uuid) from public,anon,authenticated;
do $blacklist$
declare d text; a text:='    update public.incident_devis set statut = ''annule''';
 b text:='  insert into public.artisan_validations (artisan_id, decision, motif, decide_par)';
begin
 select pg_get_functiondef('public.artisan_decider_plateforme(uuid,public.artisan_decision_plateforme,text)'::regprocedure) into d;
 if strpos(d,'support_interne.preparer_blacklist_globale')=0 then
  if (length(d)-length(replace(d,a,'')))/length(a)<>1 or (length(d)-length(replace(d,b,'')))/length(b)<>1 then raise exception 'artisan_decider_plateforme : ancres D08-C inattendues'; end if;
  d:=replace(d,a,'    perform support_interne.preparer_blacklist_globale(p_artisan); -- D08-C blacklist
'||a);
  d:=replace(d,b,'  delete from support_interne.maintenance_lignes where transaction_id=txid_current() and auteur=auth.uid(); -- D08-C blacklist
'||b);
  execute d;
 end if;
end $blacklist$;

create or replace function public.est_traversee_organisation(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.is_super_admin() and not exists (
  select 1 from public.memberships m where m.account_id=auth.uid() and m.organization_id=p_org
   and m.status='active' and m.role in ('admin_agence','agent','proprietaire_direct')
 );
$$;
revoke all on function public.est_traversee_organisation(uuid) from public,anon;
grant execute on function public.est_traversee_organisation(uuid) to authenticated;

create or replace function support_interne.garder_ecriture_traversee()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_ligne jsonb; v_org uuid; v_support boolean; v_lignes jsonb[]; v_nom text;
begin
 -- Aucun paramètre HTTP, GUC client ou rôle SQL definer n'autorise une écriture.
 if auth.uid() is null or not public.is_super_admin() then return coalesce(new,old); end if;
 -- Un permis de maintenance est consommé une fois, sur l'image exacte attendue.
 if tg_table_schema='public' and tg_op in ('UPDATE','INSERT') then
  delete from support_interne.maintenance_lignes p
   where p.transaction_id=txid_current() and p.auteur=auth.uid() and p.table_nom=tg_table_name
    and ((tg_op='UPDATE' and p.ligne_id=(to_jsonb(old)->>'id')::uuid
      and p.avant-'updated_at'=to_jsonb(old)-'updated_at' and p.apres-'updated_at'=to_jsonb(new)-'updated_at')
     or (tg_op='INSERT' and p.avant is null and p.apres=to_jsonb(new)-array['id','created_at','updated_at']));
  if found then return new; end if;
 end if;
 v_lignes:=case when tg_op='INSERT' then array[to_jsonb(new)] when tg_op='DELETE' then array[to_jsonb(old)] else array[to_jsonb(old),to_jsonb(new)] end;
 foreach v_ligne in array v_lignes loop
  v_org:=null;
  if tg_table_schema='storage' then
   -- Le stockage documentaire client porte l'organisation en premier segment.
   -- Les autres buckets gardent leurs règles propres (artisan, publication plateforme).
   if v_ligne->>'bucket_id' <> 'documents' then continue; end if;
   v_nom:=split_part(v_ligne->>'name','/',1);
   if v_nom ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_org:=v_nom::uuid; end if;
  elsif tg_table_name='organizations' then
   v_org:=(v_ligne->>'id')::uuid;
   -- Création de client et état d'abonnement restent des gestes de plateforme.
   -- Aucune modification du profil, de l'IBAN ou des paramètres de gérance.
   if tg_op='INSERT' then continue; end if;
   if tg_op='UPDATE' and (to_jsonb(old)-array['status','essai_fin','updated_at']) = (to_jsonb(new)-array['status','essai_fin','updated_at'])
    and exists(select 1 from support_interne.controles_organisation c where c.transaction_id=txid_current() and c.auteur=auth.uid() and c.organization_id=v_org) then continue; end if;
  elsif tg_table_name='parrainages' then
   v_org:=(v_ligne->>'filleul_organization_id')::uuid;
  elsif tg_table_name='relances_invitations_locataires' then
   select organization_id into v_org from public.invitations_locataires where id=(v_ligne->>'invitation_id')::uuid;
  elsif tg_table_name='lot_equipements' then
   select organization_id into v_org from public.lots where id=(v_ligne->>'lot_id')::uuid;
  elsif tg_table_name='cle_repartition_lignes' then
   select organization_id into v_org from public.cles_repartition where id=(v_ligne->>'cle_id')::uuid;
  else
   v_org:=(v_ligne->>'organization_id')::uuid;
  end if;
  -- Une cible absente/illisible échoue fermée pour les tables métier.
  if v_org is null or public.est_traversee_organisation(v_org) then
   v_support:=false;
   if tg_table_schema='public' and tg_table_name=any(array[
     'encaissements','ecritures','quittances','mouvements_mandants',
     'fiscal_encaissements_composantes','commandes_encaissement_reste']) then
    select exists(select 1 from support_interne.gestes_encaissement s
     where s.auteur=auth.uid() and s.organization_id=v_org and s.transaction_active=txid_current()
      and s.execute_le is null and s.expire_le>clock_timestamp()
      and (not(v_ligne ? 'bail_id') or (v_ligne->>'bail_id')::uuid=s.bail_id)
    ) into v_support;
   end if;
   if not v_support then
    raise exception 'Traversée en lecture seule : utilisez un geste de support motivé depuis la console.' using errcode='42501';
   end if;
  end if;
 end loop;
 return coalesce(new,old);
end $$;
revoke all on function support_interne.garder_ecriture_traversee() from public,anon,authenticated;

create or replace function public.poser_gardes_traversee()
returns integer language plpgsql security definer set search_path='' as $$
declare t record; n integer:=0;
begin
 for t in select c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname='public' and c.relkind='r'
   and (exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='organization_id' and a.attnum>0 and not a.attisdropped)
     or c.relname in ('organizations','lot_equipements','cle_repartition_lignes','relances_invitations_locataires','parrainages'))
   -- État de plateforme, assistance et journaux : propres fonctions de console,
   -- pas des écritures de gérance. Les pièces d'audit doivent rester inscriptibles en lecture.
   and c.relname not in ('memberships','abonnements','abonnement_evenements','audit_log','acces_pieces_log',
     'retours_utilisateurs','retours_soutiens','automation_events','orchestration_cases','orchestration_history','reseau_interets')
  order by c.relname loop
  execute format('drop trigger if exists traversee_lecture_seule on public.%I',t.relname);
  execute format('create trigger traversee_lecture_seule before insert or update or delete on public.%I for each row execute function support_interne.garder_ecriture_traversee()',t.relname);
  n:=n+1;
 end loop;
 drop trigger if exists traversee_lecture_seule on storage.objects;
 create trigger traversee_lecture_seule before insert or update or delete on storage.objects for each row execute function support_interne.garder_ecriture_traversee();
 return n;
end $$;
revoke all on function public.poser_gardes_traversee() from public,anon,authenticated;
select public.poser_gardes_traversee();

-- Toute future table d'organisation passe par l'installateur déjà obligatoire.
do $installation$
declare d text; ancien text := 'return v_n;'; nouveau text := 'perform public.poser_gardes_traversee(); -- D08-C
  return v_n;';
begin
 select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into d;
 if strpos(d,'-- D08-C')=0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'poser_gardes_abonnement : ancre D08-C inattendue'; end if;
  execute replace(d,ancien,nouveau);
 end if;
end $installation$;

-- La console conserve son geste explicite ; une mise à jour directe de statut
-- reste refusée. L'autorisation privée n'existe que pendant cette instruction.
do $console$
declare d text; ancien text := 'update public.organizations set status = v_cible, essai_fin = v_essai where id = p_org;';
 nouveau text := 'insert into support_interne.controles_organisation values(txid_current(),auth.uid(),p_org);
  update public.organizations set status = v_cible, essai_fin = v_essai where id = p_org;
  delete from support_interne.controles_organisation where transaction_id=txid_current() and auteur=auth.uid() and organization_id=p_org;';
begin
 select pg_get_functiondef('public.controler_organisation(uuid,text,integer,text)'::regprocedure) into d;
 if strpos(d,'support_interne.controles_organisation')=0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'controler_organisation : ancre D08-C inattendue'; end if;
  execute replace(d,ancien,nouveau);
 end if;
end $console$;

-- Une auto-attribution de rôle local ne doit jamais désactiver la lecture seule.
-- Les véritables adhésions déjà actives restent valables ; la supervision peut
-- gérer les rôles des autres comptes par ses gestes habituels et journalisés.
create or replace function support_interne.refuser_auto_habilitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.account_id=auth.uid() and new.organization_id is not null and new.status='active'
  and new.role in ('admin_agence','agent','proprietaire_direct') and public.is_super_admin()
  and (tg_op='INSERT' or old.account_id is distinct from new.account_id
    or old.organization_id is distinct from new.organization_id or old.status is distinct from new.status
    or old.role is distinct from new.role) then
  raise exception 'La supervision ne peut pas se donner un rôle de gérance pour contourner la lecture seule' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function support_interne.refuser_auto_habilitation() from public,anon,authenticated;
drop trigger if exists traversee_auto_habilitation on public.memberships;
create trigger traversee_auto_habilitation before insert or update on public.memberships
 for each row execute function support_interne.refuser_auto_habilitation();

-- Lire le courrier ne marque plus « lu » pour le gérant pendant la traversée.
-- Pas d'exception UPDATE sur messages : une modification de texte reste interdite.
do $migration$
declare d text; ancien text := 'and m.auteur = ''locataire'' and m.lu_le is null;';
 nouveau text := 'and m.auteur = ''locataire'' and m.lu_le is null and not public.est_traversee_organisation(p_org);';
begin
 select pg_get_functiondef('public.messages_personne(uuid,uuid)'::regprocedure) into d;
 if strpos(d,nouveau)=0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'messages_personne : ancre D08-C inattendue'; end if;
  execute replace(d,ancien,nouveau);
 end if;
end $migration$;

create or replace function public.preparer_encaissement_support(p_org uuid,p_bail uuid,p_appel uuid,p_reste numeric,p_anterieure numeric,p_motif text)
returns table(geste_id uuid,expire_le timestamptz) language plpgsql security definer set search_path='' as $$
declare s support_interne.gestes_encaissement%rowtype;
begin
 if auth.uid() is null or not public.is_permanent_super_admin() then raise exception 'Compte de supervision avec double vérification requis'; end if;
 if length(btrim(coalesce(p_motif,''))) not between 10 and 500 then raise exception 'Indiquez un motif de support de 10 à 500 caractères'; end if;
 if p_reste is null or p_anterieure is null or p_reste<=0 or p_anterieure<0
  or p_reste::text in ('NaN','Infinity','-Infinity') or p_anterieure::text in ('NaN','Infinity','-Infinity') then raise exception 'Montants invalides'; end if;
 if not exists(select 1 from public.appels_loyer a join public.baux b on b.id=a.bail_id
  where a.id=p_appel and a.bail_id=p_bail and a.organization_id=p_org and b.organization_id=p_org) then raise exception 'Appel de loyer introuvable'; end if;
 insert into support_interne.gestes_encaissement(auteur,organization_id,bail_id,appel_id,motif,reste,anterieure)
 values(auth.uid(),p_org,p_bail,p_appel,btrim(p_motif),p_reste,p_anterieure) returning * into s;
 insert into public.audit_log(account_id,organization_id,action,details)
 values(auth.uid(),p_org,'support_encaissement_prepare',jsonb_build_object('geste_id',s.id,'bail_id',p_bail,'appel_id',p_appel,'motif',s.motif,'expire_le',s.expire_le,'auteur_reel',auth.uid(),'reste',p_reste));
 return query select s.id,s.expire_le;
end $$;
revoke all on function public.preparer_encaissement_support(uuid,uuid,uuid,numeric,numeric,text) from public,anon;
grant execute on function public.preparer_encaissement_support(uuid,uuid,uuid,numeric,numeric,text) to authenticated;

create or replace function public.executer_encaissement_support(p_geste uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s support_interne.gestes_encaissement%rowtype; r jsonb;
begin
 if auth.uid() is null or not public.is_permanent_super_admin() then raise exception 'Compte de supervision avec double vérification requis'; end if;
 select * into s from support_interne.gestes_encaissement where id=p_geste and auteur=auth.uid() for update;
 if not found then raise exception 'Geste de support introuvable'; end if;
 if s.execute_le is not null then
  if s.resultat->>'encaissement_id' is not null and not exists(select 1 from public.encaissements where id=(s.resultat->>'encaissement_id')::uuid) then
   return jsonb_build_object('statut','annule','montant',0,'rejoue',true);
  end if;
  return s.resultat || jsonb_build_object('rejoue',true);
 end if;
 if s.expire_le<=clock_timestamp() then raise exception 'Geste de support expiré : préparez une nouvelle demande'; end if;
 if not exists(select 1 from public.appels_loyer a join public.baux b on b.id=a.bail_id
  where a.id=s.appel_id and a.bail_id=s.bail_id and a.organization_id=s.organization_id and b.organization_id=s.organization_id) then
  raise exception 'Appel de loyer introuvable : le geste de support ne peut plus être exécuté';
 end if;
 update support_interne.gestes_encaissement set transaction_active=txid_current() where id=s.id;
 r:=public.encaisser_reste_atomique(s.organization_id,s.bail_id,s.appel_id,s.id,s.reste,s.anterieure);
 update support_interne.gestes_encaissement set transaction_active=null,execute_le=clock_timestamp(),resultat=r where id=s.id;
 insert into public.audit_log(account_id,organization_id,action,details)
 values(auth.uid(),s.organization_id,'support_encaissement_execute',jsonb_build_object('geste_id',s.id,'bail_id',s.bail_id,'appel_id',s.appel_id,'motif',s.motif,'auteur_reel',auth.uid(),'prepare_le',s.cree_le,'expire_le',s.expire_le,'resultat',r));
 return r;
end $$;
revoke all on function public.executer_encaissement_support(uuid) from public,anon;
grant execute on function public.executer_encaissement_support(uuid) to authenticated;
-- Le registre de support suit la même durée que le journal d'audit existant
-- (36 mois par défaut), et la même purge quotidienne. Aucun nouveau délai métier.
create or replace function support_interne.purger_gestes_support()
returns bigint language plpgsql security definer set search_path='' as $$
declare m integer; n bigint:=0;
begin
 select duree_mois into m from public.retention_rules where data_type='journal:audit_log' and actif and sort='suppression';
 if found then
  delete from support_interne.gestes_encaissement where transaction_active is null and expire_le<now()-make_interval(months=>m);
  get diagnostics n=row_count;
 end if;
 return n;
end $$;
revoke all on function support_interne.purger_gestes_support() from public,anon,authenticated;
do $retention$
declare d text; ancien text := 'v_journaux := v_journaux || jsonb_build_object(''signalements_support'',public.purger_signalements_support());';
 nouveau text := 'v_journaux := v_journaux || jsonb_build_object(''gestes_support'',support_interne.purger_gestes_support());
  v_journaux := v_journaux || jsonb_build_object(''signalements_support'',public.purger_signalements_support());';
begin
 select pg_get_functiondef('public.appliquer_retention()'::regprocedure) into d;
 if strpos(d,'support_interne.purger_gestes_support')=0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'appliquer_retention : ancre D08-C inattendue'; end if;
  execute replace(d,ancien,nouveau);
 end if;
end $retention$;
select public.fermer_fonctions_a_anon();
