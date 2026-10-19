-- RETOUR ARRIÈRE de 20261018185515_signatures_documents_budget.sql (lot « supervision et signatures »,
-- 17-18/10/2026 ; PR #206 : signature des documents du bail, de l'EDL et budget mensuel de crédits).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une
-- migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Revenir d'abord au code
-- applicatif antérieur (PR #206 : commit 6cb2468).
--
-- Transaction EXTERNE : aucun begin/commit ici, la moindre erreur annule tout. Usage :
--   psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -f 20261018185515_signatures_documents_budget.retour.sql
-- Ordre : après le retour de 20261018193308 (garde d'ordre ci-dessous), avant celui de 20261018143644.
--
-- CONSERVE (preuves et réglages : aucun `drop table`, aucun `drop column`) : les tables signature_budget (réglage du
-- plafond, valeurs gardées telles quelles) et signature_consommations (registre des crédits réservés par circuit),
-- fermées à anon, authenticated et service_role, RLS activé sans politique ; les colonnes modele, cible_id (redevient
-- nullable : les fonctions de 20261018085521 insèrent sans elle et le déclencheur qui la remplissait disparaît),
-- options et essai de bail_signature_circuits ; les états des lieux passés à 'signe'/'pdf_signe', les lignes d'audit
-- signature_budget_modifie et les documents archivés.
-- RETIRE : les fonctions lire_budget_signatures, regler_budget_signature, reserver_budget_signature,
-- garder_edl_en_signature, initialiser_cible_signature ; les déclencheurs edl_circuit_verrou, edl_lignes_circuit_verrou,
-- edl_cles_circuit_verrou, edl_compteurs_circuit_verrou, signature_cible ; les politiques et droits des deux tables
-- conservées ; l'index signature_consommations_mois. RÉTABLIT : reserver_envoi_signature_bail et
-- activer_bail_signature_electronique dans leur forme de 20261018085521, archiver_signature_bail dans sa forme de
-- 20261018143644 (textes copiés tels quels des migrations), l'index unique bail_signature_un_circuit_actif(bail_id)
-- (refus s'il existe des doublons de circuits actifs par bail).
-- RÉINTRODUIT : plus de signature d'EDL, d'avenant ni de cautionnement ; plus de plafond mensuel de crédits ; l'alerte
-- reprend les libellés « Bail signé par toutes les parties » / « Contrat et preuves archivés — à vérifier avant
-- activation » pour tout document.
-- Rejouable : chaque geste vérifie l'état en vigueur et répond « rien à faire » quand il est déjà fait.

set local lock_timeout = '10s';

-- Garde d'ordre : 20261018193308 surcouche cette migration (bloc devis_artisan dans reserver_envoi_signature_bail,
-- contrainte signature_devis_cible qui cite la colonne modele, fonctions de lecture du devis).
do $ordre$
declare f text;
begin
  if to_regprocedure('public.lire_signature_devis(uuid,uuid)') is not null
     or exists(select 1 from pg_constraint where conname = 'signature_devis_cible') then
    raise exception 'Retour 20261018185515 refusé : jouer d''abord le retour de 20261018193308';
  end if;
  if to_regprocedure('public.reserver_envoi_signature_bail(uuid,uuid)') is not null then
    select pg_get_functiondef('public.reserver_envoi_signature_bail(uuid,uuid)'::regprocedure) into f;
    if strpos(f, $x$v.modele='devis_artisan'$x$) > 0 then
      raise exception 'Retour 20261018185515 refusé : jouer d''abord le retour de 20261018193308';
    end if;
  end if;
end $ordre$;

-- (a) Budget : lecture et réglage.
drop function if exists public.lire_budget_signatures();
drop function if exists public.regler_budget_signature(integer,integer);

-- (b) Verrous de l'état des lieux en signature : les déclencheurs, puis la fonction.
drop trigger if exists edl_circuit_verrou on public.etats_des_lieux;
drop trigger if exists edl_lignes_circuit_verrou on public.edl_lignes;
drop trigger if exists edl_cles_circuit_verrou on public.edl_cles;
drop trigger if exists edl_compteurs_circuit_verrou on public.edl_compteurs;
drop function if exists public.garder_edl_en_signature();

-- (c) reserver_envoi_signature_bail : forme de 20261018085521 (lignes 46-66 de cette migration, copiées telles
-- quelles, `create function` devenu `create or replace function`). Forme attendue avant : la réservation de budget,
-- le bloc EDL et le filtre `and v.modele='bail'`, chacun exactement une fois.
do $reserver$
declare f text;
begin
  if to_regprocedure('public.reserver_envoi_signature_bail(uuid,uuid)') is null then
    raise notice 'reserver_envoi_signature_bail : absente (retour de 20261018085521 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.reserver_envoi_signature_bail(uuid,uuid)'::regprocedure) into f;
  if strpos(f, 'reserver_budget_signature') = 0 and strpos(f, 'v.modele') = 0 then
    raise notice 'reserver_envoi_signature_bail : déjà sous sa forme de 20261018085521, rien à faire';
    return;
  end if;
  if (length(f) - length(replace(f, 'perform public.reserver_budget_signature(p_circuit);', ''))) / length('perform public.reserver_budget_signature(p_circuit);') = 1
     and (length(f) - length(replace(f, $x$v.modele='edl'$x$, ''))) / length($x$v.modele='edl'$x$) = 1
     and (length(f) - length(replace(f, $x$and v.modele='bail'$x$, ''))) / length($x$and v.modele='bail'$x$) = 1 then
    execute $def$
create or replace function public.reserver_envoi_signature_bail(p_circuit uuid, p_actor uuid)
returns public.bail_signature_circuits language plpgsql security invoker set search_path='' as $$
declare v public.bail_signature_circuits;
begin
  select * into v from public.bail_signature_circuits where id=p_circuit for update;
  if not found or not exists(select 1 from public.memberships m where m.account_id=p_actor
    and m.organization_id=v.organization_id and m.status='active' and m.role='proprietaire_direct') then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  if v.etat <> 'pret' then raise exception 'Ce circuit a déjà été envoyé ou doit être vérifié.'; end if;
  if exists(select 1 from public.demandes_signature d join public.document_liens dl on dl.document_id=d.document_id
    join public.documents doc on doc.id=d.document_id
    where dl.entite='bail' and dl.entite_id=v.bail_id and doc.type='bail' and d.signee_le is null) then
    raise exception 'Annulez les demandes manuelles en attente avant cet envoi.';
  end if;
  update public.bail_signature_circuits set etat='preparation',updated_at=now(),erreur=null
    where id=p_circuit returning * into v;
  insert into public.audit_log(account_id,organization_id,action,details)
    values(p_actor,v.organization_id,'signature_bail_envoi_demande',jsonb_build_object('circuit_id',v.id,'bail_id',v.bail_id,'environnement',v.environnement));
  return v;
end $$;
$def$;
    execute 'revoke all on function public.reserver_envoi_signature_bail(uuid,uuid) from public,anon,authenticated';
    execute 'grant execute on function public.reserver_envoi_signature_bail(uuid,uuid) to service_role';
    raise notice 'reserver_envoi_signature_bail : forme de 20261018085521 rétablie';
  else
    raise exception 'Retour 20261018185515 refusé : définition inattendue de reserver_envoi_signature_bail, aucune réécriture';
  end if;
end $reserver$;

-- (d) archiver_signature_bail : forme de 20261018143644 (lignes 3-52 de cette migration, copiées telles quelles).
-- Forme attendue avant : `original.type::text` et le bloc `v.modele='edl'`, chacun exactement une fois.
do $archiver$
declare f text;
begin
  if to_regprocedure('public.archiver_signature_bail(uuid,uuid,jsonb)') is null then
    raise notice 'archiver_signature_bail : absente (retour de 20261018085521 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.archiver_signature_bail(uuid,uuid,jsonb)'::regprocedure) into f;
  if strpos(f, 'v.modele') = 0 then
    raise notice 'archiver_signature_bail : déjà sans le bloc de 20261018185515, rien à faire';
    return;
  end if;
  if (length(f) - length(replace(f, 'original.type::text', ''))) / length('original.type::text') = 1
     and (length(f) - length(replace(f, $x$v.modele='edl'$x$, ''))) / length($x$v.modele='edl'$x$) = 1 then
    execute $def$
create or replace function public.archiver_signature_bail(p_circuit uuid,p_jeton uuid,p_archives jsonb)
-- Le classement de signatures déjà reçues continue après une suspension.
-- Réglage local à la transaction serveur, restauré avant le retour normal.
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 v public.bail_signature_circuits; a jsonb; idx integer:=0; doc uuid; signe uuid;
 preuve_commune uuid; parties jsonb; racine text; chemin text; original public.documents; contexte_systeme text;
begin
 select * into v from public.bail_signature_circuits where id=p_circuit for update;
 if not found then raise exception 'Circuit inconnu'; end if;
 if v.document_signe is not null then return v.document_signe; end if;
 if p_jeton is null or v.verrou_jeton is distinct from p_jeton or v.verrou_jusqua is null or v.verrou_jusqua<now() then raise exception 'Verrou expiré'; end if;
 if not coalesce(jsonb_typeof(p_archives)='array' and jsonb_array_length(p_archives)=jsonb_array_length(v.signataires)+1,false) then raise exception 'Archives incomplètes'; end if;
 if exists(select 1 from jsonb_array_elements(v.signataires) s where s->>'statut' is distinct from 'signed') then raise exception 'Toutes les parties doivent avoir signé'; end if;
 select * into strict original from public.documents where id=v.document_id and organization_id=v.organization_id;
 contexte_systeme:=current_setting('gerimmo.systeme',true);
 perform pg_catalog.set_config('gerimmo.systeme','on',true);
 parties:=v.signataires;
 racine:=v.organization_id||'/signature-bail/'||v.id||'/';
 for a in select value from jsonb_array_elements(p_archives) loop
   chemin:=racine||(case when idx=0 then 'contrat.pdf' when v.prestataire='zoho' then 'preuve-1.pdf' else 'preuve-'||idx||'.pdf' end);
   if a->>'path' is distinct from chemin
      or not coalesce((a->>'size')::bigint between 5 and 10485760,false) or not coalesce(a->>'hash' ~ '^[a-f0-9]{64}$',false) then raise exception 'Archive invalide'; end if;
   if v.prestataire='zoho' and idx>1 then
     if preuve_commune is null or a is distinct from (p_archives->1) then raise exception 'Certificat commun incohérent'; end if;
     doc:=preuve_commune;
   else
     insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
     values(v.organization_id,(case when idx=0 then 'bail' else 'autre' end)::public.document_type,
       case when idx=0 then original.titre||' — signé'
         when v.prestataire='zoho' then 'Certificat de réalisation — signature du bail'
         else 'Preuve de signature — '||(parties->(idx-1)->>'prenom')||' '||(parties->(idx-1)->>'nom') end,
       a->>'path','application/pdf',(a->>'size')::bigint,a->>'hash') returning id into doc;
     insert into public.document_liens(organization_id,document_id,entite,entite_id)
       select organization_id,doc,entite,entite_id from public.document_liens where document_id=v.document_id;
     if v.prestataire='zoho' and idx=1 then preuve_commune:=doc; end if;
   end if;
   if idx=0 then signe:=doc;
   else parties:=jsonb_set(parties,array[(idx-1)::text,'preuveDocumentId'],to_jsonb(doc::text)); end if;
   idx:=idx+1;
 end loop;
 update public.bail_signature_circuits set etat='termine',document_signe=signe,signataires=parties,erreur=null,updated_at=now() where id=v.id;
 insert into public.alerts(organization_id,type,criticite,titre,details)
 values(v.organization_id,'signature_retournee','normale','Bail signé par toutes les parties',
   jsonb_build_object('bail_id',v.bail_id,'document_id',signe,'circuit_id',v.id,'libelle','Contrat et preuves archivés — à vérifier avant activation'));
 insert into public.audit_log(account_id,organization_id,action,details)
 values(v.created_by,v.organization_id,'signature_bail_archivee',jsonb_build_object('circuit_id',v.id,'document_signe',signe,'preuves',idx-1));
 perform pg_catalog.set_config('gerimmo.systeme',coalesce(contexte_systeme,''),true);
 return signe;
end $$;
$def$;
    execute 'revoke all on function public.archiver_signature_bail(uuid,uuid,jsonb) from public,anon,authenticated';
    execute 'grant execute on function public.archiver_signature_bail(uuid,uuid,jsonb) to service_role';
    raise notice 'archiver_signature_bail : forme de 20261018143644 rétablie';
  else
    raise exception 'Retour 20261018185515 refusé : définition inattendue de archiver_signature_bail, aucune réécriture';
  end if;
end $archiver$;

-- (e) activer_bail_signature_electronique : retrait chirurgical de la condition sur le modèle et l'essai (compte 1).
do $activer$
declare
  f text;
  n integer;
  apres constant text := $x$if v.modele<>'bail' or v.essai or v.etat<>'termine'$x$;
  avant constant text := $x$if v.etat<>'termine'$x$;
begin
  if to_regprocedure('public.activer_bail_signature_electronique(uuid)') is null then
    raise notice 'activer_bail_signature_electronique : absente (retour de 20261018085521 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.activer_bail_signature_electronique(uuid)'::regprocedure) into f;
  n := (length(f) - length(replace(f, apres, ''))) / length(apres);
  if n = 0 then
    if strpos(f, avant) = 0 then
      raise exception 'Retour 20261018185515 refusé : définition inattendue de activer_bail_signature_electronique, aucune réécriture';
    end if;
    raise notice 'activer_bail_signature_electronique : déjà sous sa forme de 20261018085521, rien à faire';
    return;
  elsif n <> 1 then
    raise exception 'Retour 20261018185515 refusé : activer_bail_signature_electronique porte % fois la condition de la migration (1 attendu)', n;
  end if;
  execute replace(f, apres, avant);
  execute 'revoke all on function public.activer_bail_signature_electronique(uuid) from public,anon';
  execute 'grant execute on function public.activer_bail_signature_electronique(uuid) to authenticated';
  raise notice 'activer_bail_signature_electronique : condition sur le modèle et l''essai retirée';
