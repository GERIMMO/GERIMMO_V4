-- D13 (fiche SUP-05), décision du dirigeant du 14/10/2026, option A : les « faits de direction » ne copient plus de noms.
--
-- Constat (audit du 13/10) : `collecter_source_direction('echeances')` recopiait `alerts.titre` de TOUTES les organisations dans
-- l'instantané `brief_direction_snapshots`. Or ce titre contient parfois un nom de locataire (« État des lieux d'entrée — Lot 1 ·
-- Marie Durand », « Assurance habitation — <nom> », « Restitution du dépôt — <nom> · … »). La copie était durable (jamais purgée),
-- sans trace de consultation, et Gerimmo est sous-traitant pour ces données.
--
-- Ce que fait cette migration (additive : aucune ligne existante n'est touchée, aucune table n'est modifiée) :
--   1. Une alerte figure dans les faits par son identifiant, un libellé générique tiré de son TYPE (liste fermée, repli neutre
--      « Alerte à traiter ») et un lien. Le titre brut, comme la valeur brute du type (texte libre), n'est jamais recopié.
--   2. Préparer les faits laisse, dans la transaction de la préparation, une ligne d'audit par préparation et une ligne
--      `consultation_faits_direction` par organisation citée (RM-A1.11 : traversée autorisée mais journalisée).
--   3. Lire l'écran /admin/brief laisse la même ligne par organisation citée (une seule par minute pour une même lecture :
--      c'est la règle de `log_sa_access`). `lire_faits_direction` n'est donc plus `stable`.
--   4. Les nouveaux instantanés portent `version_regles = 2`. Le « dernier état connu » d'une source indisponible ne se reprend
--      plus que parmi les instantanés de version 2 : un instantané ancien (version 1, avec des noms) n'est jamais recopié
--      dans un nouveau.
--
-- L'effacement des instantanés existants est une étape SÉPARÉE, IRRÉVERSIBLE, qui exige une sauvegarde :
-- 20261014232000_effacement_instantanes_faits_direction.sql. La purge dans la rétention (six mois) est dans
-- 20261014231000_retention_registres_execution.sql.
--
-- Retour arrière : app/supabase/retours-arriere/20261014230000_faits_direction_sans_noms.retour.sql.
-- Rejouable : create or replace.

-- ── 1. Le libellé générique d'un type d'alerte ─────────────────────────────────────────────────────────────────────────
-- Liste fermée : un type nouveau ou libre (le champ est un texte que des agents peuvent poser) donne le libellé neutre.
create or replace function public.libelle_generique_alerte(p_type text)
returns text language sql immutable set search_path = '' as $$
  select case p_type
    when 'assurance_expiration' then 'Attestation d’assurance à renouveler'
    when 'attestation_a_verifier' then 'Attestation à contrôler'
    when 'avenant_devis_a_decider' then 'Dépassement de devis à décider'
    when 'conge_intention' then 'Congé à confirmer'
    when 'creneaux_arbitrage' then 'Rendez-vous à arbitrer'
    when 'decompte' then 'Décompte de restitution à envoyer'
    when 'decompte_lrar' then 'Décompte de restitution à envoyer en recommandé'
    when 'diagnostic_expiration' then 'Diagnostic à renouveler'
    when 'ecart_versement' then 'Écart de versement au propriétaire'
    when 'edl_entree' then 'État des lieux d’entrée à faire'
    when 'edl_sortie' then 'État des lieux de sortie à faire'
    when 'facture_artisan_a_valider' then 'Facture d’artisan à contrôler'
    when 'incident_a_qualifier' then 'Incident à qualifier'
    when 'incident_conteste' then 'Imputation d’incident contestée'
    when 'incident_imputation_a_reviser' then 'Imputation à réviser avant facturation'
    when 'loyer_impaye' then 'Loyer impayé'
    when 'manuelle' then 'Alerte saisie à la main'
    when 'message_locataire' then 'Message d’un locataire'
    when 'piece_deposee' then 'Pièce déposée à contrôler'
    when 'restitution_echeance' then 'Restitution du dépôt de garantie à traiter'
    when 'retenue_sans_justificatif' then 'Retenue sans justificatif'
    when 'signature_a_reprendre' then 'Signature à reprendre'
    when 'signature_retournee' then 'Document signé à contrôler'
    when 'versement_proprietaire' then 'Versement au propriétaire à faire'
    when 'zone_tendue_a_verifier' then 'Zone tendue à vérifier'
    else 'Alerte à traiter'
  end;
