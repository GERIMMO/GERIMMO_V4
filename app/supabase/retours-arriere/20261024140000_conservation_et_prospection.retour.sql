-- RETOUR ARRIÈRE de 20261024140000_conservation_et_prospection.sql (plan de conformité du 23/10/2026, lot 2,
-- lot 1F et, du lot 1E, alertes avant suppression et gel en cas de litige). Remettre d'abord le code précédent : la
-- fiche du bail (carte « Conservation des pièces »), la fiche prospect (origine, opposition, premier message) et la
-- mission « rappels » (courriels des alertes de conservation) appellent les fonctions retirées ici.
--
-- Ce qui est défait :
--  · `appliquer_retention` : les cinq remplacements marqués CONSERVATION_20261024 sont inversés, chacun à compte
--    exact (sinon arrêt sans rien modifier) ; la boucle des documents compte de nouveau depuis
--    `debut_conservation_document` ;
--  · `cibles_conservation_contacts`, `purger_contacts_echus`, `simuler_conservation_contacts`,
--    `purger_signalements_support`, `support_interne.purger_gestes_support`, et (si la table du socle est encore là)
--    `purger_archives_comptes` et `archives_comptes_echeances` retrouvent leur texte d'avant, relevé sur une base
--    portant la production et toutes les migrations jusqu'à 20261024090000 ; droits inchangés ;
--  · intégration du 24/10 : `archives_comptes_garde` retrouve le texte du socle final (factures comptées, date de purge
--    posée par la base, six ans depuis l'émission) et `retractations_abonnement_ajout_seul` celui de 20261024110000
--    (aucune suppression ; la suppression de l'espace détache la déclaration) ; `echeance_retractation_abonnement` est retirée ;
--  · les fonctions ajoutées, le déclencheur `baux_gel_conservation_garde` et sa fonction ;
--  · le catalogue : durées d'avant (60 mois, quittances 120 mois depuis l'émission, journal d'audit 36 mois…)
--    seulement là où la valeur est encore celle du plan ; les 23 règles ajoutées sont retirées ;
--  · la liste fermée des origines des prospects et le droit d'écrire `qualite` et `dernier_contact_prospect_le` ;
--  · la table technique `conservation_reperes` ; la table `oppositions_prospection` SEULEMENT SI ELLE EST VIDE (une
--    opposition enregistrée est une preuve : elle est conservée telle quelle et le script le dit).
-- Ce qui est conservé : les colonnes `baux.conservation_gelee_jusqu_au`, `baux.conservation_gelee_motif` (gels
-- posés, préavis de levée compris), `supervision_prospects.oppose_le`, `dernier_contact_prospect_le`, `qualite` et
-- leurs contraintes ; l'origine « formulaire » donnée aux fiches nées d'une demande (ancienne valeur « Formulaire de
-- contact », même sens) ; les alertes de conservation déjà posées (elles se lisent et se ferment à la main). Les
-- pièces, fiches et lignes déjà purgées ne reviennent pas (sauvegarde).
--
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouée, elle ne fait rien de plus. Premier dans la chaîne « Ordre complet » du LISEZ-MOI, bien que la
-- migration ne cite pas `aujourdhui_paris()` (retours du plan de conformité du 24/10, ordre inverse du manifeste : 140000,
-- 130000, 120000, 110000, 100000, 090000). À jouer AVANT le retour de 20261024090000 (socle). La marche avant se
-- rejoue ensuite.
do $retour_atomique$
declare
  f text;
  v_n bigint;
begin
  perform set_config('lock_timeout', '10s', true);

  -- 1. appliquer_retention : remplacements inversés, dans l'ordre inverse.
  select pg_get_functiondef('public.appliquer_retention()'::regprocedure) into f;
  if strpos(f, 'CONSERVATION_20261024') > 0 then
    if (length(f) - length(replace(f, $n$  end loop;

  -- Catégories du plan de conformité du 23/10 (lot 2) et alertes avant suppression.
  v_journaux := v_journaux || public.appliquer_conservation_complementaire();
$n$, ''))) / length($n$  end loop;

  -- Catégories du plan de conformité du 23/10 (lot 2) et alertes avant suppression.
  v_journaux := v_journaux || public.appliquer_conservation_complementaire();
$n$) <> 1 then
      raise exception 'Retour 20261024140000 refusé : appliquer_retention ne porte pas exactement une fois un remplacement attendu';
    end if;
    f := replace(f, $n$  end loop;

  -- Catégories du plan de conformité du 23/10 (lot 2) et alertes avant suppression.
  v_journaux := v_journaux || public.appliquer_conservation_complementaire();
$n$, $a$  end loop;
$a$);
    if (length(f) - length(replace(f, $n$    -- L'échéance de la règle (echeance_conservation_document : fin du bail, gel, restitution ; pour les autres
    -- déclencheurs, debut_conservation_document) ; suppression le jour même, au jour de Paris.
    continue when v_doc.echeance is null;
    continue when v_doc.echeance > (now() at time zone 'Europe/Paris')::date;

    -- Même sort, même trace qu'avant, appliqués par purger_document_conservation : une pièce échue d'un compte en
    -- lecture seule se purge aussi (elle faisait échouer toute la purge de la nuit).
    continue when not public.purger_document_conservation(v_doc.id, v_doc.data_type, v_doc.echeance);
    if v_doc.sort = 'anonymisation' then
      v_docs_anonymises := v_docs_anonymises + 1;
    end if;$n$, ''))) / length($n$    -- L'échéance de la règle (echeance_conservation_document : fin du bail, gel, restitution ; pour les autres
    -- déclencheurs, debut_conservation_document) ; suppression le jour même, au jour de Paris.
    continue when v_doc.echeance is null;
    continue when v_doc.echeance > (now() at time zone 'Europe/Paris')::date;

    -- Même sort, même trace qu'avant, appliqués par purger_document_conservation : une pièce échue d'un compte en
    -- lecture seule se purge aussi (elle faisait échouer toute la purge de la nuit).
    continue when not public.purger_document_conservation(v_doc.id, v_doc.data_type, v_doc.echeance);
    if v_doc.sort = 'anonymisation' then
      v_docs_anonymises := v_docs_anonymises + 1;
    end if;$n$) <> 1 then
      raise exception 'Retour 20261024140000 refusé : appliquer_retention ne porte pas exactement une fois un remplacement attendu';
    end if;
    f := replace(f, $n$    -- L'échéance de la règle (echeance_conservation_document : fin du bail, gel, restitution ; pour les autres
    -- déclencheurs, debut_conservation_document) ; suppression le jour même, au jour de Paris.
    continue when v_doc.echeance is null;
    continue when v_doc.echeance > (now() at time zone 'Europe/Paris')::date;

    -- Même sort, même trace qu'avant, appliqués par purger_document_conservation : une pièce échue d'un compte en
    -- lecture seule se purge aussi (elle faisait échouer toute la purge de la nuit).
    continue when not public.purger_document_conservation(v_doc.id, v_doc.data_type, v_doc.echeance);
    if v_doc.sort = 'anonymisation' then
      v_docs_anonymises := v_docs_anonymises + 1;
    end if;$n$, $a$    continue when v_doc.debut is null;
    continue when v_doc.debut + make_interval(months => (select duree_mois from public.retention_rules
                                                           where data_type = v_doc.data_type)) > now();

    if v_doc.storage_path is not null then
      insert into public.purge_fichiers (storage_path) values (v_doc.storage_path);
    end if;

    if v_doc.sort = 'anonymisation' then
      -- La contrepartie subsiste, sans personne : rattachements non
      -- personnels gardés, titre neutre, auteurs retirés.
      delete from public.document_liens where document_id = v_doc.id and entite = 'personne';
      update public.documents
        set purged_at = now(), anonymise_le = now(), storage_path = null, mime_type = null,
            taille_octets = null, titre = v_doc.libelle || ' (anonymisé)',
            deposited_by = null, verifie_par = null
        where id = v_doc.id;
      v_docs_anonymises := v_docs_anonymises + 1;
    else
      delete from public.document_liens where document_id = v_doc.id;
      update public.documents
        set purged_at = now(), storage_path = null, mime_type = null,
            taille_octets = null, empreinte = null, titre = null,
            deposited_by = null, verifie_par = null
        where id = v_doc.id;
    end if;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), v_doc.organization_id, 'purge_retention',
            jsonb_build_object('document_id', v_doc.id, 'type', v_doc.type,
                               'regle', v_doc.data_type, 'sort', v_doc.sort,
                               'debut_conservation', v_doc.debut));$a$);
    if (length(f) - length(replace(f, $n$      and d.retention_reference_date + make_interval(months => least(r.duree_mois, 36)) <= now()$n$, ''))) / length($n$      and d.retention_reference_date + make_interval(months => least(r.duree_mois, 36)) <= now()$n$) <> 1 then
      raise exception 'Retour 20261024140000 refusé : appliquer_retention ne porte pas exactement une fois un remplacement attendu';
    end if;
    f := replace(f, $n$      and d.retention_reference_date + make_interval(months => least(r.duree_mois, 36)) <= now()$n$, $a$      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()$a$);
    if (length(f) - length(replace(f, $n$           public.echeance_conservation_document(d.id) as echeance$n$, ''))) / length($n$           public.echeance_conservation_document(d.id) as echeance$n$) <> 1 then
      raise exception 'Retour 20261024140000 refusé : appliquer_retention ne porte pas exactement une fois un remplacement attendu';
    end if;
    f := replace(f, $n$           public.echeance_conservation_document(d.id) as echeance$n$, $a$           public.debut_conservation_document(d.id) as debut$a$);
    if (length(f) - length(replace(f, $n$    -- CONSERVATION_20261024 : douze mois en général ; les actions de contrôle interne suivent
    -- journal:audit_controle_interne (36 mois), les preuves du contrat journal:audit_preuve_contrat (dix ans).
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois)
        and not public.action_audit_controle_interne(action)
        and not public.action_audit_preuve_contrat(action);$n$, ''))) / length($n$    -- CONSERVATION_20261024 : douze mois en général ; les actions de contrôle interne suivent
    -- journal:audit_controle_interne (36 mois), les preuves du contrat journal:audit_preuve_contrat (dix ans).
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois)
        and not public.action_audit_controle_interne(action)
        and not public.action_audit_preuve_contrat(action);$n$) <> 1 then
      raise exception 'Retour 20261024140000 refusé : appliquer_retention ne porte pas exactement une fois un remplacement attendu';
    end if;
    f := replace(f, $n$    -- CONSERVATION_20261024 : douze mois en général ; les actions de contrôle interne suivent
    -- journal:audit_controle_interne (36 mois), les preuves du contrat journal:audit_preuve_contrat (dix ans).
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois)
        and not public.action_audit_controle_interne(action)
        and not public.action_audit_preuve_contrat(action);$n$, $a$    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);$a$);
    if strpos(f, 'CONSERVATION_20261024') > 0 then
      raise exception 'Retour 20261024140000 refusé : appliquer_retention garde une marque CONSERVATION_20261024';
    end if;
    execute f;
  end if;

  -- 2. Fonctions remplacées : texte d'avant, droits inchangés (CREATE OR REPLACE les garde).
  create or replace function public.cibles_conservation_contacts()
  returns table(categorie text,id uuid) language sql stable security definer set search_path=''
  as $fonction$
 select 'contact:devis', d.id from public.demandes_devis d
 where greatest(d.created_at,d.traitee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:devis' and sort='suppression'))
 union all
 select 'contact:attente', d.id from public.liste_attente d
 where d.created_at < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:attente' and sort='suppression'))
 union all
 select 'contact:attente_agences', d.id from public.liste_attente_agences d
 where greatest(d.created_at,d.contactee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:attente_agences' and sort='suppression'))
 union all
 select 'invitation:locataire', d.id from public.invitations_locataires d
 where d.etat in ('en_attente','expiree','annulee','refusee') and d.expire_le < now()
 and greatest(d.expire_le,d.repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:locataire' and sort='suppression'))
 union all
 select 'invitation:artisan', d.id from public.invitations_artisans d
 where d.etat in ('en_attente','expiree','annulee','refusee') and d.expire_le < now()
 and greatest(d.expire_le,d.repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:artisan' and sort='suppression'));
$fonction$;
  create or replace function public.purger_contacts_echus()
  returns jsonb language plpgsql security definer set search_path=''
  as $fonction$
declare n bigint; resultat jsonb:='{}';
begin
 if auth.uid() is not null and not public.is_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if not public.tache_planifiee_autorisee('retention-quotidienne') then return '{}'::jsonb; end if;
 delete from public.demandes_devis where greatest(created_at,traitee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:devis' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:devis');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('demandes_devis',n);
 delete from public.liste_attente where id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:attente');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('liste_attente',n);
 delete from public.liste_attente_agences where greatest(created_at,contactee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:attente_agences' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:attente_agences');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('liste_attente_agences',n);
 delete from public.invitations_locataires where etat in ('en_attente','expiree','annulee','refusee') and greatest(expire_le,repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:locataire' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='invitation:locataire');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('invitations_locataires',n);
 delete from public.invitations_artisans where etat in ('en_attente','expiree','annulee','refusee') and greatest(expire_le,repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:artisan' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='invitation:artisan');
 get diagnostics n=row_count; return resultat||jsonb_build_object('invitations_artisans',n);
end $fonction$;
  create or replace function public.simuler_conservation_contacts()
  returns jsonb language plpgsql stable security definer set search_path=''
  as $fonction$
begin
 if auth.uid() is null or not public.is_permanent_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 return jsonb_build_object('categories',(select coalesce(jsonb_agg(x order by x.categorie),'[]'::jsonb) from (
   select r.data_type categorie,r.libelle,r.duree_mois,r.actif,count(c.id) echus from public.retention_rules r
   left join public.cibles_conservation_contacts() c on c.categorie=r.data_type
   where r.data_type in ('contact:devis','contact:attente','contact:attente_agences','invitation:locataire','invitation:artisan')
   group by r.data_type,r.libelle,r.duree_mois,r.actif) x),
   'preuves_protegees',(select count(*) from public.documents d where d.purged_at is null and public.document_preuve_signature(d.id)),
   'suppressions',0);
end $fonction$;
  create or replace function public.purger_signalements_support()
  returns integer language plpgsql security definer set search_path = ''
  as $fonction$
declare v_mois integer;v_ids uuid[];v_count integer;
begin
  if auth.uid() is not null and not public.is_super_admin() then raise exception 'Purge réservée à la supervision'; end if;
  select duree_mois into v_mois from public.retention_rules where data_type='support:bug' and actif and sort='suppression';
  if not found then return 0; end if;
  -- Lots bornés, verrouillés avant les réponses concurrentes. Un dossier déjà
  -- en cours de traitement sera repris à la prochaine exécution du nettoyage.
  select array_agg(x.id) into v_ids from (
    select id from public.retours_utilisateurs where nature='bug'
      and cree_le < now()-make_interval(months=>v_mois)
    order by cree_le,id limit 500 for update skip locked
  ) x;
  if v_ids is null then return 0; end if;
  delete from public.retours_historique where retour_id=any(v_ids);
  delete from public.retours_soutiens where retour_id=any(v_ids);
  delete from public.retours_utilisateurs where id=any(v_ids);
  get diagnostics v_count=row_count;
  -- Le journal ne conserve ni le texte ni les auteurs supprimés.
  insert into public.tech_log(evenement,details)
    values('purge_signalements_support',jsonb_build_object('nombre',v_count,'duree_mois',v_mois));
  return v_count;
end;
$fonction$;
  create or replace function support_interne.purger_gestes_support()
  returns bigint language plpgsql security definer set search_path=''
  as $fonction$
declare m integer; n bigint:=0;
begin
 select duree_mois into m from public.retention_rules where data_type='journal:audit_log' and actif and sort='suppression';
 if found then
  delete from support_interne.gestes_encaissement where transaction_active is null and expire_le<now()-make_interval(months=>m);
  get diagnostics n=row_count;
 end if;
 return n;
end $fonction$;
  if to_regprocedure('public.purger_archives_comptes()') is not null then
    create or replace function public.purger_archives_comptes()
    returns jsonb language plpgsql security definer set search_path = ''
    as $fonction$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_factures bigint;
  v_archives bigint;
begin
  update public.archives_comptes a
     set factures = coalesce((select jsonb_agg(x.e order by x.rang)
                                from jsonb_array_elements(a.factures) with ordinality x(e, rang)
                               where ((x.e ->> 'emise_le')::date + interval '6 years')::date >= v_jour), '[]'::jsonb),
         factures_purgees_le = now()
   where exists (select 1 from jsonb_array_elements(a.factures) e
                  where ((e ->> 'emise_le')::date + interval '6 years')::date < v_jour);
  get diagnostics v_factures = row_count;
  delete from public.archives_comptes a
   where a.preuve_conservee_jusqu_au < v_jour and jsonb_array_length(a.factures) = 0;
  get diagnostics v_archives = row_count;
  return jsonb_build_object('archives_comptes_factures_retirees', v_factures, 'archives_comptes_supprimees', v_archives);
end $fonction$;
  end if;
  if to_regprocedure('public.archives_comptes_echeances()') is not null then
    create or replace function public.archives_comptes_echeances()
    returns trigger language plpgsql set search_path = ''
    as $fonction$
declare v_derniere date;
begin
  if exists (select 1 from jsonb_array_elements(new.factures) e
              where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'emise_le', '') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Chaque facture archivée porte sa date d''émission (emise_le, AAAA-MM-JJ)' using errcode = '22023';
  end if;
  select max((e ->> 'emise_le')::date) into v_derniere from jsonb_array_elements(new.factures) e;
  new.archive_le := now();
  -- Preuve d'un contrat conclu par voie électronique : dix ans (code de la consommation, L. 213-1, D. 213-1 et
  -- D. 213-2), comptés de la fin du dernier abonnement payé (plan du 23/10, choix 5 ; décision du 23/10).
  -- À relire par le juriste (source non ouverte le 23/10/2026).
  new.preuve_conservee_jusqu_au := (new.fin_dernier_abonnement_paye + interval '10 years')::date;
  -- Factures et pièces justificatives : six ans à compter de leur date (livre des procédures fiscales, L. 102 B ;
  -- éditeur non commerçant, décision du 23/10). Échéance de la plus récente ; chacune se retire à la sienne.
  -- À relire par le juriste (source non ouverte le 23/10/2026).
  new.factures_conservees_jusqu_au := (v_derniere + interval '6 years')::date;
  new.factures_purgees_le := null;
  return new;
end $fonction$;
  end if;

  -- Intégration du 24/10 : la garde des archives du socle (texte du socle final, relecture M4) et la garde d'ajout seul
  -- des rétractations (texte de 20261024110000) retrouvent leur texte d'avant ; droits inchangés.
  if to_regprocedure('public.archives_comptes_garde()') is not null then
    create or replace function public.archives_comptes_garde()
    returns trigger language plpgsql set search_path = ''
    as $fonction$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Les archives de comptes ne se vident pas' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.preuve_conservee_jusqu_au >= v_jour or jsonb_array_length(old.factures) > 0 then
      raise exception 'Une archive de compte ne se supprime qu''au terme de sa conservation (preuve jusqu''au %, % facture(s) encore conservée(s))',
        old.preuve_conservee_jusqu_au, jsonb_array_length(old.factures) using errcode = '42501';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - 'factures' - 'factures_purgees_le') is distinct from (to_jsonb(old) - 'factures' - 'factures_purgees_le') then
    raise exception 'Une archive de compte ne se modifie pas' using errcode = '42501';
  end if;
  -- La date de purge est celle de la base, posée au retrait d'une facture et à lui seul (relecture adverse du 24/10,
  -- M4 : elle prenait n'importe quelle valeur).
  if new.factures is not distinct from old.factures then
    if new.factures_purgees_le is distinct from old.factures_purgees_le then
      raise exception 'Une archive de compte ne se modifie pas' using errcode = '42501';
    end if;
    return new;
  end if;
  new.factures_purgees_le := now();
  -- Chaque facture gardée l'est à l'identique, sans copie de plus ; chaque facture retirée est arrivée au terme de ses
  -- six ans. Les factures se comptent (M4) : deux copies identiques sont deux factures, aucune ne part avant son terme.
  if exists (select 1
               from (select n.e, count(*) as c from jsonb_array_elements(new.factures) n(e) group by n.e) nouvelles
               left join (select o.e, count(*) as c from jsonb_array_elements(old.factures) o(e) group by o.e) anciennes
                 on anciennes.e = nouvelles.e
              where anciennes.c is null or nouvelles.c > anciennes.c)
     or exists (select 1
                  from (select o.e, count(*) as c from jsonb_array_elements(old.factures) o(e) group by o.e) anciennes
                  left join (select n.e, count(*) as c from jsonb_array_elements(new.factures) n(e) group by n.e) nouvelles
                    on nouvelles.e = anciennes.e
                 where coalesce(nouvelles.c, 0) < anciennes.c
                   and ((anciennes.e ->> 'emise_le')::date + interval '6 years')::date >= v_jour) then
    raise exception 'Seules les factures arrivées au terme de leur conservation se retirent d''une archive' using errcode = '42501';
  end if;
  return new;
end $fonction$;
  end if;
  if to_regprocedure('public.retractations_abonnement_ajout_seul()') is not null then
    create or replace function public.retractations_abonnement_ajout_seul()
    returns trigger language plpgsql set search_path = ''
    as $fonction$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une déclaration de rétractation ne se supprime pas';
  end if;
  if new.organization_id is distinct from old.organization_id then
    if new.organization_id is not null or old.organization_id is null
       or exists (select 1 from public.organizations o where o.id = old.organization_id)
       or (to_jsonb(new) - 'organization_id') is distinct from (to_jsonb(old) - 'organization_id') then
      raise exception 'Une déclaration de rétractation ne se réécrit pas';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - array['executee_le', 'montant_rembourse_cents', 'refunds', 'passage_effectue', 'accuse_envoye_le'])
     is distinct from (to_jsonb(old) - array['executee_le', 'montant_rembourse_cents', 'refunds', 'passage_effectue', 'accuse_envoye_le']) then
    raise exception 'Une déclaration de rétractation ne se réécrit pas';
  end if;
  -- Relecture adverse du 24/10 (point 5) : l'exécution consignée (montant remboursé, références) ne s'écrase pas.
  if old.executee_le is not null
     and (new.executee_le, new.montant_rembourse_cents, new.refunds, new.passage_effectue)
         is distinct from (old.executee_le, old.montant_rembourse_cents, old.refunds, old.passage_effectue) then
    raise exception 'L''exécution de la rétractation est déjà consignée';
  end if;
  if old.accuse_envoye_le is not null and new.accuse_envoye_le is distinct from old.accuse_envoye_le then
    raise exception 'L''accusé de réception est déjà enregistré';
  end if;
  return new;
end;
$fonction$;
  end if;

  -- 3. Ce que la migration a ajouté : déclencheurs du gel et du dernier contact, puis fonctions (aucune n'est plus
  -- appelée).
  drop trigger if exists baux_gel_conservation_garde on public.baux;
  drop trigger if exists supervision_prospects_dernier_contact_garde on public.supervision_prospects;
  drop function if exists public.garder_dernier_contact_prospect();
  drop function if exists public.inscriptions_agences_opposees();
  drop function if exists public.poser_alerte_conservation(uuid, text, uuid, text, text, jsonb, date);
  drop function if exists public.echeance_levee_gel_bail(uuid);
  drop function if exists public.lire_conservation_bail(uuid);
  drop function if exists public.geler_conservation_bail(uuid, date, text);
  drop function if exists public.ecrire_gel_conservation_bail(uuid, date, text);
  drop function if exists public.controler_envoi_prospection(uuid);
  drop function if exists public.enregistrer_opposition_prospection(uuid);
  drop function if exists public.noter_courriel_alerte_conservation(uuid, text);
  drop function if exists public.alertes_conservation_a_envoyer(integer);
  drop function if exists public.appliquer_conservation_complementaire();
  drop function if exists public.generer_alertes_conservation();
  drop function if exists public.purger_comptes_jamais_utilises();
  drop function if exists public.journal_auth_echus(boolean);
  drop function if exists public.cibles_conservation_complementaire();
  drop function if exists public.purger_document_conservation(uuid, text, date);
  drop function if exists public.echeance_facture_archivee(jsonb, date, integer);
  drop function if exists public.echeance_retractation_abonnement(timestamptz, integer);
  drop function if exists public.echeance_dossier_sans_bail(uuid, integer);
  drop function if exists public.document_dossier_sans_bail(uuid);
  drop function if exists public.personne_sans_bail(uuid);
  drop function if exists public.echeance_conservation_document(uuid);
  drop function if exists public.echeance_conservation_bail(uuid, integer);
  drop function if exists public.fin_conservation_bail(uuid);
  drop function if exists public.empreinte_adresse_prospection(text);
  drop function if exists public.action_audit_controle_interne(text);
  drop function if exists public.action_audit_preuve_contrat(text);
  drop function if exists public.duree_conservation_active(text);
  drop function if exists public.garder_gel_conservation_bail();

  -- 4. Catalogue : durées d'avant, seulement si la valeur est encore celle du plan ; règles ajoutées retirées.
  update public.retention_rules set duree_mois = 60
   where data_type in ('document:bail', 'document:etat_des_lieux', 'document:courrier', 'document:attestation_assurance',
                       'document:reglement_copropriete', 'document:piece_identite', 'document:justificatif')
     and duree_mois = 36;
  update public.retention_rules set duree_mois = 120, declencheur = 'Émission', finalite = 'Obligation comptable'
   where data_type = 'document:quittance' and duree_mois = 36 and declencheur = 'Fin du bail';
  update public.retention_rules set finalite = 'Obligation comptable'
   where data_type = 'document:rapport_gestion' and finalite = 'Obligation comptable de l''agence (commerçant, C. com. L123-22)';
  update public.retention_rules set duree_mois = 36, finalite = 'Traçabilité des actions sensibles (recommandation CNIL)'
   where data_type = 'journal:audit_log' and duree_mois = 12;
  update public.retention_rules set declencheur = 'Dernier échange ou inscription'
   where data_type = 'contact:attente_agences' and declencheur = 'Inscription';
  delete from public.retention_rules where data_type in (
    'preuve:signature',
    'journal:audit_controle_interne',
    'compte:invitation_jamais_utilisee',
    'compte:inscription_non_confirmee',
    'compte:inactif',
    'dossier:sans_bail',
    'personne:fiche',
    'message:locatif',
    'comptable:loyers',
    'incident:dossier',
    'archive:preuve_contrat',
    'archive:facture',
    'contrat:retractation',
    'support:demande_droits',
    'support:question_idee',
    'support:contestation',
    'artisan:evaluation',
    'contact:prospect',
    'prospect:opposition',
    'journal:abonnement_evenements',
    'journal:effacements_a_reappliquer',
    'journal:audit_preuve_contrat',
    'journal:auth_audit');

  -- 5. Prospection : origine libre de nouveau ; colonnes conservées ; oppositions gardées si elles existent.
  alter table public.supervision_prospects drop constraint if exists supervision_prospects_origine_liste;
  revoke update (qualite, dernier_contact_prospect_le) on public.supervision_prospects from authenticated;
  drop table if exists public.conservation_reperes;
  if to_regclass('public.oppositions_prospection') is not null then
    execute 'select count(*) from public.oppositions_prospection' into v_n;
    if v_n = 0 then
      drop table public.oppositions_prospection;
    else
      raise notice 'Retour 20261024140000 : % opposition(s) à la prospection conservée(s) (preuves ; décision du dirigeant requise).', v_n;
    end if;
  end if;

  -- 6. Version d'historique, filet commun.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where left(version, 14) = '20261024140000';  -- les deux formes : production (14 chiffres) et CI (nom du fichier)
  end if;
  perform public.fermer_fonctions_a_anon();
end $retour_atomique$;
