-- RETOUR ARRIÈRE de 20261018193308_signature_devis_accord_client.sql (lot « supervision et signatures »,
-- 17-18/10/2026 ; PR #206 : accord du client signé sur le devis de l'artisan).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une
-- migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Revenir d'abord au code
-- applicatif antérieur (PR #206 : commit 6cb2468).
--
-- Transaction EXTERNE : aucun begin/commit ici, la moindre erreur annule tout. Usage :
--   psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -f 20261018193308_signature_devis_accord_client.retour.sql
-- Ordre : premier retour du lot, après celui de 20261018231827 et avant celui de 20261018185515.
--
-- CONSERVE (preuves et réglages : aucun `drop table`, aucun `drop column`) : la table bail_signature_circuits et ses
-- lignes (dont le circuit devis_artisan archivé), la colonne incident_id et sa clé étrangère signature_incident_org_fk
-- (elles disent quel dossier le circuit archivé engageait), les contraintes bail_signature_circuits_modele_check et
-- bail_signature_circuits_signataires_check sous leur forme élargie (leur forme de 20261018185515 ne peut pas être
-- rétablie sans supprimer la ligne devis_artisan : perte de preuve), la colonne signature_budget.devis_actif et sa
-- valeur (réglage : non remise à false), les lignes documents, alerts, audit_log et incident_devis déjà écrites.
-- RETIRE : les fonctions lire_signature_devis, lire_signature_devis_archive, garder_devis_en_signature,
-- refuser_nouvelle_signature_manuelle ; les déclencheurs devis_signature_verrou (incident_devis) et
-- signature_manuelle_fin_nouveaux_envois (demandes_signature) ; la politique signature_devis_lecture ; les index
-- signature_devis_une_offre et signature_incident_org ; la contrainte signature_devis_cible ; le bloc posé dans
-- retenir_devis et celui posé dans reserver_envoi_signature_bail (retraits chirurgicaux à compte exact).
-- RÉINTRODUIT : plus d'accord client signé sur un devis ; les demandes de signature manuelle (demandes_signature)
-- redeviennent possibles côté base dès que le code de la PR #206 est retiré ; retenir_devis ne vérifie plus la
-- signature avant d'affecter la mission.
-- Rejouable : chaque retrait vérifie la présence de l'objet et répond « rien à faire » quand il est déjà absent.

set local lock_timeout = '10s';

-- (a) Fin des nouveaux envois manuels : le déclencheur, puis sa fonction.
drop trigger if exists signature_manuelle_fin_nouveaux_envois on public.demandes_signature;
drop function if exists public.refuser_nouvelle_signature_manuelle();

-- (b) Verrou du devis engagé dans un circuit.
drop trigger if exists devis_signature_verrou on public.incident_devis;
drop function if exists public.garder_devis_en_signature();

-- (c) Lectures côté propriétaire et artisan.
drop function if exists public.lire_signature_devis_archive(uuid,integer);
drop function if exists public.lire_signature_devis(uuid,uuid);

-- (d) retenir_devis : le bloc de contrôle de la signature (lignes 78-85 de la migration, copié tel quel) redevient
-- la seule ligne d'ancre. Compte exact exigé : 1. Une fonction qui cite l'accord client sans ce bloc exact arrête tout.
do $retenir$
declare
  f text;
  n integer;
  bloc constant text := $code$
 if exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.incident_id=d.incident_id and c.etat in ('preparation','en_cours','a_verifier')) then raise exception 'Attendez la fin des signatures avant de confier la mission'; end if;
 if public.has_org_role(p_org,array['proprietaire_direct']::public.membership_role[])
   and ((select devis_actif from public.signature_budget where singleton) or exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.incident_id=d.incident_id and c.etat in ('pret','termine'))) then
   if not exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.cible_id=p_devis and c.etat='termine' and c.environnement='production' and not c.essai and c.document_signe is not null) then raise exception 'Signez ce devis et attendez l’archivage des preuves avant de confier la mission'; end if;
 end if;
 update public.incident_devis
  set statut = 'retenu'$code$;
  ancre constant text := 'update public.incident_devis'||chr(10)||'  set statut = ''retenu''';