end $activer$;

-- (f) La cible n'est plus remplie par déclencheur : la colonne reste, redevenue facultative (aucune ligne réécrite).
drop trigger if exists signature_cible on public.bail_signature_circuits;
drop function if exists public.initialiser_cible_signature();
alter table if exists public.bail_signature_circuits alter column cible_id drop not null;

-- (g) Un seul circuit actif par bail (forme des lignes 28-29 de 20261018085521) : refus en présence de doublons.
do $index$
declare def text; doublons integer;
begin
  if to_regclass('public.bail_signature_circuits') is null then
    raise notice 'bail_signature_un_circuit_actif : table absente, rien à faire';
    return;
  end if;
  select indexdef into def from pg_indexes where schemaname = 'public' and indexname = 'bail_signature_un_circuit_actif';
  if def is null then
    raise notice 'bail_signature_un_circuit_actif : index absent, rien à faire';
    return;
  end if;
  if strpos(def, 'modele') = 0 then
    raise notice 'bail_signature_un_circuit_actif : déjà par bail seul, rien à faire';
    return;
  end if;
  select count(*) into doublons from (
    select bail_id from public.bail_signature_circuits
    where bail_id is not null and etat in ('pret','preparation','en_cours','a_verifier')
    group by bail_id having count(*) > 1
  ) d;
  if doublons > 0 then
    raise exception 'Retour 20261018185515 refusé : % bail(x) portent plusieurs circuits actifs ; annulez les doublons avant de rétablir l''index unique par bail', doublons;
  end if;
  drop index public.bail_signature_un_circuit_actif;
  create unique index bail_signature_un_circuit_actif on public.bail_signature_circuits(bail_id)
    where etat in ('pret','preparation','en_cours','a_verifier');
  raise notice 'bail_signature_un_circuit_actif : index unique par bail rétabli';