$$;
revoke all on function public.libelle_generique_alerte(text) from public, anon, authenticated;

-- ── 2. Les organisations citées par un instantané (par les liens de ses faits) ────────────────────────────────────────
-- Fonction interne : seules les fonctions de ce fichier l'appellent. Une organisation supprimée depuis n'est pas rendue.
create or replace function public.organisations_citees_faits_direction(p_sources jsonb)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct o.id), '{}'::uuid[])
  from jsonb_path_query(coalesce(p_sources, '{}'::jsonb), '$.*.donnees.faits[*].href') as h(v)
  cross join lateral regexp_match(h.v #>> '{}', '^/agence/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/') as m
  join public.organizations o on o.id = m[1]::uuid;
$$;
revoke all on function public.organisations_citees_faits_direction(jsonb) from public, anon, authenticated;

-- ── 3. La collecte : seule la source « echeances » change ─────────────────────────────────────────────────────────────
-- Collecte bornée : chiffres complets, vingt liens de dossier au plus par source. Les montants réemploient l'état des loyers
-- existant, sans nouvelle règle d'imputation, de fiscalité ou de paiement.
create or replace function public.collecter_source_direction(p_source text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 case p_source
 when 'incidents' then
  select jsonb_build_object('mesures',jsonb_build_object('urgents_ouverts',count(*)),
   'faits',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object('titre',i.numero||' · '||i.etat::text,'date',i.created_at,'href','/agence/'||i.organization_id||'/incidents?sel='||i.id) obj
    from public.incidents i where i.urgence='urgente' and i.etat<>'clos' order by i.created_at limit 20)x),'[]'::jsonb)) into r
  from public.incidents where urgence='urgente' and etat<>'clos';
 when 'interventions' then
  select jsonb_build_object('mesures',jsonb_build_object('rendez_vous_depasses',count(*) filter(where fin_prevue<now()),'missions_sans_date',count(*) filter(where fin_prevue is null)),
   'faits',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object('titre',inc.numero||' · rendez-vous dépassé','date',iv.fin_prevue,'href','/agence/'||iv.organization_id||'/incidents?sel='||iv.incident_id) obj
    from public.incident_interventions iv join public.incidents inc on inc.id=iv.incident_id
    where iv.statut in ('acceptee','planifiee','en_cours') and iv.fin_prevue<now() order by iv.fin_prevue limit 20)x),'[]'::jsonb)) into r
  from public.incident_interventions where statut in ('acceptee','planifiee','en_cours');
 when 'loyers' then
  with etats as materialized(select b.organization_id,b.id bail_id,e.* from public.baux b cross join lateral public.etat_loyers_bail_brut(b.id)e),
   retards as(select * from etats where date_echeance<current_date and montant_couvert<montant_du),
   prochains as(select * from etats where date_echeance between current_date and current_date+7 and montant_couvert<montant_du)
  select jsonb_build_object('mesures',jsonb_build_object('echeances_en_retard',(select count(*) from retards),'reste_en_retard_eur',(select coalesce(sum(montant_du-montant_couvert),0) from retards),'echeances_prochains_7_jours',(select count(*) from prochains),'reste_prochains_7_jours_eur',(select coalesce(sum(montant_du-montant_couvert),0) from prochains)),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('titre','Échéance en retard · '||to_char(montant_du-montant_couvert,'FM999999999990.00')||' €','date',date_echeance,'href','/agence/'||organization_id||'/baux/'||bail_id) obj from retards order by date_echeance limit 20)x),'[]'::jsonb)) into r;
 when 'echeances' then
  -- D13 (SUP-05) : ni le titre de l'alerte (qui contient parfois un nom de locataire), ni la valeur brute de son type. Un fait est
  -- l'identifiant de l'alerte, un libellé générique tiré de son type, sa date et le lien vers la liste des alertes de l'organisation.
  select jsonb_build_object('mesures',jsonb_build_object('alertes_en_retard',count(*) filter(where echeance<current_date),'alertes_prochains_7_jours',count(*) filter(where echeance between current_date and current_date+7),'alertes_critiques',count(*) filter(where criticite='critique')),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('id',id,'titre','Alerte · '||public.libelle_generique_alerte(type),'date',echeance,'href','/agence/'||organization_id||'/alertes') obj from public.alerts where statut='ouverte' and echeance<=current_date+7 order by echeance limit 20)x),'[]'::jsonb)) into r
  from public.alerts where statut='ouverte';
 when 'service' then
  select jsonb_build_object('mesures',jsonb_build_object('passages_24h',count(*),'passages_en_echec_24h',count(*) filter(where etat in ('a_reprendre','interrompu'))),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('titre',mission||' · '||etat,'date',debut,'href','/admin/equipes') obj from public.agent_passages where debut>=now()-interval '24 hours' and etat in ('a_reprendre','interrompu') order by debut desc limit 20)x),'[]'::jsonb)) into r
  from public.agent_passages where debut>=now()-interval '24 hours';
 else raise exception 'Source de direction inconnue';
 end case;
 return r;
