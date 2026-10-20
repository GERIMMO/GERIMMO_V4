-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- Retour D08-C : restaure les droits de traversée antérieurs. Les preuves
-- (audit_log et registre privé de support) sont conservées, jamais réécrites.
-- Hors migrations.yml : ce retour gère sa transaction. Le refuser dans un
-- lot ouvert évite que son COMMIT ne valide une simulation de migrations.

set local lock_timeout = '10s';
drop function if exists public.executer_encaissement_support(uuid);
drop function if exists public.preparer_encaissement_support(uuid,uuid,uuid,numeric,numeric,text);
do $retour$
declare d text; t record; ancien text; nouveau text;
begin
 for t in select ns.nspname,c.relname from pg_trigger tr join pg_class c on c.oid=tr.tgrelid join pg_namespace ns on ns.oid=c.relnamespace where tr.tgname='traversee_lecture_seule' loop
  execute format('drop trigger traversee_lecture_seule on %I.%I',t.nspname,t.relname);
 end loop;
 select pg_get_functiondef('public.artisan_decider_plateforme(uuid,public.artisan_decision_plateforme,text)'::regprocedure) into d;
 ancien := '    perform support_interne.preparer_blacklist_globale(p_artisan); -- D08-C blacklist
';
 if strpos(d,ancien)>0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'artisan_decider_plateforme : ancre retour D08-C inattendue'; end if;
  d:=replace(d,ancien,'');
  ancien := '  delete from support_interne.maintenance_lignes where transaction_id=txid_current() and auteur=auth.uid(); -- D08-C blacklist
';
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'artisan_decider_plateforme : nettoyage retour D08-C inattendu'; end if;
  execute replace(d,ancien,'');
 end if;
 select pg_get_functiondef('public.maintenance_artisans()'::regprocedure) into d;
 ancien := '  perform support_interne.preparer_maintenance_artisans(); -- D08-C maintenance
';
 if strpos(d,ancien)>0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'maintenance_artisans : ancre retour D08-C inattendue'; end if;
  d:=replace(d,ancien,'');
  ancien := '  delete from support_interne.maintenance_lignes where transaction_id=txid_current() and auteur=auth.uid();
  insert into public.audit_log(account_id,action,details) values(auth.uid(),''maintenance_artisans_console'',jsonb_build_object(''auteur_reel'',auth.uid(),''devis_expires'',v_devis,''motifs_purges'',v_motifs+v_n));
';
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'maintenance_artisans : audit retour D08-C inattendu'; end if;
  execute replace(d,ancien,'');
 end if;
 select pg_get_functiondef('public.controler_organisation(uuid,text,integer,text)'::regprocedure) into d;
 ancien := 'insert into support_interne.controles_organisation values(txid_current(),auth.uid(),p_org);
  update public.organizations set status = v_cible, essai_fin = v_essai where id = p_org;
  delete from support_interne.controles_organisation where transaction_id=txid_current() and auteur=auth.uid() and organization_id=p_org;';
 nouveau := 'update public.organizations set status = v_cible, essai_fin = v_essai where id = p_org;';
 if strpos(d,'support_interne.controles_organisation')>0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'controler_organisation : ancre retour D08-C inattendue'; end if;
  execute replace(d,ancien,nouveau);
 end if;
 select pg_get_functiondef('public.appliquer_retention()'::regprocedure) into d;
 ancien := 'v_journaux := v_journaux || jsonb_build_object(''gestes_support'',support_interne.purger_gestes_support());
  ';
 if strpos(d,'support_interne.purger_gestes_support')>0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'appliquer_retention : ancre retour D08-C inattendue'; end if;
  execute replace(d,ancien,'');
 end if;
 select pg_get_functiondef('public.messages_personne(uuid,uuid)'::regprocedure) into d;
 ancien := 'and m.auteur = ''locataire'' and m.lu_le is null and not public.est_traversee_organisation(p_org);';
 nouveau := 'and m.auteur = ''locataire'' and m.lu_le is null;';
 if strpos(d,ancien)>0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'messages_personne : ancre retour D08-C inattendue'; end if;
  execute replace(d,ancien,nouveau);
 elsif strpos(d,nouveau)=0 then raise exception 'messages_personne : définition retour D08-C inattendue'; end if;
 select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into d;
 ancien := 'perform public.poser_gardes_traversee(); -- D08-C
  return v_n;'; nouveau := 'return v_n;';
 if strpos(d,ancien)>0 then
  if (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then raise exception 'poser_gardes_abonnement : ancre retour D08-C inattendue'; end if;
  execute replace(d,ancien,nouveau);
 elsif strpos(d,'-- D08-C')>0 then raise exception 'poser_gardes_abonnement : définition retour D08-C inattendue'; end if;
end $retour$;
drop function if exists support_interne.preparer_blacklist_globale(uuid);
drop function if exists support_interne.preparer_maintenance_artisans();
drop function if exists support_interne.purger_gestes_support();
drop trigger if exists traversee_auto_habilitation on public.memberships;
drop function if exists support_interne.refuser_auto_habilitation();
drop function if exists public.poser_gardes_traversee();
drop function if exists support_interne.garder_ecriture_traversee();
drop function if exists public.est_traversee_organisation(uuid);
select public.fermer_fonctions_a_anon();
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version='20261016172453';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