end $index$;

-- (h) Tables conservées, fermées : plus de politique, plus de droit API, RLS activé, index de travail retiré.
drop policy if exists signature_budget_admin on public.signature_budget;
drop policy if exists signature_budget_serveur on public.signature_budget;
drop policy if exists signature_consommations_admin on public.signature_consommations;
drop policy if exists signature_consommations_serveur on public.signature_consommations;
drop index if exists public.signature_consommations_mois;
do $conserve$
begin
  if to_regclass('public.signature_budget') is not null then
    execute 'revoke all on public.signature_budget from anon, authenticated, service_role';
    execute $c$comment on table public.signature_budget is 'Conservée après le retour de 20261018185515 : réglage du plafond de crédits de signature ; aucune fonction, politique ni droit API.'$c$;
  end if;
  if to_regclass('public.signature_consommations') is not null then
    execute 'revoke all on public.signature_consommations from anon, authenticated, service_role';
    execute $c$comment on table public.signature_consommations is 'Conservée après le retour de 20261018185515 : registre des crédits réservés par circuit (preuve de consommation) ; aucune fonction, politique ni droit API.'$c$;
  end if;
end $conserve$;

-- (i) Après (c) : la réservation d'envoi rétablie n'appelle plus la réservation de budget.
drop function if exists public.reserver_budget_signature(uuid);

-- (k) Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- (l) Même transaction externe que le retour : la version n'est plus « appliquée », migrations.yml pourra la rejouer.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261018185515');
  end if;
end $historique$;