end;
$$;
revoke all on function public.collecter_source_direction(text) from public,anon;
grant execute on function public.collecter_source_direction(text) to authenticated;

-- ── 4. La préparation : version 2, dernier état connu limité à la version 2, trace dans la transaction ───────────────────
create or replace function public.preparer_faits_direction()
returns jsonb language plpgsql security definer set search_path='' as $$
declare cle text; donnees jsonb; precedent jsonb; sources jsonb:='{}'; manquantes text[]:='{}'; resultat public.brief_direction_snapshots; citees uuid[]; une_org uuid;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 -- Sérialise deux clics : une préparation simultanée ne fait pas concurrence
 -- au choix du dernier état connu. Aucun envoi, tâche ni décision créé ici.
 perform pg_advisory_xact_lock(hashtext('brief_direction_manuel'));
 foreach cle in array array['incidents','interventions','loyers','echeances','service'] loop
  begin
   donnees:=public.collecter_source_direction(cle);
   if donnees is null or jsonb_typeof(donnees)<>'object' then raise exception 'Source vide'; end if;
   sources:=sources||jsonb_build_object(cle,jsonb_build_object('statut','disponible','observe_le',now(),'donnees',donnees));
  exception when others then
   -- D13 (SUP-05) : seul un instantané de version 2 (sans nom) peut servir de dernier état connu.
   select s.sources->cle into precedent from public.brief_direction_snapshots s
    where s.version_regles>=2 and s.sources->cle->>'observe_le' is not null order by s.genere_le desc limit 1;
   manquantes:=array_append(manquantes,cle);
   sources:=sources||jsonb_build_object(cle,jsonb_build_object('statut','indisponible','observe_le',precedent->'observe_le','donnees',precedent->'donnees','erreur','Lecture indisponible ; dernier état connu conservé','code_erreur',SQLSTATE));
  end;
 end loop;
 insert into public.brief_direction_snapshots(jour,auteur_reel,sources,indisponibles,version_regles)
 values((now() at time zone 'Europe/Paris')::date,auth.uid(),sources,manquantes,2) returning * into resultat;
 -- D13 (SUP-05) : la préparation traverse les organisations ; elle le dit au journal d'audit, dans la même transaction.
 citees:=public.organisations_citees_faits_direction(resultat.sources);
 perform public.log_sa_access(null,'preparation_faits_direction',jsonb_build_object('snapshot',resultat.id,'organisations',cardinality(citees),'sources_indisponibles',cardinality(manquantes)));
 foreach une_org in array citees loop
  perform public.log_sa_access(une_org,'consultation_faits_direction',jsonb_build_object('snapshot',resultat.id,'origine','preparation'));
 end loop;
 return to_jsonb(resultat);
end;
$$;
revoke all on function public.preparer_faits_direction() from public,anon;
grant execute on function public.preparer_faits_direction() to authenticated;

-- ── 5. La lecture : tracée par organisation citée (la fonction n'est plus « stable » : elle écrit au journal) ─────────────
create or replace function public.lire_faits_direction(p_jour date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.brief_direction_snapshots; une_org uuid;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 select * into r from public.brief_direction_snapshots s where s.jour=p_jour order by s.genere_le desc limit 1;
 if not found then return null; end if;
 -- D13 (SUP-05) : consultation tracée, une ligne par organisation citée (RM-A1.11).
 foreach une_org in array public.organisations_citees_faits_direction(r.sources) loop
  perform public.log_sa_access(une_org,'consultation_faits_direction',jsonb_build_object('snapshot',r.id,'jour',r.jour));
 end loop;
 return to_jsonb(r);
end;
$$;
revoke all on function public.lire_faits_direction(date) from public,anon;
grant execute on function public.lire_faits_direction(date) to authenticated;

-- Convention de toute migration qui touche une fonction : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
