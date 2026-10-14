-- RETOUR ARRIÈRE de 20261014231000_retention_registres_execution.sql (D48, fiche IA-11, et volet purge de D13)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- Définition antérieure d'appliquer_retention : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations
-- d'origine SANS cette migration, puis recopiée ici par un générateur. Rejouable : sans la marque « purger_registres_execution »
-- dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014231000_retention_registres_execution.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (IA-11) : les cinq registres (agent_passages, supervision_operations, points_du_matin,
-- decisions_du_matin, brief_direction_snapshots) n'ont plus de règle de conservation ni de purge.
--
-- NE RAMÈNE PAS les lignes déjà purgées : elles sont irrécupérables, sauf par restauration d'une sauvegarde
-- (docs/sauvegarde-et-restauration.md). Les lignes du journal technique « purge_registres_execution » (des nombres) restent.
-- ATTENTION : les cinq lignes de retention_rules sont supprimées telles qu'elles sont ; une durée modifiée à la main depuis
-- la migration serait perdue.
-- Si seul l'effet de la purge gêne, préférer de suspendre les règles :
--   update public.retention_rules set actif = false where data_type in ('journal:agent_passages','journal:supervision_operations',
--     'journal:points_du_matin','journal:decisions_du_matin','journal:brief_direction_snapshots');

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- nettoyage nocturne
select pg_temp.restaurer_fonction('public.appliquer_retention()',
  $marque$purger_registres_execution$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.appliquer_retention()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_regle record;
  v_doc record;
  v_docs_purges int := 0;
  v_docs_anonymises int := 0;
  v_journaux jsonb := '{}'::jsonb;
  v_count bigint;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'appliquer_retention: reserve au super admin';
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:tech_log' and actif;
  if found then
    delete from public.tech_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('tech_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:acces_pieces' and actif;
  if found then
    delete from public.acces_pieces_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('acces_pieces_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:audit_log' and actif;
  if found then
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('audit_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'alerte:traitee' and actif;
  if found then
    delete from public.alerts
      where statut = 'fermee'
        and closed_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('alertes', v_count);
  end if;

  delete from public.demandes_devis
    where created_at < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_devis', v_count);

  delete from public.intentions_conge
    where traitee_le is not null
      and traitee_le < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('intentions_conge', v_count);

  delete from public.demandes_signature ds
    where exists (select 1 from public.documents d
                  where d.id = ds.document_id and d.purged_at is not null
                    and d.anonymise_le is null)
       or (ds.signee_le is not null
           and ds.signee_le < now() - make_interval(months => 24));
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_signature', v_count);

  -- Le compteur court depuis le déclencheur de la règle (fin du bail, du
  -- mandat, de la gestion, clôture de l'incident), pas depuis le dépôt.
  for v_doc in
    select d.id, d.organization_id, d.type, d.storage_path, r.sort, r.data_type, r.libelle,
           public.debut_conservation_document(d.id) as debut
    from public.documents d
    join public.retention_rules r
      on r.data_type = 'document:' || d.type::text and r.actif
    where d.purged_at is null
      and r.sort in ('suppression', 'anonymisation')
      -- préfiltre bon marché : le déclencheur n'est jamais avant le dépôt
      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()
  loop
    continue when v_doc.debut is null;
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
                               'debut_conservation', v_doc.debut));
    v_docs_purges := v_docs_purges + 1;
  end loop;

  v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());
  return jsonb_build_object('journaux', v_journaux, 'documents_purges', v_docs_purges,
                            'documents_anonymises', v_docs_anonymises,
                            'fichiers_en_attente', (select count(*) from public.purge_fichiers where deleted_at is null));
end;
$function$
$definition_anterieure$);

-- La fonction de purge, retirée SANS cascade.
drop function if exists public.purger_registres_execution();

-- Les cinq règles posées par la migration.
delete from public.retention_rules
 where data_type in ('journal:agent_passages', 'journal:supervision_operations', 'journal:points_du_matin',
                     'journal:decisions_du_matin', 'journal:brief_direction_snapshots');

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014231000';
  end if;
end $retour_arriere$;

commit;
