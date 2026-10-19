-- RETOUR ARRIÈRE de 20261018085521_circuit_signature_bail.sql (lot « supervision et signatures », 17-18/10/2026 ;
-- PR #203 : circuit de signature électronique du bail, suivi serveur).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une
-- migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Revenir d'abord au code
-- applicatif antérieur (PR #203 : commit b5f70e6 ; PR #206 : commit 6cb2468), dont src/app/actions/signature-bail.ts,
-- src/lib/signature-bail-worker.ts, src/lib/signature-worker.ts, src/lib/signature-document.ts,
-- src/app/api/zoho-sign/webhook/route.ts et la tâche Vercel `/api/cron/equipes?mission=signatures` (vercel.json).
--
-- Transaction EXTERNE : aucun begin/commit ici, la moindre erreur annule tout. Usage :
--   psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -f 20261018085521_circuit_signature_bail.retour.sql
-- Ordre : après les retours de 20261018193308, 20261018185515, 20261018143644 et 20261018100243 (gardes
-- ci-dessous), avant celui de 20261018071556.
--
-- REFUSE tant qu'il existe des circuits 'preparation' ou 'en_cours' chez le prestataire : les annuler depuis
-- l'application, ou attendre leur fin, avant de retirer le suivi serveur (décision produit à confirmer, voir LISEZ-MOI).
--
-- CONSERVE (preuves : aucun `drop table`, aucun `drop column`) : la table bail_signature_circuits avec toutes ses
-- colonnes, lignes, PK, clés étrangères, CHECK et la contrainte d'unicité rétablie par le retour de 20261018100243,
-- fermée à anon, authenticated et service_role, RLS activé sans politique ; les lignes documents (PDF signés et
-- certificats, storage_path '<org>/signature-bail/<circuit>/…'), document_liens, les objets Storage du bucket
-- `documents`, les alerts de type signature_retournee, les lignes audit_log, baux.document_signe.
-- RETIRE : les fonctions reserver_envoi_signature_bail, verrouiller_signature_bail, archiver_signature_bail,
-- activer_bail_signature_electronique, proteger_document_en_signature_bail, garder_bail_en_signature,
-- garder_signature_manuelle_bail, fichier_en_signature_bail ; les déclencheurs document_signature_bail_verrou
-- (documents), bail_signature_garde_suppression (baux), signature_manuelle_bail_garde (demandes_signature),
-- abonnement_bail_signature_circuits et traversee_lecture_seule (bail_signature_circuits) ; les politiques
-- signature_bail_lecture, signature_bail_serveur et les politiques restrictives signature_bail_fichier_update,
-- signature_bail_fichier_delete de storage.objects ; les index bail_signature_un_circuit_actif, bail_signature_org,
-- bail_signature_bail, bail_signature_document, bail_signature_signe, bail_signature_auteur ; le bloc « Suivi serveur
-- des signatures déjà engagées (18/10/2026) » de refuser_ecriture_si_fermee (retrait chirurgical, l'exception artisan
-- de 20261014846000 qui suit l'ancre reste intacte).
-- RÉINTRODUIT : aucun circuit de signature électronique ; les circuits 'a_verifier' n'ont plus de bouton d'activation
-- (fonction supprimée) : le bail s'active par le chemin manuel ; les restrictions Storage sur les PDF en signature
-- disparaissent.
-- Rejouable : chaque retrait vérifie la présence de l'objet et répond « rien à faire » quand il est déjà absent.

set local lock_timeout = '10s';

-- Gardes d'ordre : les quatre migrations suivantes du lot vivent sur cette table et ces fonctions.
do $ordre$
begin
  if to_regprocedure('public.initialiser_cible_signature()') is not null
     or to_regprocedure('public.reserver_budget_signature(uuid)') is not null
     or to_regprocedure('public.lire_budget_signatures()') is not null then
    raise exception 'Retour 20261018085521 refusé : jouer d''abord le retour de 20261018185515';
  end if;
  if to_regprocedure('public.lire_signature_devis(uuid,uuid)') is not null then
    raise exception 'Retour 20261018085521 refusé : jouer d''abord le retour de 20261018193308';
  end if;
  if to_regclass('public.bail_signature_reference_prestataire') is not null then
    raise exception 'Retour 20261018085521 refusé : jouer d''abord le retour de 20261018100243';
  end if;
  -- (to_regprocedure et non ::regprocedure : l'ordre d'évaluation des opérandes n'est pas garanti.)
  if coalesce(strpos(pg_get_functiondef(to_regprocedure('public.archiver_signature_bail(uuid,uuid,jsonb)')), 'v.prestataire') > 0, false) then
    raise exception 'Retour 20261018085521 refusé : jouer d''abord le retour de 20261018143644';
  end if;
end $ordre$;

-- Garde « en vol » : un circuit engagé chez le prestataire ne serait plus ni suivi ni archivé.
do $en_vol$
declare n integer;
begin
  if to_regclass('public.bail_signature_circuits') is null then return; end if;
  select count(*) into n from public.bail_signature_circuits where etat in ('preparation','en_cours');
  if n > 0 then
    raise exception 'Retour 20261018085521 refusé : % circuit(s) en cours chez le prestataire ; annulez-les depuis l''application ou attendez leur fin avant de retirer le suivi serveur', n;
  end if;
end $en_vol$;

-- (a) Storage : les politiques restrictives dépendent de la fonction, elles partent d'abord.
drop policy if exists signature_bail_fichier_update on storage.objects;
drop policy if exists signature_bail_fichier_delete on storage.objects;
drop function if exists public.fichier_en_signature_bail(text);

-- (b) Demande manuelle pendant un circuit.
drop trigger if exists signature_manuelle_bail_garde on public.demandes_signature;
drop function if exists public.garder_signature_manuelle_bail();

-- (c) Suppression du bail pendant un circuit.
drop trigger if exists bail_signature_garde_suppression on public.baux;
drop function if exists public.garder_bail_en_signature();

-- (d) Version envoyée protégée.
drop trigger if exists document_signature_bail_verrou on public.documents;
drop function if exists public.proteger_document_en_signature_bail();

-- (e) Fonctions du circuit.
drop function if exists public.activer_bail_signature_electronique(uuid);
drop function if exists public.archiver_signature_bail(uuid,uuid,jsonb);
drop function if exists public.verrouiller_signature_bail(uuid,uuid);
drop function if exists public.reserver_envoi_signature_bail(uuid,uuid);

-- (f) refuser_ecriture_si_fermee : le bloc posé par la migration (lignes 201-213, copié tel quel) précède la ligne
-- d'ancre ; il est retiré, l'ancre reste seule devant l'exception artisan de 20261014846000 (modèle : son retour).
do $garde$
declare
  d text;
  n integer;
  ancre constant text := $a$  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;$a$;
  ajout constant text := $b$
  -- Suivi serveur des signatures déjà engagées (18/10/2026).
  if tg_table_name = 'bail_signature_circuits' and tg_op = 'UPDATE' and auth.role() = 'service_role' then
    if old.etat <> 'pret' and new.etat <> 'pret'
      and to_jsonb(old) - array['etat','signataires','external_request_id','external_document_id','document_signe','erreur','updated_at','verrou_jeton','verrou_jusqua']
        = to_jsonb(new) - array['etat','signataires','external_request_id','external_document_id','document_signe','erreur','updated_at','verrou_jeton','verrou_jusqua'] then
      return new;
    end if;
    if old.etat = 'pret' and new.etat = 'annule'
      and to_jsonb(old) - array['etat','erreur','updated_at'] = to_jsonb(new) - array['etat','erreur','updated_at'] then
      return new;
    end if;
  end if;$b$;
begin
  if to_regprocedure('public.refuser_ecriture_si_fermee()') is null then
    raise exception 'Retour 20261018085521 refusé : refuser_ecriture_si_fermee() est absente';
  end if;
  select pg_get_functiondef('public.refuser_ecriture_si_fermee()'::regprocedure) into d;
  if strpos(d, 'Suivi serveur des signatures déjà engagées (18/10/2026)') = 0 then
    raise notice 'refuser_ecriture_si_fermee : bloc du 18/10 absent, rien à faire';
    return;
  end if;
  n := (length(d) - length(replace(d, ajout||E'\n'||ancre, ''))) / length(ajout||E'\n'||ancre);
  if n <> 1 then
    raise exception 'Retour 20261018085521 refusé : refuser_ecriture_si_fermee porte la marque du 18/10 mais pas son bloc exact (% occurrence(s))', n;
  end if;
  execute replace(d, ajout||E'\n'||ancre, ancre);
  execute 'revoke all on function public.refuser_ecriture_si_fermee() from public, anon, authenticated';
  raise notice 'refuser_ecriture_si_fermee : bloc du 18/10 retiré, ancre et exception artisan intactes';
end $garde$;

-- (g) Sur la table conservée : plus de déclencheur, de politique, de droit API ni d'index de travail. PK, clés
-- étrangères, CHECK et unicité de la référence externe restent ; RLS reste activé.
drop trigger if exists abonnement_bail_signature_circuits on public.bail_signature_circuits;
drop trigger if exists traversee_lecture_seule on public.bail_signature_circuits;
drop policy if exists signature_bail_lecture on public.bail_signature_circuits;
drop policy if exists signature_bail_serveur on public.bail_signature_circuits;
drop index if exists public.bail_signature_un_circuit_actif;
drop index if exists public.bail_signature_org;
drop index if exists public.bail_signature_bail;
drop index if exists public.bail_signature_document;
drop index if exists public.bail_signature_signe;
drop index if exists public.bail_signature_auteur;
do $conserve$
begin
  if to_regclass('public.bail_signature_circuits') is not null then
    execute 'revoke all on public.bail_signature_circuits from anon, authenticated, service_role';
    execute $c$comment on table public.bail_signature_circuits is 'Table conservée après le retour de 20261018085521 : circuits de signature archivés avec leurs preuves (documents, alertes, audit) ; plus aucune fonction, déclencheur, politique ni droit API ; lecture par le propriétaire de la base seulement.'$c$;
  end if;
end $conserve$;

-- (h) NE TOUCHE PAS : documents, document_liens, objets Storage, alerts, audit_log, baux.document_signe.

-- (i) Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- (j) Même transaction externe que le retour : la version n'est plus « appliquée », migrations.yml pourra la rejouer.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261018085521');
  end if;
end $historique$;