begin
  if to_regprocedure('public.retenir_devis(uuid,uuid)') is null then
    raise exception 'Retour 20261018193308 refusé : retenir_devis(uuid,uuid) est absente';
  end if;
  select pg_get_functiondef('public.retenir_devis(uuid,uuid)'::regprocedure) into f;
  n := (length(f) - length(replace(f, bloc, ''))) / length(bloc);
  if n = 0 then
    if strpos(f, 'Attendez la fin des signatures avant de confier la mission') > 0 then
      raise exception 'Retour 20261018193308 refusé : retenir_devis cite l''accord client sans le bloc exact de la migration ; relire avant tout retrait';
    end if;
    raise notice 'retenir_devis : bloc de l''accord client absent, rien à faire';
  elsif n <> 1 then
    raise exception 'Retour 20261018193308 refusé : retenir_devis porte % fois le bloc de la migration (1 attendu)', n;
  else
    execute replace(f, bloc, ancre);
    raise notice 'retenir_devis : contrôle de la signature du devis retiré, ancre rétablie';
  end if;
end $retenir$;

-- (e) reserver_envoi_signature_bail : le bloc devis_artisan (lignes 44-56 de la migration, copié tel quel) redevient
-- la seule ligne `perform public.reserver_budget_signature(p_circuit);` de 20261018185515. Compte exact exigé : 1.
do $reserver$
declare
  f text;
  n integer;
  bloc constant text := $code$
 if v.modele='devis_artisan' then
   perform 1 from public.incidents where id=v.incident_id and organization_id=v.organization_id and etat='qualifie' for update;
   if not found then raise exception 'Le dossier n’est plus en attente d’affectation'; end if;
   perform 1 from public.incident_devis d where d.id=v.cible_id and d.organization_id=v.organization_id and d.incident_id=v.incident_id and d.statut='depose'
     and d.valide_jusqu_au >= (now() at time zone 'Europe/Paris')::date
     and not exists(select 1 from public.incident_devis n where n.sollicitation_id=d.sollicitation_id and n.version>d.version)
     and exists(select 1 from jsonb_array_elements(v.annexes) a join public.documents doc on doc.id=d.document_id and doc.organization_id=d.organization_id where a->>'id'=doc.id::text and a->>'empreinte'=doc.empreinte and doc.purged_at is null)
     for update;
   if not found then raise exception 'Le devis a changé ou expiré. Préparez un nouvel accord'; end if;
   if not v.essai and not (select devis_actif from public.signature_budget where singleton) then raise exception 'La signature des devis est encore en préparation'; end if;
 end if;
 perform public.reserver_budget_signature(p_circuit);$code$;
  ancre constant text := 'perform public.reserver_budget_signature(p_circuit);';
begin
  if to_regprocedure('public.reserver_envoi_signature_bail(uuid,uuid)') is null then
    raise notice 'reserver_envoi_signature_bail : absente (retour de 20261018085521 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.reserver_envoi_signature_bail(uuid,uuid)'::regprocedure) into f;
  n := (length(f) - length(replace(f, bloc, ''))) / length(bloc);
  if n = 0 then
    if strpos(f, $x$v.modele='devis_artisan'$x$) > 0 then
      raise exception 'Retour 20261018193308 refusé : reserver_envoi_signature_bail cite le devis d''artisan sans le bloc exact de la migration ; relire avant tout retrait';
    end if;
    raise notice 'reserver_envoi_signature_bail : bloc devis_artisan absent, rien à faire';
  elsif n <> 1 then
    raise exception 'Retour 20261018193308 refusé : reserver_envoi_signature_bail porte % fois le bloc de la migration (1 attendu)', n;
  else
    execute replace(f, bloc, ancre);
    raise notice 'reserver_envoi_signature_bail : bloc devis_artisan retiré';
  end if;
end $reserver$;

-- (f) Sur la table conservée : garde comportementale retirée, sans perte de ligne. La colonne incident_id, sa clé
-- étrangère signature_incident_org_fk et les deux contraintes élargies restent (voir l'en-tête).
drop policy if exists signature_devis_lecture on public.bail_signature_circuits;
drop index if exists public.signature_devis_une_offre;
drop index if exists public.signature_incident_org;
alter table if exists public.bail_signature_circuits drop constraint if exists signature_devis_cible;

-- (g) Dit en base ce qui est conservé et pourquoi.
do $conserve$
begin
  if to_regclass('public.bail_signature_circuits') is not null then
    execute $c$comment on column public.bail_signature_circuits.incident_id is 'Conservée après le retour de 20261018193308 : dossier d''incident du circuit devis_artisan archivé (preuve) ; plus aucune lecture par l''application.'$c$;
  end if;
  if to_regclass('public.signature_budget') is not null then
    execute $c$comment on column public.signature_budget.devis_actif is 'Conservée après le retour de 20261018193308 : réglage sans effet, valeur gardée telle quelle.'$c$;
  end if;
end $conserve$;

-- (h) Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- (i) Même transaction externe que le retour : la version n'est plus « appliquée », migrations.yml pourra la rejouer.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261018193308');
  end if;
end $historique$;
