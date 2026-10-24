-- Plan de conformité du 23/10/2026 — lot 2 (migrations de conservation), lot 1F (prospection, R45) et, du lot 1E,
-- les alertes avant suppression (J-30, J-15) et le gel en cas de litige. Décisions du dirigeant du 23/10 : éditeur
-- NON commerçant (factures de Gerimmo : six ans, livre des procédures fiscales, art. L. 102 B ; preuve des contrats
-- conclus en ligne : dix ans, code de la consommation, L. 213-1) ; document:rapport_gestion des agences inchangé.
--
-- Aucune source juridique n'a pu être ouverte le 23/10 : chaque durée et chaque libellé de texte est « à relire par le
-- juriste (source non ouverte le 23/10/2026) ». Les durées sont une politique de service, pas une certification.
--
-- CE QUE FAIT LA MIGRATION
-- 1. Catalogue `retention_rules` : durées du tableau du lot 2 (36 mois pour les pièces et actes du bail, quittances
--    après la fin du bail, journal d'audit à 12 mois et contrôle interne à 36 mois…), nouvelles règles avec le statut
--    « actif au déploiement » du plan (les règles « non, puis oui » sont créées INACTIVES), règle `archive:facture`
--    (décision 2) et règle R64 du journal d'authentification Supabase, INACTIVE (un relevé en lecture seule décidera).
--    Une durée déjà modifiée à la main n'est jamais écrasée : chaque mise à jour vise l'ancienne valeur exacte.
-- 2. Gel en cas de litige : `baux.conservation_gelee_jusqu_au` et `conservation_gelee_motif`, douze mois au plus,
--    renouvelable, posé ou levé par `geler_conservation_bail` (journalisé dans `audit_log`), jamais par une écriture
--    directe de l'API.
-- 3. Échéances : `fin_conservation_bail` (fin du bail, sortie réelle, état des lieux de sortie, restitution finalisée ;
--    une restitution « en cours » retient le compteur douze mois au plus), `echeance_conservation_bail` (avec le gel),
--    `echeance_conservation_document` (quittance sans bail : émission + 120 mois ; « autre » rattaché à un bail :
--    36 mois après la fin du bail). `appliquer_retention` compte désormais avec l'échéance, et la purge passe outre la
--    lecture seule d'un abonnement fermé (une pièce échue d'un compte suspendu faisait échouer toute la purge).
-- 4. Catégories nouvelles, sélection et purge par les mêmes conditions (`cibles_conservation_complementaire`) :
--    preuves de signature (circuits et demandes, avec leurs pièces), pièces d'une personne sans bail, retours d'aide
--    (dans l'ordre groupe_id, soutiens, historique, retours), évaluations des artisans, prospects et oppositions,
--    comptes jamais utilisés, archives des comptes (factures puis preuve), événements Stripe traités, journal
--    d'authentification. Le bilan sans suppression (`simuler_conservation_contacts`) couvre toutes les catégories.
-- 5. Contacts : liste d'attente des agences comptée depuis l'inscription ; inscription « retirée » supprimée (et son
--    empreinte gardée comme opposition), « convertie » supprimée trois mois après la conversion ; fiche prospect d'un
--    particulier supprimée avec sa demande de contact, registre compris.
-- 6. Prospection (R45) : origine en liste fermée, `oppose_le`, `dernier_contact_prospect_le`, `qualite`, table
--    `oppositions_prospection` (empreinte SHA-256 de l'adresse), opposition enregistrée par la supervision, préparation
--    du premier message refusée après une opposition.
-- 7. Alertes J-30 (pièces d'un bail) et J-15 (pièces d'une personne sans bail) dans `alerts`, et file de leurs
--    courriels pour la mission « rappels ».
--
--
-- RELECTURES ADVERSES DU 24/10 (corrigées ici, la migration n'est pas encore en production) :
--  · journal:audit_controle_interne couvre aussi les accès de la supervision (`consultation_…` de log_sa_access,
--    export de la liste d'attente) et les preuves d'effacement (`fermeture_…`, `effacements_…` du domaine comptes) :
--    la page confidentialité annonce trois ans pour eux ;
--  · R41 : le lien « organisation » que la GED pose sur toute pièce ne rattache pas la pièce à autre chose ;
--  · R38 : comptes d'invités créés confirmés ciblés sur l'absence de connexion, repère « invité » posé avant la purge
--    des invitations, invitations échues supprimées avec le compte ; un compte bloqué n'est retenté qu'après sept jours ;
--  · R46 : un circuit resté ouvert sur un bail échu part une fois expiré ;
--  · pièce d'un type « fin du bail » sans aucun bail : durée des autres documents (document:autre, depuis le dépôt) ;
--  · alertes : une par bail et par date (J-30), documents sans bail annoncés aussi, alertes fermées quand la date
--    change (gel, rattachement), file revérifiée avant l'envoi, préavis de trente jours à la levée d'un gel ;
--  · prospection : au « Stop », toutes les fiches de l'adresse partent aussitôt (registre compris), une fiche recréée
--    pour une adresse opposée part au nettoyage, dernier contact jamais dans le futur, ancienne origine des fiches
--    nées d'une demande rangée ; inscription d'agence retirée supprimée sans attendre l'activation d'une règle ;
--  · bilan : signalements, alertes traitées et demandes de congé comptés ; gel et lecture refusés hors portefeuille.
--
-- INTÉGRATION DU 24/10 (sur le socle final, la vente 20261024110000 et les comptes 20261024130000) :
--  · une seule échéance des factures archivées : la garde du socle (`archives_comptes_garde` : factures comptées, date
--    de purge posée par la base) retire une facture à l'échéance de `echeance_facture_archivee`, comme la purge et la
--    date affichée ; elle comptait six ans depuis l'émission, plus tôt que la règle archive:facture ;
--  · contrat:retractation : la garde d'ajout seul de `retractations_abonnement` (vente) laisse passer la suppression
--    d'une déclaration arrivée au terme de sa preuve (dix ans, jamais moins), que la purge de la nuit fait quand la
--    règle est active ; le bilan la compte ;
--  · journal:effacements_a_reappliquer : le registre des fermetures (comptes) part quatre mois après l'exécution ;
--  · compte:inactif reste une règle de catalogue, inactive : la fermeture pour inactivité du domaine comptes l'exécute
--    (24 mois depuis la dernière connexion d'un membre ou la fin du dernier abonnement payé, deux avertissements),
--    gardée par VERSION_MIN_INACTIVITE (src/lib/comptes-fermeture.ts) ; l'une et l'autre s'activent à la V1.
--
-- Rejouable : IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO NOTHING, remplacements à compte exact qui acceptent la
-- forme déjà convertie (marque CONSERVATION_20261024) et s'arrêtent en nommant la fonction sinon. `search_path = ''`,
-- `fermer_fonctions_a_anon()` en fin. Aucune donnée existante réécrite, sauf les durées décidées par le plan.
-- Retour : supabase/retours-arriere/20261024140000_conservation_et_prospection.retour.sql
set local lock_timeout = '10s';

-- ── 1. Catalogue des durées ─────────────────────────────────────────────────────────────────────────────────────────

-- 1.a Pièces et actes du bail : 36 mois (au lieu de 60). Référentiel CNIL de la gestion locative (point 53) et loi
-- 89-462, art. 7-1. À relire par le juriste (source non ouverte le 23/10/2026).
update public.retention_rules set duree_mois = 36
 where data_type in ('document:bail', 'document:etat_des_lieux', 'document:courrier', 'document:attestation_assurance',
                     'document:reglement_copropriete', 'document:piece_identite', 'document:justificatif')
   and duree_mois = 60;
-- Quittances d'un bailleur : 36 mois après la fin du bail (et non dix ans depuis l'émission, durée propre aux
-- commerçants, C. com. L123-22) ; sans bail rattaché, émission + 120 mois (code de `echeance_conservation_document`).
update public.retention_rules
   set duree_mois = 36, declencheur = 'Fin du bail', finalite = 'Preuve du paiement des loyers'
 where data_type = 'document:quittance' and duree_mois = 120 and declencheur = 'Émission';
-- Rapports de gestion des agences : durée inchangée, finalité exacte.
update public.retention_rules set finalite = 'Obligation comptable de l''agence (commerçant, C. com. L123-22)'
 where data_type = 'document:rapport_gestion' and finalite = 'Obligation comptable';
-- Journal d'audit : 12 mois en général (délibération CNIL 2021-122) ; le contrôle interne garde 36 mois (règle
-- journal:audit_controle_interne ci-dessous). « Recommandation CNIL » retiré du libellé de la finalité.
update public.retention_rules set duree_mois = 12, finalite = 'Traçabilité des actions sensibles'
 where data_type = 'journal:audit_log' and duree_mois = 36;
-- Liste d'attente des agences : compteur depuis l'inscription (R44).
update public.retention_rules set declencheur = 'Inscription'
 where data_type = 'contact:attente_agences' and declencheur = 'Dernier échange ou inscription';

-- 1.b Règles nouvelles. Libellés de déclencheur exacts : le code compare ce texte.
insert into public.retention_rules (data_type, libelle, finalite, declencheur, duree_mois, sort, actif) values
 ('preuve:signature', 'Preuves de signature électronique (circuits, PDF signés, certificats)', 'Preuve de la signature des actes du bail', 'Fin du bail', 36, 'suppression', true),
 ('journal:audit_controle_interne', 'Journal d''audit : accès et exports de la supervision, support, maintenance, purges, fermetures et effacements', 'Contrôle interne des accès et des gestes de support', 'Action', 36, 'suppression', true),
 ('compte:invitation_jamais_utilisee', 'Comptes d''invités jamais utilisés', 'Accès de la personne invitée', 'Expiration, refus ou annulation de la dernière invitation', 3, 'suppression', false),
 ('compte:inscription_non_confirmee', 'Inscriptions jamais confirmées', 'Création du compte', 'Création de l''inscription', 1, 'suppression', false),
 ('compte:inactif', 'Comptes inactifs (fermeture)', 'Accès au service', 'Dernière connexion d''un membre ou fin du dernier abonnement payé', 24, 'suppression', false),
 ('dossier:sans_bail', 'Pièces d''une personne rattachée à aucun bail', 'Constitution du dossier locataire', 'Dernier dépôt de pièce sur une personne sans bail', 3, 'suppression', false),
 ('personne:fiche', 'Fiches des personnes (retrait des informations nominatives)', 'Gestion locative', 'Fin du dernier bail et clôture des comptes', 36, 'anonymisation', false),
 ('message:locatif', 'Messages de la relation locative', 'Suivi de la relation locative', 'Fin du dernier bail et clôture des comptes', 24, 'suppression', false),
 ('comptable:loyers', 'Écritures et encaissements des loyers (retrait des informations nominatives)', 'Comptabilité de la gestion locative', 'Fin du dernier bail et clôture des comptes', 36, 'anonymisation', false),
 ('incident:dossier', 'Dossiers d''incident (retrait des informations nominatives)', 'Suivi des interventions', 'Clôture de l''incident', 24, 'anonymisation', false),
 ('archive:preuve_contrat', 'Preuve des contrats d''abonnement payés (archive des comptes fermés)', 'Preuve d''un contrat conclu par voie électronique (code de la consommation, L. 213-1)', 'Fin du dernier abonnement payé', 120, 'suppression', true),
 ('archive:facture', 'Factures de l''abonnement (archive des comptes fermés)', 'Obligation fiscale (livre des procédures fiscales, art. L. 102 B)', 'Fin de l''exercice de la facture, à défaut fin du dernier abonnement payé', 72, 'suppression', true),
 ('contrat:retractation', 'Déclarations de rétractation', 'Preuve de la rétractation et de son remboursement', 'Date de la rétractation', 120, 'suppression', true),
 ('support:demande_droits', 'Demandes sur les données personnelles', 'Réponse aux demandes d''exercice des droits', 'Clôture de la demande', 36, 'suppression', false),
 ('support:question_idee', 'Questions et idées envoyées depuis l''aide', 'Réponse aux questions et suivi des idées', 'Dernier échange', 24, 'suppression', false),
 ('support:contestation', 'Contestations d''évaluation', 'Traitement des contestations', 'Clôture de la contestation', 36, 'suppression', false),
 ('artisan:evaluation', 'Évaluations des artisans', 'Classement des artisans du réseau', 'Dépôt de l''évaluation', 36, 'suppression', false),
 ('contact:prospect', 'Fiches prospects (professionnels, et particuliers qui ont consenti)', 'Suivi commercial', 'Dernier contact émanant du prospect', 36, 'suppression', true),
 ('prospect:opposition', 'Oppositions à la prospection (empreinte de l''adresse)', 'Respect de l''opposition', 'Opposition', 36, 'suppression', true),
 ('journal:abonnement_evenements', 'Événements Stripe traités', 'Diagnostic de la facturation', 'Traitement de l''événement', 6, 'suppression', true),
 ('journal:effacements_a_reappliquer', 'Effacements à réappliquer après une restauration', 'Réappliquer les effacements après une restauration', 'Exécution de la fermeture', 4, 'suppression', true),
 -- R64 : à relever en lecture seule en production ; si Supabase ne purge pas `auth.audit_log_entries`, activer.
 ('journal:auth_audit', 'Journal d''authentification (Supabase Auth)', 'Sécurité des connexions', 'Événement', 6, 'suppression', false)
on conflict (data_type) do nothing;

-- Libellé élargi le 24/10 (accès de la supervision, preuves d'effacement) : une base qui portait la version d'avant
-- converge au rejeu.
update public.retention_rules
   set libelle = 'Journal d''audit : accès et exports de la supervision, support, maintenance, purges, fermetures et effacements'
 where data_type = 'journal:audit_controle_interne'
   and libelle = 'Journal d''audit : traversées, support, maintenance, purges et fermetures';

-- Une durée réglée à la main avant la migration n'est pas écrasée : le dire.
do $controle_catalogue$
declare v text;
begin
  select string_agg(data_type || ' = ' || duree_mois, ', ' order by data_type) into v
    from public.retention_rules
   where (data_type in ('document:bail', 'document:etat_des_lieux', 'document:courrier', 'document:attestation_assurance',
                        'document:reglement_copropriete', 'document:piece_identite', 'document:justificatif', 'document:quittance')
          and duree_mois <> 36)
      or (data_type = 'journal:audit_log' and duree_mois <> 12);
  if v is not null then
    raise notice 'Conservation : durée(s) laissée(s) telle(s) quelle(s), différente(s) du plan du 23/10 : %', v;
  end if;
end $controle_catalogue$;

-- ── 2. Tables et colonnes ───────────────────────────────────────────────────────────────────────────────────────────

-- 2.a Gel de la conservation d'un bail en cas de litige.
-- ALTER seulement si l'objet manque : `baux` porte un déclencheur différé (baux_coherence_lot), et un ALTER rejoué dans
-- une transaction qui a déjà écrit un bail échouerait (« pending trigger events »).
do $gel$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'baux' and column_name = 'conservation_gelee_jusqu_au') then
    alter table public.baux add column conservation_gelee_jusqu_au date;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'baux' and column_name = 'conservation_gelee_motif') then
    alter table public.baux add column conservation_gelee_motif text;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.baux'::regclass and conname = 'baux_conservation_gel_coherent') then
    alter table public.baux add constraint baux_conservation_gel_coherent check (
      (conservation_gelee_jusqu_au is null) = (conservation_gelee_motif is null)
      and (conservation_gelee_motif is null or length(btrim(conservation_gelee_motif)) between 5 and 500)
    );
  end if;
end $gel$;
comment on column public.baux.conservation_gelee_jusqu_au is
  'Gel de la suppression des pièces du bail (litige) : douze mois au plus, renouvelable ; posé par geler_conservation_bail, journalisé (plan du 23/10, lot 1E).';
comment on column public.baux.conservation_gelee_motif is
  'Motif écrit du gel de la conservation (litige en cours).';

create or replace function public.garder_gel_conservation_bail()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Seuls les appels directs de l'API sont visés : le gel passe par geler_conservation_bail (plafond, journal).
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.conservation_gelee_jusqu_au is not null or new.conservation_gelee_motif is not null then
      raise exception 'Le gel de la conservation se pose depuis la fiche du bail' using errcode = '42501';
    end if;
  elsif new.conservation_gelee_jusqu_au is distinct from old.conservation_gelee_jusqu_au
     or new.conservation_gelee_motif is distinct from old.conservation_gelee_motif then
    raise exception 'Le gel de la conservation se pose depuis la fiche du bail' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.garder_gel_conservation_bail() from public, anon, authenticated;
do $garde_gel$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.baux'::regclass and tgname = 'baux_gel_conservation_garde') then
    create trigger baux_gel_conservation_garde
      before insert or update of conservation_gelee_jusqu_au, conservation_gelee_motif on public.baux
      for each row execute function public.garder_gel_conservation_bail();
  end if;
end $garde_gel$;

-- 2.b Prospection (R45).
create table if not exists public.oppositions_prospection (
  empreinte text primary key check (empreinte ~ '^[0-9a-f]{64}$'),
  origine text not null check (origine in ('prospect', 'liste_attente_agences')),
  cree_le timestamptz not null default now()
);
comment on table public.oppositions_prospection is
  'Oppositions à la prospection : empreinte SHA-256 de l''adresse (minuscules, sans espaces), jamais l''adresse. Gardée 36 mois (prospect:opposition). Avant tout message, refus si l''empreinte est ici (plan du 23/10, R45).';
alter table public.oppositions_prospection enable row level security;
revoke all on public.oppositions_prospection from public, anon, authenticated, service_role;
grant select on public.oppositions_prospection to authenticated;
grant select, insert, update, delete on public.oppositions_prospection to service_role;
drop policy if exists oppositions_prospection_lecture on public.oppositions_prospection;
create policy oppositions_prospection_lecture on public.oppositions_prospection
  for select to authenticated using ((select public.is_permanent_super_admin()));

alter table public.supervision_prospects add column if not exists oppose_le timestamptz;
alter table public.supervision_prospects add column if not exists dernier_contact_prospect_le timestamptz;
alter table public.supervision_prospects add column if not exists qualite text;
-- Valeurs initiales des colonnes nouvelles : le dernier contact connu est la création ; un prospect existant est
-- traité comme un particulier (régime le plus protecteur : sa fiche suit sa demande).
update public.supervision_prospects set dernier_contact_prospect_le = cree_le where dernier_contact_prospect_le is null;
update public.supervision_prospects set qualite = 'particulier' where qualite is null;
alter table public.supervision_prospects alter column dernier_contact_prospect_le set default now();
alter table public.supervision_prospects alter column dernier_contact_prospect_le set not null;
alter table public.supervision_prospects alter column qualite set default 'particulier';
alter table public.supervision_prospects alter column qualite set not null;
alter table public.supervision_prospects drop constraint if exists supervision_prospects_qualite_check;
alter table public.supervision_prospects add constraint supervision_prospects_qualite_check
  check (qualite in ('particulier', 'professionnel'));
-- Origine en liste fermée. NOT VALID : une fiche ancienne n'est pas réécrite, mais toute écriture nouvelle respecte la
-- liste ; la validation est tentée et, si une fiche ancienne ne la respecte pas, la migration le dit sans échouer.
alter table public.supervision_prospects drop constraint if exists supervision_prospects_origine_liste;
alter table public.supervision_prospects add constraint supervision_prospects_origine_liste
  check (origine in ('formulaire', 'échange direct', 'recommandation')) not valid;
-- Une fiche créée depuis une demande de contact portait « Formulaire de contact » (ancienne valeur posée par la
-- console, sans choix de l'utilisateur) : même sens que « formulaire ». Mise à jour système (même révision, sans
-- compte) : rien au registre (supervision_tracer_modification).
update public.supervision_prospects set origine = 'formulaire'
 where origine = 'Formulaire de contact' and demande_id is not null;
do $origine$
begin
  alter table public.supervision_prospects validate constraint supervision_prospects_origine_liste;
exception when check_violation then
  raise notice 'Prospects : des fiches anciennes ont une origine hors liste ; elle sera choisie à leur prochaine modification.';
end $origine$;
grant update (qualite, dernier_contact_prospect_le) on public.supervision_prospects to authenticated;
-- Le dernier contact du prospect ne se date pas dans le futur : sa fiche serait gardée sans fin (36 mois après lui).
create or replace function public.garder_dernier_contact_prospect()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.dernier_contact_prospect_le > now() + interval '5 minutes' then
    raise exception 'Le dernier contact du prospect ne peut pas être daté dans le futur' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.garder_dernier_contact_prospect() from public, anon, authenticated;
do $garde_contact$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.supervision_prospects'::regclass
                  and tgname = 'supervision_prospects_dernier_contact_garde') then
    create trigger supervision_prospects_dernier_contact_garde
      before insert or update of dernier_contact_prospect_le on public.supervision_prospects
      for each row execute function public.garder_dernier_contact_prospect();
  end if;
end $garde_contact$;
comment on column public.supervision_prospects.oppose_le is
  'Opposition à la prospection (« Stop ») : aucun message. Depuis le 24/10, le « Stop » supprime aussitôt les fiches de l''adresse (seule l''empreinte reste dans oppositions_prospection) ; une fiche marquée ici part au nettoyage suivant (R45).';
comment on column public.supervision_prospects.dernier_contact_prospect_le is
  'Dernier contact émanant du prospect (pas de Gerimmo) : point de départ des 36 mois de contact:prospect.';
comment on column public.supervision_prospects.qualite is
  'Particulier (la fiche suit sa demande de contact) ou professionnel (36 mois après son dernier contact).';

-- 2.c Repères de dates que les tables d'origine ne portent pas (ex. date de conversion d'une inscription d'agence) :
-- posés au premier passage de la purge qui constate l'état, jamais saisis.
create table if not exists public.conservation_reperes (
  categorie text not null,
  objet_id uuid not null,
  depuis timestamptz not null default now(),
  primary key (categorie, objet_id)
);
-- Catégories : inscription d'agence convertie (date de conversion) ; compte d'invité (fin de sa dernière invitation,
-- posée avant que la purge des invitations ne l'efface).
alter table public.conservation_reperes drop constraint if exists conservation_reperes_categorie_check;
alter table public.conservation_reperes add constraint conservation_reperes_categorie_check
  check (categorie in ('liste_attente_agences:convertie', 'compte:invite'));
comment on table public.conservation_reperes is
  'Date à partir de laquelle un état est constaté par la purge (inscription d''agence convertie : supprimée trois mois après ; compte d''invité : fin de sa dernière invitation). Clé de service seulement.';
alter table public.conservation_reperes enable row level security;
revoke all on public.conservation_reperes from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.conservation_reperes to service_role;

-- ── 3. Fonctions communes ───────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.duree_conservation_active(p_data_type text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select r.duree_mois from public.retention_rules r
   where r.data_type = p_data_type and r.actif and r.sort in ('suppression', 'anonymisation');
$$;

-- Les actions gardées 36 mois (journal:audit_controle_interne) ; les autres suivent journal:audit_log (12 mois).
-- Page confidentialité : « 1 an ; 3 ans pour les accès de la supervision et les preuves d'effacement ». Accès de la
-- supervision : traversées, consultations écrites par log_sa_access (`consultation_organisation`,
-- `consultation_piece_artisan`, `consultation_faits_direction`…), export des coordonnées de la liste d'attente.
-- Preuves d'effacement : purges, fermetures de compte (`fermeture_…`, `compte_ferme`) et effacements réappliqués après
-- une restauration (`effacements_…`). Les décisions de la supervision (retours, idées, inscriptions d'artisans) ne
-- sont pas des accès : douze mois. Préfixes comparés par left(), jamais par un LIKE sans échappement.
create or replace function public.action_audit_controle_interne(p_action text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(left(p_action, 9) = 'traversee' or left(p_action, 8) = 'support_' or left(p_action, 12) = 'maintenance_'
                  or left(p_action, 13) = 'consultation_' or left(p_action, 10) = 'fermeture_'
                  or left(p_action, 12) = 'effacements_'
                  or p_action in ('purge_retention', 'compte_ferme', 'liste_attente_exportee'), false);
$$;

create or replace function public.empreinte_adresse_prospection(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_email is null or btrim(p_email) = '' then null
              else encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex') end;
$$;

-- Le jour à partir duquel le compteur des pièces d'un bail court : NULL tant que le bail n'est pas terminé.
create or replace function public.fin_conservation_bail(p_bail uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when b.etat <> 'termine' then null else
    greatest(
      b.date_fin, b.date_sortie_reelle, b.updated_at::date, s.sortie,
      (select max(r.date_emission) from public.restitutions r where r.bail_id = b.id and r.statut = 'finalise'),
      -- Une restitution encore « en cours » retient le compteur, douze mois au plus après la fin du bail.
      (select (greatest(b.date_fin, b.date_sortie_reelle, s.sortie) + interval '12 months')::date
         from public.restitutions r where r.bail_id = b.id and r.statut = 'en_cours' limit 1)
    ) end
  from public.baux b
  cross join lateral (select max(e.date_edl) as sortie from public.etats_des_lieux e
                       where e.bail_id = b.id and e.type = 'sortie') s
  where b.id = p_bail;
$$;

-- Le jour où les pièces d'un bail se suppriment pour une durée donnée ; le gel repousse ce jour au lendemain de sa fin.
create or replace function public.echeance_conservation_bail(p_bail uuid, p_mois integer)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when f.fin is null or p_mois is null then null
              else greatest((f.fin + make_interval(months => p_mois))::date, b.conservation_gelee_jusqu_au + 1) end
  from public.baux b
  cross join lateral (select public.fin_conservation_bail(b.id) as fin) f
  where b.id = p_bail;
$$;

-- Le jour où un document arrive au terme de sa règle (suppression le jour même, à la purge de la nuit), ou NULL si
-- rien ne se purge (règle inactive, bail ou contrat en cours).
create or replace function public.echeance_conservation_document(p_doc uuid)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d record;
  v_directs uuid[];
  v_baux uuid[];
  v_duree integer;
  v_en_cours integer;
  v_echeance date;
begin
  select doc.id, doc.organization_id, doc.type::text as type, doc.retention_reference_date as ref,
         r.declencheur, r.duree_mois
    into d
  from public.documents doc
  join public.retention_rules r
    on r.data_type = 'document:' || doc.type::text and r.actif and r.sort in ('suppression', 'anonymisation')
  where doc.id = p_doc;
  if not found then return null; end if;

  select coalesce(array_agg(distinct b.id), '{}'::uuid[]) into v_directs
    from public.baux b
   where b.organization_id = d.organization_id
     and (b.id in (select l.entite_id from public.document_liens l where l.document_id = p_doc and l.entite = 'bail')
          or b.document_signe = p_doc
          or b.reglement_copropriete = p_doc);

  if d.declencheur in ('Fin du bail', 'Fin du dernier bail') or (d.type = 'autre' and cardinality(v_directs) > 0) then
    -- « Autre » rattaché à un bail : 36 mois après la fin du bail (plan du 23/10, lot 2).
    v_duree := case when d.type = 'autre' then 36 else d.duree_mois end;
    if d.type = 'autre' then
      v_baux := v_directs;
    else
      select coalesce(array_agg(distinct b.id), '{}'::uuid[]) into v_baux
        from public.baux b
       where b.organization_id = d.organization_id
         and (b.id = any (v_directs)
              or ((d.declencheur = 'Fin du dernier bail' or cardinality(v_directs) = 0)
                  and (b.locataire_principal in (select l.entite_id from public.document_liens l
                                                  where l.document_id = p_doc and l.entite = 'personne')
                       or b.id in (select bp.bail_id from public.bail_personnes bp
                                    where bp.organization_id = d.organization_id
                                      and bp.person_id in (select l.entite_id from public.document_liens l
                                                            where l.document_id = p_doc and l.entite = 'personne')))));
    end if;
    if cardinality(v_baux) = 0 then
      -- Quittance sans bail rattaché : 120 mois après l'émission (plan du 23/10, lot 2).
      if d.type = 'quittance' then return (d.ref + interval '120 months')::date; end if;
      -- Pièce d'un type « fin du bail » rattachée à aucun bail (un courrier du lot, par exemple) : c'est un « autre
      -- document non rattaché à un bail », qui suit document:autre depuis son dépôt (60 mois au plan ; page
      -- confidentialité : « 5 ans »). Les pièces du dossier d'une personne (« fin du dernier bail ») gardent leur durée.
      if d.declencheur = 'Fin du bail' then
        return (d.ref + make_interval(months => coalesce(public.duree_conservation_active('document:autre'), d.duree_mois)))::date;
      end if;
      return (d.ref + make_interval(months => d.duree_mois))::date;
    end if;
    select count(*) filter (where b.etat <> 'termine'), max(public.echeance_conservation_bail(b.id, v_duree))
      into v_en_cours, v_echeance
      from public.baux b where b.id = any (v_baux);
    if v_en_cours > 0 or v_echeance is null then return null; end if;
    return greatest((d.ref + make_interval(months => v_duree))::date, v_echeance);
  end if;

  if d.declencheur in ('Fin du mandat', 'Fin de gestion du bien', 'Clôture de l''incident') then
    v_echeance := public.debut_conservation_document(p_doc);
    return case when v_echeance is null then null else (v_echeance + make_interval(months => d.duree_mois))::date end;
  end if;
  -- « Émission », « Dépôt »… : la date posée à la création.
  return (d.ref + make_interval(months => d.duree_mois))::date;
end $$;

-- Pièces d'une personne sans bail (R41) : ni bail (titulaire ou personne du bail), ni détention, ni mandat.
create or replace function public.personne_sans_bail(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.persons p where p.id = p_person)
     and not exists (select 1 from public.baux b where b.locataire_principal = p_person)
     and not exists (select 1 from public.bail_personnes bp where bp.person_id = p_person)
     and not exists (select 1 from public.detentions dt where dt.person_id = p_person)
     and not exists (select 1 from public.mandats m where m.person_id = p_person);
$$;

-- Un document du dossier d'une personne sans bail : rattaché seulement à des personnes sans bail, ni acte signé, ni
-- preuve de signature, ni annexe d'un bail. Le lien « organisation », que le dépôt de la GED pose sur toute pièce
-- (lib/ged-depot.ts), ne rattache la pièce à rien d'autre : il est ignoré.
create or replace function public.document_dossier_sans_bail(p_doc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.documents d where d.id = p_doc and d.purged_at is null and d.type <> 'document_test')
     and exists (select 1 from public.document_liens l where l.document_id = p_doc and l.entite = 'personne')
     and not exists (select 1 from public.document_liens l where l.document_id = p_doc and l.entite <> 'organisation'
                      and (l.entite <> 'personne' or not public.personne_sans_bail(l.entite_id)))
     and not exists (select 1 from public.baux b where b.document_signe = p_doc or b.reglement_copropriete = p_doc)
     and not public.document_preuve_signature(p_doc);
$$;

-- Le jour où les pièces d'une personne sans bail se suppriment : dernier dépôt + durée (dossier:sans_bail).
create or replace function public.echeance_dossier_sans_bail(p_person uuid, p_mois integer)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_mois is null or not public.personne_sans_bail(p_person) then null
              else ((max(d.created_at) at time zone 'Europe/Paris')::date + make_interval(months => p_mois))::date end
    from public.documents d
    join public.document_liens l on l.document_id = d.id and l.entite = 'personne' and l.entite_id = p_person
   where public.document_dossier_sans_bail(d.id);
$$;

-- Facture d'une archive de compte : six ans après la fin de l'exercice de la facture (`exercice_clos_le`, quand
-- l'archive le porte) ou, à défaut, après la fin du dernier abonnement payé, jamais moins de six ans après son
-- émission. Livre des procédures fiscales, art. L. 102 B ; à relire par le juriste (source non ouverte le 23/10/2026).
-- La date de clôture de l'exercice de l'entreprise individuelle n'est enregistrée nulle part : supposer l'année civile
-- serait inventer un fait. La fin du dernier abonnement payé est connue pour chaque archive et suit toutes ses
-- factures. La durée ne descend jamais sous six ans, même si la règle est réduite.
create or replace function public.echeance_facture_archivee(p_facture jsonb, p_fin_dernier_abonnement_paye date, p_mois integer)
returns date
language sql
stable
set search_path = ''
as $$
  select (greatest((p_facture ->> 'emise_le')::date,
                   coalesce((p_facture ->> 'exercice_clos_le')::date, p_fin_dernier_abonnement_paye))
          + make_interval(months => greatest(coalesce(p_mois, 72), 72)))::date;
$$;

-- Déclarations de rétractation (vente, 20261024110000) : preuve de la rétractation et de son remboursement, gardée dix
-- ans depuis la déclaration (contrat:retractation ; jamais moins de 120 mois, même si la règle est réduite), puis
-- supprimée par la purge de la nuit. À relire par le juriste (source non ouverte le 23/10/2026).
create or replace function public.echeance_retractation_abonnement(p_declaree_le timestamptz, p_mois integer)
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_declaree_le at time zone 'Europe/Paris')::date + make_interval(months => greatest(coalesce(p_mois, 120), 120)))::date;
$$;

-- Le sort d'un document échu, appliqué comme dans la boucle de `appliquer_retention` (fichier en file, fiche vidée ou
-- réduite à sa contrepartie sans personne), avec la même trace dans audit_log.
create or replace function public.purger_document_conservation(p_doc uuid, p_regle text, p_echeance date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare d record; v_sort text; v_libelle text; v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
begin
  select doc.id, doc.organization_id, doc.type, doc.storage_path into d
    from public.documents doc where doc.id = p_doc and doc.purged_at is null
    for update;
  if not found then return false; end if;
  -- La conservation ne dépend pas de l'abonnement : la pièce d'un compte en lecture seule se purge aussi. Le passage
  -- « système » ne couvre que les écritures ci-dessous, puis il est rendu.
  perform pg_catalog.set_config('gerimmo.systeme', 'on', true);
  select r.sort::text, r.libelle into v_sort, v_libelle
    from public.retention_rules r where r.data_type = 'document:' || d.type::text;
  v_sort := coalesce(v_sort, 'suppression');
  if d.storage_path is not null then
    insert into public.purge_fichiers (storage_path) values (d.storage_path);
  end if;
  if v_sort = 'anonymisation' then
    delete from public.document_liens where document_id = d.id and entite = 'personne';
    update public.documents
       set purged_at = now(), anonymise_le = now(), storage_path = null, mime_type = null, taille_octets = null,
           titre = coalesce(v_libelle, 'Document') || ' (anonymisé)', deposited_by = null, verifie_par = null
     where id = d.id;
  else
    v_sort := 'suppression';
    delete from public.document_liens where document_id = d.id;
    update public.documents
       set purged_at = now(), storage_path = null, mime_type = null, taille_octets = null, empreinte = null,
           titre = null, deposited_by = null, verifie_par = null
     where id = d.id;
  end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), d.organization_id, 'purge_retention',
          jsonb_build_object('document_id', d.id, 'type', d.type, 'regle', p_regle, 'sort', v_sort,
                             'echeance_conservation', p_echeance));
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return true;
end $$;

-- ── 4. Sélection des catégories nouvelles (bilan et purge, mêmes conditions) ────────────────────────────────────────

create or replace function public.cibles_conservation_complementaire()
returns table (categorie text, objet text, id text)
language sql
stable
security definer
set search_path = ''
as $$
  with jour as (select (now() at time zone 'Europe/Paris')::date as j),
  duree as (select r.data_type, r.duree_mois from public.retention_rules r where r.sort in ('suppression', 'anonymisation')),
  retours as (
    select r.id, r.nature, r.etat, r.organization_id, r.titre,
           greatest(r.cree_le, r.modifie_le, (select max(h.cree_le) from public.retours_historique h where h.retour_id = r.id)) as dernier
      from public.retours_utilisateurs r
     where r.nature in ('question', 'idee', 'contestation')
  ),
  -- Comptes jamais connectés, sans adhésion active, sans fiche d'artisan, sans invitation restante. Un compte d'invité
  -- est créé CONFIRMÉ par l'invitation (preparer_invitation_locataire) : il est reconnu à ses invitations, ou au repère
  -- « compte:invite » que la purge des contacts pose avant d'effacer les invitations échues.
  comptes as (
    select u.id, u.created_at, u.email_confirmed_at,
           exists (select 1 from public.invitations_locataires i where i.account_id = u.id)
             or exists (select 1 from public.conservation_reperes r where r.categorie = 'compte:invite' and r.objet_id = u.id) as invite,
           greatest((select max(greatest(i.expire_le, coalesce(i.repondu_le, i.expire_le)))
                       from public.invitations_locataires i where i.account_id = u.id),
                    (select r.depuis from public.conservation_reperes r where r.categorie = 'compte:invite' and r.objet_id = u.id)) as derniere_invitation
      from auth.users u
     where u.last_sign_in_at is null
       and not exists (select 1 from public.memberships m where m.account_id = u.id and m.status = 'active')
       and not exists (select 1 from public.artisans a where a.account_id = u.id)
       and not exists (select 1 from public.invitations_locataires i where i.account_id = u.id
                        and (i.etat = 'acceptee' or (i.etat = 'en_attente' and i.expire_le > now())))
  )
  -- Preuves de signature d'un bail : circuits clos — ou restés ouverts mais expirés (l'annulation chez Zoho est au
  -- lot 5) —, quand toutes les pièces du bail arrivent à leur terme.
  select 'preuve:signature', 'bail_signature_circuits', c.id::text
    from public.bail_signature_circuits c
   where c.bail_id is not null and (c.etat in ('pret', 'termine', 'annule', 'refuse', 'expire') or c.expire_le < now())
     and public.echeance_conservation_bail(c.bail_id, (select duree_mois from duree where data_type = 'preuve:signature')) <= (select j from jour)
  union all
  select 'preuve:signature', 'demandes_signature', ds.id::text
    from public.demandes_signature ds
   where exists (select 1 from public.document_liens l where l.document_id = ds.document_id and l.entite = 'bail')
     and not exists (select 1 from public.document_liens l where l.document_id = ds.document_id and l.entite = 'bail'
                      and coalesce(public.echeance_conservation_bail(l.entite_id, (select duree_mois from duree where data_type = 'preuve:signature'))
                                   > (select j from jour), true))
  union all
  -- Pièces d'une personne sans bail : trois mois après le dernier dépôt sur chaque personne rattachée.
  select 'dossier:sans_bail', 'documents', d.id::text
    from public.documents d
   where d.purged_at is null and public.document_dossier_sans_bail(d.id)
     and not exists (select 1 from public.document_liens l where l.document_id = d.id and l.entite = 'personne'
                      and coalesce(public.echeance_dossier_sans_bail(l.entite_id, (select duree_mois from duree where data_type = 'dossier:sans_bail'))
                                   > (select j from jour), true))
  union all
  select 'support:demande_droits', 'retours_utilisateurs', r.id::text from retours r
   where r.nature = 'question' and r.organization_id is null and r.titre like 'Données personnelles — %'
     and r.etat in ('resolu', 'non_retenue', 'deja_couverte')
     and r.dernier < now() - make_interval(months => (select duree_mois from duree where data_type = 'support:demande_droits'))
  union all
  select 'support:question_idee', 'retours_utilisateurs', r.id::text from retours r
   where r.nature in ('question', 'idee')
     and not (r.nature = 'question' and r.organization_id is null and r.titre like 'Données personnelles — %')
     and r.dernier < now() - make_interval(months => (select duree_mois from duree where data_type = 'support:question_idee'))
  union all
  select 'support:contestation', 'retours_utilisateurs', r.id::text from retours r
   where r.nature = 'contestation' and r.etat in ('resolu', 'non_retenue', 'deja_couverte')
     and r.dernier < now() - make_interval(months => (select duree_mois from duree where data_type = 'support:contestation'))
  union all
  select 'artisan:evaluation', 'artisan_evaluations', e.id::text from public.artisan_evaluations e
   where e.created_at < now() - make_interval(months => (select duree_mois from duree where data_type = 'artisan:evaluation'))
  union all
  -- Prospects : opposition (« Stop », marquée sur la fiche ou empreinte de son adresse : une fiche recréée pour une
  -- adresse opposée part aussi) ou 36 mois sans contact venu du prospect.
  select 'contact:prospect', 'supervision_prospects', p.id::text from public.supervision_prospects p
   where p.oppose_le is not null
      or exists (select 1 from public.oppositions_prospection o where o.empreinte = public.empreinte_adresse_prospection(p.email))
      or p.dernier_contact_prospect_le < now() - make_interval(months => (select duree_mois from duree where data_type = 'contact:prospect'))
  union all
  select 'prospect:opposition', 'oppositions_prospection', o.empreinte from public.oppositions_prospection o
   where o.cree_le < now() - make_interval(months => (select duree_mois from duree where data_type = 'prospect:opposition'))
  union all
  -- Comptes jamais utilisés : invité jamais connecté (trois mois après sa dernière invitation) ; inscription jamais
  -- confirmée (un mois après sa création).
  select 'compte:invitation_jamais_utilisee', 'auth.users', c.id::text from comptes c
   where c.invite
     and greatest(c.created_at, c.derniere_invitation) < now() - make_interval(months => (select duree_mois from duree where data_type = 'compte:invitation_jamais_utilisee'))
  union all
  select 'compte:inscription_non_confirmee', 'auth.users', c.id::text from comptes c
   where not c.invite and c.email_confirmed_at is null
     and c.created_at < now() - make_interval(months => (select duree_mois from duree where data_type = 'compte:inscription_non_confirmee'))
  union all
  select 'archive:facture', 'archives_comptes', a.id::text from public.archives_comptes a
   where exists (select 1 from jsonb_array_elements(a.factures) e
                  where public.echeance_facture_archivee(e, a.fin_dernier_abonnement_paye,
                          (select duree_mois from duree where data_type = 'archive:facture')) < (select j from jour))
  union all
  select 'archive:preuve_contrat', 'archives_comptes', a.id::text from public.archives_comptes a
   where a.preuve_conservee_jusqu_au < (select j from jour)
  union all
  select 'journal:abonnement_evenements', 'abonnement_evenements', e.stripe_event_id from public.abonnement_evenements e
   where e.traite_le is not null
     and e.traite_le < now() - make_interval(months => (select duree_mois from duree where data_type = 'journal:abonnement_evenements'))
  union all
  -- Déclarations de rétractation (vente) : dix ans après la déclaration, jamais moins (intégration du 24/10).
  select 'contrat:retractation', 'retractations_abonnement', r.id::text from public.retractations_abonnement r
   where public.echeance_retractation_abonnement(r.declaree_le, (select duree_mois from duree where data_type = 'contrat:retractation'))
         < (select j from jour)
  union all
  -- Registre des effacements à réappliquer (comptes) : quatre mois après l'exécution de la fermeture, au-delà de la
  -- durée des sauvegardes qu'une restauration pourrait remettre (intégration du 24/10).
  select 'journal:effacements_a_reappliquer', 'effacements_a_reappliquer', e.fermeture_id::text from public.effacements_a_reappliquer e
   where e.executee_le < now() - make_interval(months => (select duree_mois from duree where data_type = 'journal:effacements_a_reappliquer'));
$$;

-- Le journal d'authentification de Supabase (R64) : compté ou purgé seulement s'il existe et si la règle le demande.
create or replace function public.journal_auth_echus(p_supprimer boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_mois integer; v_n bigint := 0;
begin
  if to_regclass('auth.audit_log_entries') is null then return null; end if;
  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:auth_audit' and sort = 'suppression';
  if v_mois is null then return null; end if;
  begin
    if p_supprimer then
      if public.duree_conservation_active('journal:auth_audit') is null then return 0; end if;
      execute 'delete from auth.audit_log_entries where created_at < now() - make_interval(months => $1)' using v_mois;
      get diagnostics v_n = row_count;
    else
      execute 'select count(*) from auth.audit_log_entries where created_at < now() - make_interval(months => $1)' into v_n using v_mois;
    end if;
  exception when insufficient_privilege or undefined_column then
    insert into public.tech_log (evenement, details)
    values ('conservation_journal_auth_impossible', jsonb_build_object('erreur', sqlstate));
    return null;
  end;
  return v_n;
end $$;

-- ── 5. Purges ───────────────────────────────────────────────────────────────────────────────────────────────────────

-- Comptes jamais utilisés (R38) : persons.account_id mis à null, invitations échues du compte supprimées (leur clé
-- account_id bloquait), puis suppression du compte de connexion. Une clé qui bloque encore : rien n'est supprimé pour
-- ce compte, une trace va dans tech_log (sans adresse), et il n'est retenté qu'après sept jours (il ne monopolise pas
-- les 200 places de la nuit).
create or replace function public.purger_comptes_jamais_utilises()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_supprimes integer := 0; v_bloques integer := 0;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Purge réservée à la supervision' using errcode = '42501';
  end if;
  for c in
    select x.categorie, x.id::uuid as id
      from public.cibles_conservation_complementaire() x
      join public.retention_rules r on r.data_type = x.categorie and r.actif and r.sort = 'suppression'
     where x.categorie in ('compte:invitation_jamais_utilisee', 'compte:inscription_non_confirmee')
       and not exists (select 1 from public.tech_log t
                        where t.evenement = 'purge_compte_bloquee' and t.details ->> 'compte' = x.id
                          and t.created_at > now() - interval '7 days')
     order by x.id
     limit 200
  loop
    begin
      update public.persons set account_id = null where account_id = c.id;
      -- Seules restent des invitations échues, refusées ou annulées (la sélection écarte un compte qui en a une vivante).
      delete from public.invitations_locataires where account_id = c.id;
      delete from auth.users where id = c.id;
      delete from public.conservation_reperes where categorie = 'compte:invite' and objet_id = c.id;
      v_supprimes := v_supprimes + 1;
    exception when others then
      v_bloques := v_bloques + 1;
      insert into public.tech_log (evenement, details)
      values ('purge_compte_bloquee', jsonb_build_object('compte', c.id, 'regle', c.categorie, 'erreur', sqlstate));
    end;
  end loop;
  return jsonb_build_object('comptes_supprimes', v_supprimes, 'comptes_bloques', v_bloques);
end $$;

-- Archives des comptes (table du socle) : factures retirées une à une à leur échéance (archive:facture), puis la
-- ligne au terme de la preuve (archive:preuve_contrat), chaque règle seulement si elle est active.
create or replace function public.purger_archives_comptes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_mois_factures integer := public.duree_conservation_active('archive:facture');
  v_factures bigint := 0;
  v_archives bigint := 0;
begin
  if v_mois_factures is not null then
    update public.archives_comptes a
       set factures = coalesce((select jsonb_agg(x.e order by x.rang)
                                  from jsonb_array_elements(a.factures) with ordinality x(e, rang)
                                 where public.echeance_facture_archivee(x.e, a.fin_dernier_abonnement_paye, v_mois_factures) >= v_jour), '[]'::jsonb),
           factures_purgees_le = now()
     where exists (select 1 from jsonb_array_elements(a.factures) e
                    where public.echeance_facture_archivee(e, a.fin_dernier_abonnement_paye, v_mois_factures) < v_jour);
    get diagnostics v_factures = row_count;
  end if;
  if public.duree_conservation_active('archive:preuve_contrat') is not null then
    delete from public.archives_comptes a
     where a.preuve_conservee_jusqu_au < v_jour and jsonb_array_length(a.factures) = 0;
    get diagnostics v_archives = row_count;
  end if;
  return jsonb_build_object('archives_comptes_factures_retirees', v_factures, 'archives_comptes_supprimees', v_archives);
end $$;

-- L'échéance affichée des factures d'une archive suit la même règle que leur purge.
create or replace function public.archives_comptes_echeances()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_mois integer;
begin
  if exists (select 1 from jsonb_array_elements(new.factures) e
              where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'emise_le', '') !~ '^\d{4}-\d{2}-\d{2}$'
                 or (e ? 'exercice_clos_le' and coalesce(e ->> 'exercice_clos_le', '') !~ '^\d{4}-\d{2}-\d{2}$')) then
    raise exception 'Chaque facture archivée porte sa date d''émission (emise_le, AAAA-MM-JJ) et, le cas échéant, la fin de son exercice (exercice_clos_le, AAAA-MM-JJ)' using errcode = '22023';
  end if;
  select r.duree_mois into v_mois from public.retention_rules r where r.data_type = 'archive:facture';
  new.archive_le := now();
  -- Preuve d'un contrat conclu par voie électronique : dix ans (code de la consommation, L. 213-1, D. 213-1 et
  -- D. 213-2), comptés de la fin du dernier abonnement payé (plan du 23/10, choix 5 ; décision du 23/10).
  -- À relire par le juriste (source non ouverte le 23/10/2026).
  new.preuve_conservee_jusqu_au := (new.fin_dernier_abonnement_paye + interval '10 years')::date;
  -- Factures : voir echeance_facture_archivee (six ans, livre des procédures fiscales, L. 102 B ; éditeur non
  -- commerçant, décision du 23/10). Échéance de la dernière ; chacune se retire à la sienne.
  new.factures_conservees_jusqu_au := (select max(public.echeance_facture_archivee(e, new.fin_dernier_abonnement_paye, v_mois))
                                         from jsonb_array_elements(new.factures) e);
  new.factures_purgees_le := null;
  return new;
end $$;
revoke execute on function public.archives_comptes_echeances() from public, anon, authenticated;

-- La garde des archives (socle, relecture adverse M4 : factures comptées, date de purge posée par la base) retire une
-- facture à l'échéance même de la purge : celle de `echeance_facture_archivee`, selon la règle archive:facture (jamais
-- moins de six ans). Intégration du 24/10 : la garde du socle comptait six ans depuis l'émission, plus tôt que la purge
-- ci-dessus et que la date affichée (`factures_conservees_jusqu_au`) ; une seule échéance vaut désormais pour la purge,
-- pour la garde et pour l'affichage.
create or replace function public.archives_comptes_garde()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_mois integer;
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
  -- La date de purge est celle de la base, posée au retrait d'une facture et à lui seul (relecture adverse M4).
  if new.factures is not distinct from old.factures then
    if new.factures_purgees_le is distinct from old.factures_purgees_le then
      raise exception 'Une archive de compte ne se modifie pas' using errcode = '42501';
    end if;
    return new;
  end if;
  new.factures_purgees_le := now();
  -- La durée du catalogue, active ou non (même lecture que archives_comptes_echeances) ; jamais moins de six ans.
  select r.duree_mois into v_mois from public.retention_rules r where r.data_type = 'archive:facture';
  -- Chaque facture gardée l'est à l'identique, sans copie de plus ; chaque facture retirée est arrivée à son échéance.
  -- Les factures se comptent (M4) : deux copies identiques sont deux factures, aucune ne part avant son terme.
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
                   and public.echeance_facture_archivee(anciennes.e, old.fin_dernier_abonnement_paye, v_mois) >= v_jour) then
    raise exception 'Seules les factures arrivées au terme de leur conservation se retirent d''une archive' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.archives_comptes_garde() from public, anon, authenticated;

-- La garde d'ajout seul de la vente laisse passer, en plus de la suppression de l'organisation, la suppression d'une
-- déclaration arrivée à l'échéance de `echeance_retractation_abonnement`, et rien d'autre (intégration du 24/10 : la règle contrat:retractation était
-- active sans chemin de purge autorisé). Le reste de la garde est celui de la vente, à l'identique.
create or replace function public.retractations_abonnement_ajout_seul()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- La suppression de l'organisation l'emporte (cascade : l'organisation n'existe déjà plus).
    if not exists (select 1 from public.organizations o where o.id = old.organization_id) then return old; end if;
    -- La purge de conservation, au terme de la preuve (contrat:retractation, jamais moins de dix ans).
    if public.echeance_retractation_abonnement(old.declaree_le,
         (select r.duree_mois from public.retention_rules r where r.data_type = 'contrat:retractation'))
       < (now() at time zone 'Europe/Paris')::date then
      return old;
    end if;
    raise exception 'Une déclaration de rétractation ne se supprime pas avant le terme de sa conservation';
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
$$;
revoke all on function public.retractations_abonnement_ajout_seul() from public, anon, authenticated;

create or replace function public.appliquer_conservation_complementaire()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultat jsonb := '{}'::jsonb;
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_mois integer;
  v_n bigint;
  v_docs integer;
  v_ids uuid[];
  v_textes text[];
  c record;
  v_doc uuid;
  v_echeance date;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Purge réservée à la supervision' using errcode = '42501';
  end if;
  if not public.tache_planifiee_autorisee('retention-quotidienne') then return '{}'::jsonb; end if;
  -- La conservation ne dépend pas de l'abonnement : une pièce échue d'un compte en lecture seule se purge aussi.
  perform pg_catalog.set_config('gerimmo.systeme', 'on', true);

  -- a. Journal d'audit, contrôle interne : 36 mois (le reste du journal suit journal:audit_log, 12 mois).
  v_mois := public.duree_conservation_active('journal:audit_controle_interne');
  if v_mois is not null then
    delete from public.audit_log
     where public.action_audit_controle_interne(action) and created_at < now() - make_interval(months => v_mois);
    get diagnostics v_n = row_count;
    v_resultat := v_resultat || jsonb_build_object('audit_log_controle_interne', v_n);
  end if;

  -- b. Preuves de signature d'un bail échu : chaque pièce suit la règle de son type si elle vit plus longtemps, ou si
  -- elle prouve encore un autre circuit ; le circuit, ses relances et sa consommation partent ensuite.
  if public.duree_conservation_active('preuve:signature') is not null then
    v_docs := 0; v_n := 0;
    for c in
      select x.objet, x.id::uuid as id from public.cibles_conservation_complementaire() x
       where x.categorie = 'preuve:signature' order by x.objet, x.id limit 200
    loop
      if c.objet = 'bail_signature_circuits' then
        -- Un circuit resté ouvert (préparation, envoi, vérification) au-delà de sa date de validité passe « expiré » :
        -- ses pièces ne sont plus en signature (proteger_document_en_signature_bail) et suivent la purge.
        update public.bail_signature_circuits set etat = 'expire', updated_at = now()
         where id = c.id and etat in ('preparation', 'en_cours', 'a_verifier') and expire_le < now();
        select array_remove(array[ci.document_id, ci.document_signe]
                 || coalesce((select array_agg((s ->> 'preuveDocumentId')::uuid) from jsonb_array_elements(ci.signataires) s
                               where coalesce(s ->> 'preuveDocumentId', '') ~ '^[0-9a-fA-F-]{36}$'), '{}'::uuid[])
                 || coalesce((select array_agg((a ->> 'id')::uuid) from jsonb_array_elements(ci.annexes) a
                               where coalesce(a ->> 'id', '') ~ '^[0-9a-fA-F-]{36}$'), '{}'::uuid[]), null)
          into v_ids from public.bail_signature_circuits ci where ci.id = c.id;
      else
        select array_remove(array[ds.document_id, ds.document_retour_id, ds.preuve_document_id], null)
          into v_ids from public.demandes_signature ds where ds.id = c.id;
      end if;
      foreach v_doc in array coalesce(v_ids, '{}'::uuid[]) loop
        -- Une pièce qui prouve encore un autre circuit, ou une autre demande, reste.
        continue when exists (select 1 from public.bail_signature_circuits o
                               where o.id <> c.id and (o.document_id = v_doc or o.document_signe = v_doc
                                 or exists (select 1 from jsonb_array_elements(o.signataires) s where s ->> 'preuveDocumentId' = v_doc::text)
                                 or exists (select 1 from jsonb_array_elements(o.annexes) a where a ->> 'id' = v_doc::text)))
                   or exists (select 1 from public.demandes_signature o
                               where o.id <> c.id and v_doc in (o.document_id, o.document_retour_id, o.preuve_document_id));
        v_echeance := public.echeance_conservation_document(v_doc);
        -- Sa propre règle la garde plus longtemps (ou ne dit rien) : elle reste, et suivra cette règle.
        continue when v_echeance is null or v_echeance > v_jour;
        if public.purger_document_conservation(v_doc, 'preuve:signature', v_echeance) then v_docs := v_docs + 1; end if;
      end loop;
      if c.objet = 'bail_signature_circuits' then
        delete from public.signature_suivi_actions where circuit_id = c.id;
        delete from public.signature_consommations where circuit_id = c.id;
        delete from public.bail_signature_circuits where id = c.id;
      else
        delete from public.demandes_signature where id = c.id;
      end if;
      v_n := v_n + 1;
    end loop;
    v_resultat := v_resultat || jsonb_build_object('preuves_signature', v_n, 'preuves_signature_documents', v_docs);
  end if;

  -- c. Pièces d'une personne sans bail (trois mois après le dernier dépôt).
  if public.duree_conservation_active('dossier:sans_bail') is not null then
    v_docs := 0;
    for c in
      select x.id::uuid as id from public.cibles_conservation_complementaire() x
       where x.categorie = 'dossier:sans_bail' order by x.id limit 500
    loop
      if public.purger_document_conservation(c.id, 'dossier:sans_bail', v_jour) then v_docs := v_docs + 1; end if;
    end loop;
    v_resultat := v_resultat || jsonb_build_object('pieces_sans_bail', v_docs);
  end if;

  -- d. Retours d'aide : groupe_id d'abord, puis soutiens, historique, retours.
  select coalesce(array_agg(x.id::uuid), '{}'::uuid[]) into v_ids
    from public.cibles_conservation_complementaire() x
    join public.retention_rules r on r.data_type = x.categorie and r.actif and r.sort = 'suppression'
   where x.categorie in ('support:demande_droits', 'support:question_idee', 'support:contestation');
  if cardinality(v_ids) > 0 then
    update public.retours_utilisateurs set groupe_id = null where groupe_id = any (v_ids);
    delete from public.retours_soutiens where retour_id = any (v_ids);
    delete from public.retours_historique where retour_id = any (v_ids);
    delete from public.retours_utilisateurs where id = any (v_ids);
    get diagnostics v_n = row_count;
    v_resultat := v_resultat || jsonb_build_object('retours_aide', v_n);
  end if;

  -- e. Évaluations des artisans.
  if public.duree_conservation_active('artisan:evaluation') is not null then
    delete from public.artisan_evaluations
     where id in (select x.id::uuid from public.cibles_conservation_complementaire() x where x.categorie = 'artisan:evaluation');
    get diagnostics v_n = row_count;
    v_resultat := v_resultat || jsonb_build_object('evaluations_artisans', v_n);
  end if;

  -- f. Prospects (registre compris) et oppositions échues.
  if public.duree_conservation_active('contact:prospect') is not null then
    select coalesce(array_agg(x.id::uuid), '{}'::uuid[]) into v_ids
      from public.cibles_conservation_complementaire() x where x.categorie = 'contact:prospect';
    select coalesce(array_agg(i::text), '{}'::text[]) into v_textes from unnest(v_ids) i;
    delete from public.supervision_registre where objet = 'supervision_prospects' and objet_id = any (v_textes);
    delete from public.supervision_prospects where id = any (v_ids);
    get diagnostics v_n = row_count;
    v_resultat := v_resultat || jsonb_build_object('prospects', v_n);
  end if;
  if public.duree_conservation_active('prospect:opposition') is not null then
    delete from public.oppositions_prospection
     where empreinte in (select x.id from public.cibles_conservation_complementaire() x where x.categorie = 'prospect:opposition');
    get diagnostics v_n = row_count;
    v_resultat := v_resultat || jsonb_build_object('oppositions_prospection', v_n);
  end if;

  -- g. Comptes jamais utilisés (après les invitations, purgées plus tôt dans la même nuit).
  v_resultat := v_resultat || public.purger_comptes_jamais_utilises();

  -- h. Archives des comptes.
  v_resultat := v_resultat || public.purger_archives_comptes();

  -- h bis. Déclarations de rétractation arrivées au terme de leur preuve : la garde d'ajout seul de la vente laisse passer
  -- cette suppression, et elle seule. Registre des effacements à réappliquer, quatre mois après la fermeture.
  if public.duree_conservation_active('contrat:retractation') is not null then
    delete from public.retractations_abonnement
     where id in (select x.id::uuid from public.cibles_conservation_complementaire() x where x.categorie = 'contrat:retractation');
    get diagnostics v_n = row_count;
    v_resultat := v_resultat || jsonb_build_object('retractations_abonnement', v_n);
  end if;
  if public.duree_conservation_active('journal:effacements_a_reappliquer') is not null then
    delete from public.effacements_a_reappliquer
     where fermeture_id in (select x.id::uuid from public.cibles_conservation_complementaire() x
                             where x.categorie = 'journal:effacements_a_reappliquer');
    get diagnostics v_n = row_count;
    v_resultat := v_resultat || jsonb_build_object('effacements_a_reappliquer', v_n);
  end if;

  -- i. Événements Stripe traités (jamais ceux qui restent à traiter).
  if public.duree_conservation_active('journal:abonnement_evenements') is not null then
    delete from public.abonnement_evenements
     where stripe_event_id in (select x.id from public.cibles_conservation_complementaire() x
                                where x.categorie = 'journal:abonnement_evenements');
    get diagnostics v_n = row_count;
    v_resultat := v_resultat || jsonb_build_object('abonnement_evenements', v_n);
  end if;

  -- j. Journal d'authentification (R64, règle inactive tant qu'un relevé n'a pas décidé).
  v_resultat := v_resultat || jsonb_build_object('journal_auth', public.journal_auth_echus(true));

  -- k. Alertes avant suppression (J-30, J-15).
  v_resultat := v_resultat || jsonb_build_object('alertes_conservation', public.generer_alertes_conservation());

  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return v_resultat;
end $$;

-- ── 6. Contacts : listes d'attente, demandes de contact, prospects des particuliers ──────────────────────────────

create or replace function public.cibles_conservation_contacts()
returns table(categorie text,id uuid) language sql stable security definer set search_path='' as $$
 select 'contact:devis', d.id from public.demandes_devis d
 where greatest(d.created_at,d.traitee_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:devis' and sort='suppression'))
 union all
 select 'contact:attente', d.id from public.liste_attente d
 where d.created_at < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:attente' and sort='suppression'))
 union all
 -- CONSERVATION_20261024 (R44) : depuis l'inscription ; « retirée » sans attendre ; « convertie » trois mois après.
 select 'contact:attente_agences', d.id from public.liste_attente_agences d
 where d.created_at < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='contact:attente_agences' and sort='suppression'))
    or d.statut='retiree'
    or (d.statut='convertie' and exists(select 1 from public.conservation_reperes c where c.categorie='liste_attente_agences:convertie' and c.objet_id=d.id and c.depuis < now()-interval '3 months'))
 union all
 select 'invitation:locataire', d.id from public.invitations_locataires d
 where d.etat in ('en_attente','expiree','annulee','refusee') and d.expire_le < now()
 and greatest(d.expire_le,d.repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:locataire' and sort='suppression'))
 union all
 select 'invitation:artisan', d.id from public.invitations_artisans d
 where d.etat in ('en_attente','expiree','annulee','refusee') and d.expire_le < now()
 and greatest(d.expire_le,d.repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:artisan' and sort='suppression'));
$$;
revoke all on function public.cibles_conservation_contacts() from public,anon,authenticated;
grant execute on function public.cibles_conservation_contacts() to service_role;

create or replace function public.purger_contacts_echus()
returns jsonb language plpgsql security definer set search_path='' as $$
declare n bigint; resultat jsonb:='{}'; v_demandes uuid[]; v_prospects uuid[]; v_systeme text:=coalesce(current_setting('gerimmo.systeme',true),'');
begin
 if auth.uid() is not null and not public.is_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if not public.tache_planifiee_autorisee('retention-quotidienne') then return '{}'::jsonb; end if;
 -- CONSERVATION_20261024 : une invitation échue d'un compte en lecture seule se purge aussi ; passage rendu en fin.
 perform pg_catalog.set_config('gerimmo.systeme','on',true);
 -- CONSERVATION_20261024 : constats posés quelle que soit l'activation des règles (aucune suppression ici) — date de
 -- conversion d'une agence, empreinte d'opposition d'une agence retirée.
 insert into public.conservation_reperes(categorie,objet_id)
 select 'liste_attente_agences:convertie', d.id from public.liste_attente_agences d where d.statut='convertie'
 on conflict do nothing;
 delete from public.conservation_reperes c where c.categorie='liste_attente_agences:convertie'
   and not exists(select 1 from public.liste_attente_agences d where d.id=c.objet_id and d.statut='convertie');
 insert into public.oppositions_prospection(empreinte,origine)
 select public.empreinte_adresse_prospection(d.email),'liste_attente_agences' from public.liste_attente_agences d
  where d.statut='retiree' and public.empreinte_adresse_prospection(d.email) is not null
 on conflict (empreinte) do nothing;
 -- Une inscription retirée part dès que son empreinte est gardée, que la règle des 36 mois soit active ou non : c'est
 -- l'exécution d'une demande de retrait (« dans le mois »), pas une durée de conservation.
 delete from public.liste_attente_agences d where d.statut='retiree'
   and exists(select 1 from public.oppositions_prospection o where o.empreinte=public.empreinte_adresse_prospection(d.email));
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('liste_attente_agences_retirees',n);
 -- Comptes d'invités jamais connectés : la fin de leur dernière invitation est gardée AVANT que les invitations échues
 -- ne partent (plus bas), pour que le compte suive compte:invitation_jamais_utilisee et non l'inscription non confirmée.
 insert into public.conservation_reperes(categorie,objet_id,depuis)
 select 'compte:invite', i.account_id, max(greatest(i.expire_le,coalesce(i.repondu_le,i.expire_le)))
   from public.invitations_locataires i join auth.users u on u.id=i.account_id and u.last_sign_in_at is null
  group by i.account_id
 on conflict (categorie,objet_id) do update set depuis=greatest(public.conservation_reperes.depuis,excluded.depuis);
 delete from public.conservation_reperes c where c.categorie='compte:invite'
   and not exists(select 1 from auth.users u where u.id=c.objet_id and u.last_sign_in_at is null);
 -- Demandes de contact : la fiche prospect d'un particulier suit sa demande, registre compris.
 select coalesce(array_agg(c.id),'{}') into v_demandes from public.cibles_conservation_contacts() c
   join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:devis';
 select coalesce(array_agg(p.id),'{}') into v_prospects from public.supervision_prospects p
  where p.qualite='particulier' and p.demande_id=any(v_demandes);
 delete from public.supervision_registre where objet='supervision_prospects' and objet_id=any(select i::text from unnest(v_prospects) i);
 delete from public.supervision_prospects where id=any(v_prospects);
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('prospects_particuliers',n);
 delete from public.demandes_devis where id=any(v_demandes);
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('demandes_devis',n);
 delete from public.liste_attente where id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:attente');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('liste_attente',n);
 delete from public.liste_attente_agences where id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='contact:attente_agences');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('liste_attente_agences',n);
 delete from public.conservation_reperes c where c.categorie='liste_attente_agences:convertie'
   and not exists(select 1 from public.liste_attente_agences d where d.id=c.objet_id);
 delete from public.invitations_locataires where etat in ('en_attente','expiree','annulee','refusee') and greatest(expire_le,repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:locataire' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='invitation:locataire');
 get diagnostics n=row_count; resultat:=resultat||jsonb_build_object('invitations_locataires',n);
 delete from public.invitations_artisans where etat in ('en_attente','expiree','annulee','refusee') and greatest(expire_le,repondu_le) < now()-make_interval(months=>(select duree_mois from public.retention_rules where data_type='invitation:artisan' and actif and sort='suppression')) and id in(select c.id from public.cibles_conservation_contacts() c join public.retention_rules r on r.data_type=c.categorie and r.actif where c.categorie='invitation:artisan');
 get diagnostics n=row_count;
 perform pg_catalog.set_config('gerimmo.systeme',v_systeme,true);
 return resultat||jsonb_build_object('invitations_artisans',n);
end $$;
revoke all on function public.purger_contacts_echus() from public,anon,authenticated;
grant execute on function public.purger_contacts_echus() to service_role;

-- Le bilan sans suppression couvre toutes les catégories du catalogue : celles que le code purge (nombre échu, y
-- compris les signalements, les alertes traitées et les demandes de congé, purgés avant ce plan) et celles dont la
-- purge n'est pas encore écrite (`echus` vide).
create or replace function public.simuler_conservation_contacts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
 if auth.uid() is null or not public.is_permanent_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 return jsonb_build_object('categories',(select coalesce(jsonb_agg(x order by x.categorie),'[]'::jsonb) from (
   select r.data_type categorie,r.libelle,r.duree_mois,r.actif,
     case
      when r.data_type in ('contact:devis','contact:attente','contact:attente_agences','invitation:locataire','invitation:artisan')
        then (select count(*) from public.cibles_conservation_contacts() c where c.categorie=r.data_type)
      when r.data_type like 'document:%'
        then (select count(*) from public.documents d
               where 'document:'||d.type::text=r.data_type and d.purged_at is null
                 and not public.document_preuve_signature(d.id)
                 and public.echeance_conservation_document(d.id) <= v_jour)
      when r.data_type = 'journal:audit_log'
        then (select count(*) from public.audit_log a where not public.action_audit_controle_interne(a.action)
               and a.created_at < now()-make_interval(months=>r.duree_mois))
      when r.data_type = 'journal:audit_controle_interne'
        then (select count(*) from public.audit_log a where public.action_audit_controle_interne(a.action)
               and a.created_at < now()-make_interval(months=>r.duree_mois))
      when r.data_type = 'journal:auth_audit' then public.journal_auth_echus(false)
      -- Catégories déjà purgées chaque nuit par appliquer_retention et purger_signalements_support : mêmes conditions.
      when r.data_type = 'support:bug'
        then (select count(*) from public.retours_utilisateurs x where x.nature = 'bug'
               and x.cree_le < now()-make_interval(months=>r.duree_mois))
      when r.data_type = 'alerte:traitee'
        then (select count(*) from public.alerts x where x.statut = 'fermee'
               and x.closed_at < now()-make_interval(months=>r.duree_mois))
      when r.data_type = 'contrat:intention_conge'
        then (select count(*) from public.intentions_conge x where x.traitee_le is not null
               and x.traitee_le < now()-make_interval(months=>r.duree_mois))
      when r.data_type in ('preuve:signature','dossier:sans_bail','support:demande_droits','support:question_idee',
                           'support:contestation','artisan:evaluation','contact:prospect','prospect:opposition',
                           'compte:invitation_jamais_utilisee','compte:inscription_non_confirmee','archive:facture',
                           'archive:preuve_contrat','journal:abonnement_evenements','contrat:retractation',
                           'journal:effacements_a_reappliquer')
        then (select count(*) from public.cibles_conservation_complementaire() c where c.categorie=r.data_type)
      else null
     end echus
   from public.retention_rules r
   where r.data_type not like 'journal:%' or r.data_type in ('journal:audit_log','journal:audit_controle_interne','journal:auth_audit','journal:abonnement_evenements','journal:effacements_a_reappliquer')
   ) x),
   'preuves_protegees',(select count(*) from public.documents d where d.purged_at is null and public.document_preuve_signature(d.id)),
   'suppressions',0);
end $$;
revoke all on function public.simuler_conservation_contacts() from public,anon;
grant execute on function public.simuler_conservation_contacts() to authenticated;

-- Retours « bug » : même ordre que les autres retours (groupe_id d'abord), sans quoi un retour regroupé sous un
-- signalement ancien empêchait toute la purge.
create or replace function public.purger_signalements_support()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
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
  -- CONSERVATION_20261024 : ordre de purge des retours (plan du 23/10, lot 2).
  update public.retours_utilisateurs set groupe_id=null where groupe_id=any(v_ids);
  delete from public.retours_historique where retour_id=any(v_ids);
  delete from public.retours_soutiens where retour_id=any(v_ids);
  delete from public.retours_utilisateurs where id=any(v_ids);
  get diagnostics v_count=row_count;
  -- Le journal ne conserve ni le texte ni les auteurs supprimés.
  insert into public.tech_log(evenement,details)
    values('purge_signalements_support',jsonb_build_object('nombre',v_count,'duree_mois',v_mois));
  return v_count;
end;
$function$;

-- Le registre des gestes de support suit le contrôle interne (36 mois), pas le journal général ramené à 12 mois.
create or replace function support_interne.purger_gestes_support()
returns bigint language plpgsql security definer set search_path='' as $$
declare m integer; n bigint:=0;
begin
 -- CONSERVATION_20261024 : règle journal:audit_controle_interne.
 select duree_mois into m from public.retention_rules where data_type='journal:audit_controle_interne' and actif and sort='suppression';
 if found then
  delete from support_interne.gestes_encaissement where transaction_active is null and expire_le<now()-make_interval(months=>m);
  get diagnostics n=row_count;
 end if;
 return n;
end $$;
revoke all on function support_interne.purger_gestes_support() from public,anon,authenticated;

-- ── 7. Prospection : opposition et premier message (R45) ───────────────────────────────────────────────────────────

-- « Stop » : l'empreinte de l'adresse est gardée (36 mois, prospect:opposition), puis TOUTES les fiches de cette
-- adresse partent aussitôt, registre compris — plus protecteur que « dans le mois », et sans écrire la fiche (une fiche
-- ancienne à l'origine hors liste refusait toute mise à jour, donc l'opposition). Une ligne d'audit, sans adresse.
create or replace function public.enregistrer_opposition_prospection(p_prospect uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text; v_empreinte text; v_ids uuid[];
begin
  if auth.uid() is null or not public.is_permanent_super_admin() then
    raise exception 'Compte de supervision permanent requis' using errcode = '42501';
  end if;
  select p.email into v_email from public.supervision_prospects p where p.id = p_prospect for update;
  if not found then raise exception 'Prospect introuvable' using errcode = 'P0002'; end if;
  v_empreinte := public.empreinte_adresse_prospection(v_email);
  insert into public.oppositions_prospection (empreinte, origine)
  values (v_empreinte, 'prospect')
  on conflict (empreinte) do update set cree_le = now(), origine = excluded.origine;
  select coalesce(array_agg(p.id), '{}'::uuid[]) into v_ids
    from public.supervision_prospects p
   where p.id = p_prospect or public.empreinte_adresse_prospection(p.email) = v_empreinte;
  delete from public.supervision_registre
   where objet = 'supervision_prospects' and objet_id = any (select i::text from unnest(v_ids) i);
  delete from public.supervision_prospects where id = any (v_ids);
  insert into public.audit_log (account_id, organization_id, action, details)
  values (auth.uid(), null, 'prospect_opposition_enregistree', jsonb_build_object('fiches_supprimees', cardinality(v_ids)));
end $$;
revoke all on function public.enregistrer_opposition_prospection(uuid) from public, anon;
grant execute on function public.enregistrer_opposition_prospection(uuid) to authenticated;

-- Avant tout message à un prospect : refus si une opposition est enregistrée (fiche ou empreinte de l'adresse).
create or replace function public.controler_envoi_prospection(p_prospect uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare p record;
begin
  if auth.uid() is null or not public.is_permanent_super_admin() then
    raise exception 'Compte de supervision permanent requis' using errcode = '42501';
  end if;
  select x.email, x.oppose_le into p from public.supervision_prospects x where x.id = p_prospect;
  if not found then raise exception 'Prospect introuvable' using errcode = 'P0002'; end if;
  if p.oppose_le is not null
     or exists (select 1 from public.oppositions_prospection o where o.empreinte = public.empreinte_adresse_prospection(p.email)) then
    raise exception 'Opposition enregistrée : aucun message ne peut être envoyé à cette adresse' using errcode = '42501';
  end if;
end $$;
revoke all on function public.controler_envoi_prospection(uuid) from public, anon;
grant execute on function public.controler_envoi_prospection(uuid) to authenticated;

-- Liste d'attente des agences : les inscriptions auxquelles rien ne doit être envoyé — retirées à leur demande, ou dont
-- l'empreinte de l'adresse est une opposition (« Stop » d'un prospect, retrait antérieur). La console masque le lien
-- d'écriture, refuse « contactée » et les écarte de l'export. Aucune empreinte ne sort de la base.
create or replace function public.inscriptions_agences_opposees()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Accès réservé à la supervision' using errcode = '42501';
  end if;
  return query
    select d.id from public.liste_attente_agences d
     where d.statut = 'retiree'
        or exists (select 1 from public.oppositions_prospection o where o.empreinte = public.empreinte_adresse_prospection(d.email));
end $$;
revoke all on function public.inscriptions_agences_opposees() from public, anon;
grant execute on function public.inscriptions_agences_opposees() to authenticated;

-- ── 8. Gel en cas de litige ─────────────────────────────────────────────────────────────────────────────────────────

-- L'écriture du gel, seule sous le passage « système » (un geste protecteur, permis aussi quand l'abonnement est en
-- lecture seule) ; jamais ouverte à authenticated : geler_conservation_bail contrôle le droit, la date et le motif.
-- Un gel ferme aussitôt les alertes J-30 du bail dont la date tombe sous lui (le courriel ne part plus) ; elles
-- reviendront, à la nouvelle date, quand elle approchera.
create or replace function public.ecrire_gel_conservation_bail(p_bail uuid, p_jusqu_au date, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
begin
  perform pg_catalog.set_config('gerimmo.systeme', 'on', true);
  update public.baux
     set conservation_gelee_jusqu_au = p_jusqu_au,
         conservation_gelee_motif = case when p_jusqu_au is null then null else p_motif end
   where id = p_bail;
  if p_jusqu_au is not null then
    update public.alerts
       set statut = 'fermee', closed_at = now(), updated_at = now(),
           closed_action = 'Fermée automatiquement : un gel suspend la suppression des pièces.',
           details = details || jsonb_build_object('fermeture_auto', true)
     where type = 'conservation_echeance' and statut = 'ouverte'
       and details ->> 'bail_id' = p_bail::text and echeance <= p_jusqu_au;
  end if;
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
end $$;
revoke all on function public.ecrire_gel_conservation_bail(uuid, date, text) from public, anon, authenticated;
grant execute on function public.ecrire_gel_conservation_bail(uuid, date, text) to service_role;

-- Le jour où les pièces d'un bail terminé se supprimeraient si le gel était levé maintenant : la plus courte durée des
-- pièces du bail comptée depuis sa fin, et jamais moins de trente jours après aujourd'hui (préavis : la levée ne
-- supprime jamais sans l'alerte J-30). NULL tant que le bail n'est pas terminé ou si aucune règle n'est active.
create or replace function public.echeance_levee_gel_bail(p_bail uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when f.fin is null or m.mois is null then null
              else greatest((f.fin + make_interval(months => m.mois))::date, (now() at time zone 'Europe/Paris')::date + 30) end
    from (select public.fin_conservation_bail(p_bail) as fin) f,
         (select min(r.duree_mois) as mois from public.retention_rules r
           where r.actif and r.sort in ('suppression', 'anonymisation')
             and ((r.data_type like 'document:%' and r.declencheur in ('Fin du bail', 'Fin du dernier bail'))
                  or r.data_type = 'preuve:signature')) m;
$$;

create or replace function public.geler_conservation_bail(p_bail uuid, p_jusqu_au date, p_motif text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_preavis_motif constant text := 'Préavis de trente jours après la levée du gel';
  v_jusqu_au date := p_jusqu_au;
  v_preavis boolean := false;
  v_levee date;
  b record;
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select x.id, x.organization_id, x.conservation_gelee_jusqu_au, x.conservation_gelee_motif into b
    from public.baux x where x.id = p_bail for update;
  if not found or b.organization_id not in (select public.org_ids_avec_roles(
       array['admin_agence', 'agent', 'proprietaire_direct']::public.membership_role[]))
     or public.bail_hors_portefeuille(b.organization_id, p_bail) then
    raise exception 'Bail introuvable' using errcode = '42501';
  end if;
  if p_jusqu_au is not null then
    if p_jusqu_au <= v_jour then
      raise exception 'La fin du gel doit être postérieure à aujourd''hui' using errcode = '22023';
    end if;
    if p_jusqu_au > (v_jour + interval '12 months')::date then
      raise exception 'Un gel dure douze mois au plus ; il se renouvelle ensuite si le litige continue' using errcode = '22023';
    end if;
    if v_motif is null or length(v_motif) < 5 or length(v_motif) > 500 then
      raise exception 'Indiquez le litige en cours (5 à 500 caractères)' using errcode = '22023';
    end if;
  elsif b.conservation_gelee_motif = v_preavis_motif and b.conservation_gelee_jusqu_au >= v_jour then
    -- Le préavis d'une levée précédente court déjà : une nouvelle levée ne le repousse pas.
    v_jusqu_au := b.conservation_gelee_jusqu_au;
    v_motif := v_preavis_motif;
    v_preavis := true;
  elsif b.conservation_gelee_jusqu_au is not null and b.conservation_gelee_jusqu_au >= v_jour then
    -- Levée : si les pièces partiraient dans moins de trente jours, elles attendent trente jours (préavis), le temps
    -- de l'alerte J-30 et du téléchargement.
    -- (echeance_levee_gel_bail vaut alors aujourd'hui + 30 ; à trente jours pile, le préavis ne change pas la date.)
    v_levee := public.echeance_levee_gel_bail(p_bail);
    if v_levee is not null and v_levee <= v_jour + 30 then
      v_jusqu_au := v_jour + 29;
      v_motif := v_preavis_motif;
      v_preavis := true;
    end if;
  end if;
  perform public.ecrire_gel_conservation_bail(p_bail, v_jusqu_au, v_motif);
  insert into public.audit_log (account_id, organization_id, action, details)
  values (auth.uid(), b.organization_id,
          case when p_jusqu_au is null then 'conservation_gel_leve' else 'conservation_gel_pose' end,
          jsonb_build_object('bail_id', p_bail, 'jusqu_au', p_jusqu_au,
                             'motif', case when p_jusqu_au is null then null else v_motif end,
                             'preavis_jusqu_au', case when v_preavis then v_jusqu_au end,
                             'avant_jusqu_au', b.conservation_gelee_jusqu_au));
  return jsonb_build_object('bail_id', p_bail, 'jusqu_au', p_jusqu_au, 'preavis', v_preavis,
                            'echeance', public.echeance_conservation_bail(p_bail, public.duree_conservation_active('document:bail')));
end $$;
revoke all on function public.geler_conservation_bail(uuid, date, text) from public, anon;
grant execute on function public.geler_conservation_bail(uuid, date, text) to authenticated;

-- Ce que la fiche du bail affiche : l'échéance des pièces, le gel en cours (ou le préavis d'une levée) et le jour où
-- les pièces partiraient si le gel était levé maintenant.
create or replace function public.lire_conservation_bail(p_bail uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare b record;
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select x.id, x.organization_id, x.etat, x.conservation_gelee_jusqu_au, x.conservation_gelee_motif into b
    from public.baux x where x.id = p_bail;
  if not found or b.organization_id not in (select public.org_ids_avec_roles(
       array['admin_agence', 'agent', 'proprietaire_direct']::public.membership_role[]))
     or public.bail_hors_portefeuille(b.organization_id, p_bail) then
    raise exception 'Bail introuvable' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'etat', b.etat,
    'duree_mois', public.duree_conservation_active('document:bail'),
    'echeance', public.echeance_conservation_bail(p_bail, public.duree_conservation_active('document:bail')),
    'gelee_jusqu_au', b.conservation_gelee_jusqu_au,
    'gel_motif', b.conservation_gelee_motif,
    'preavis', coalesce(b.conservation_gelee_motif = 'Préavis de trente jours après la levée du gel', false),
    'echeance_si_levee', public.echeance_levee_gel_bail(p_bail));
end $$;
revoke all on function public.lire_conservation_bail(uuid) from public, anon;
grant execute on function public.lire_conservation_bail(uuid) to authenticated;

-- ── 9. Alertes avant suppression et leurs courriels ────────────────────────────────────────────────────────────────

-- Poser (ou remettre à jour) une alerte de conservation, identifiée par sa clé (`cle_conservation` : un bail et une
-- date, un espace et une date, ou une personne) et son seuil (date et ensemble des pièces). Une alerte ouverte dont
-- le seuil change est réécrite et son courriel repart ; une alerte que l'utilisateur a fermée au même seuil ne revient
-- pas ; une alerte fermée par la base (gel, date changée) peut revenir. Rend 1 pour une alerte nouvelle.
create or replace function public.poser_alerte_conservation(p_org uuid, p_type text, p_cle uuid, p_seuil text,
                                                            p_titre text, p_details jsonb, p_echeance date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_ouverte uuid;
begin
  select a.id into v_ouverte from public.alerts a
   where a.type = p_type and a.statut = 'ouverte' and a.details ->> 'cle_conservation' = p_cle::text
   order by a.created_at desc limit 1;
  if v_ouverte is not null then
    update public.alerts
       set titre = p_titre, echeance = p_echeance, updated_at = now(),
           details = details || p_details || jsonb_build_object('seuil', p_seuil, 'cle_conservation', p_cle)
     where id = v_ouverte and details ->> 'seuil' is distinct from p_seuil;
    return 0;
  end if;
  if exists (select 1 from public.alerts a
              where a.type = p_type and a.details ->> 'cle_conservation' = p_cle::text and a.details ->> 'seuil' = p_seuil
                and not coalesce((a.details ->> 'fermeture_auto')::boolean, false)) then
    return 0;
  end if;
  insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
  values (p_org, p_type, 'normale', p_titre,
          p_details || jsonb_build_object('seuil', p_seuil, 'cle_conservation', p_cle), p_echeance);
  return 1;
end $$;

-- Les alertes avant suppression, posées chaque nuit par la purge :
--  · J-30, pièces d'un bail terminé : une alerte par bail ET par date (une pièce qui entre plus tard dans la fenêtre a
--    la sienne, sans renvoyer la première) ;
--  · J-30, documents rattachés à aucun bail (page confidentialité : « vous êtes prévenu 30 jours avant ») : une alerte
--    par espace et par date ;
--  · J-15, pièces d'une personne rattachée à aucun bail, quand dossier:sans_bail est active.
-- Une alerte ouverte qui n'est plus due (gel, rattachement, pièce retirée, date passée) se ferme d'elle-même.
create or replace function public.generer_alertes_conservation()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_preuve integer := public.duree_conservation_active('preuve:signature');
  v_sans_bail integer := public.duree_conservation_active('dossier:sans_bail');
  v_crees integer := 0;
  v_liste text;
  v_cles text[] := '{}'::text[];
  b record;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Réservé aux tâches planifiées et à la supervision' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('gerimmo.systeme', 'on', true);

  -- J-30 : les pièces d'un bail terminé supprimées dans les trente jours (une alerte par bail et par date).
  for b in
    with pieces as (
      select x.bail_id, d.id, d.organization_id,
             coalesce(nullif(btrim(d.titre), ''), r.libelle, 'Document') as titre,
             case when x.preuve then public.echeance_conservation_bail(x.bail_id, v_preuve)
                  else public.echeance_conservation_document(d.id) end as echeance
        from (
          select l.entite_id as bail_id, l.document_id, false as preuve
            from public.document_liens l where l.entite = 'bail'
          union
          select bx.id, bx.document_signe, false from public.baux bx where bx.document_signe is not null
          union
          select bx.id, bx.reglement_copropriete, false from public.baux bx where bx.reglement_copropriete is not null
          union
          select c.bail_id, c.document_signe, true from public.bail_signature_circuits c
           where v_preuve is not null and c.bail_id is not null and c.etat = 'termine' and c.document_signe is not null
        ) x
        join public.documents d on d.id = x.document_id and d.purged_at is null
        left join public.retention_rules r on r.data_type = 'document:' || d.type::text
       where x.preuve or not public.document_preuve_signature(d.id)
    ), dues as (
      select p.bail_id, p.organization_id, p.echeance, count(distinct p.id) as n,
             array_agg(distinct p.titre order by p.titre) as titres,
             md5(string_agg(distinct p.id::text, ',' order by p.id::text)) as empreinte
        from pieces p
       where p.echeance between v_jour and v_jour + 30
       group by p.bail_id, p.organization_id, p.echeance
    )
    select du.*, md5('bail:' || du.bail_id::text || ':' || du.echeance::text)::uuid as cle,
           coalesce(l.nom, 'logement') || coalesce(' · ' || nullif(btrim(coalesce(pe.prenom, '') || ' ' || pe.nom), ''), '') as libelle
      from dues du
      join public.baux bx on bx.id = du.bail_id
      left join public.lots l on l.id = bx.lot_id
      left join public.persons pe on pe.id = bx.locataire_principal
  loop
    v_liste := array_to_string(b.titres[1:10], ', ')
               || case when cardinality(b.titres) > 10 then format(' et %s autre(s) pièce(s)', cardinality(b.titres) - 10) else '' end;
    v_cles := v_cles || b.cle::text;
    v_crees := v_crees + public.poser_alerte_conservation(
      b.organization_id, 'conservation_echeance', b.cle, 'J-30 ' || to_char(b.echeance, 'YYYY-MM-DD') || ' ' || left(b.empreinte, 12),
      format('Les pièces suivantes du bail %s seront supprimées le %s, au terme de leur durée de conservation (page confidentialité) : %s. Téléchargez celles que vous devez conserver. Si un litige est en cours, signalez-le depuis la fiche du bail pour suspendre la suppression.',
             b.libelle, to_char(b.echeance, 'DD/MM/YYYY'), v_liste),
      jsonb_build_object('bail_id', b.bail_id, 'echeance', b.echeance, 'pieces', b.n,
                         'courriel', null, 'courriel_tentatives', 0),
      b.echeance);
  end loop;

  -- J-30 : les documents rattachés à aucun bail (ni lien, ni acte signé, ni annexe, ni preuve d'un circuit), par
  -- espace et par date. Les pièces d'une personne sans bail suivent le J-15 quand dossier:sans_bail est active.
  for b in
    with docs as (
      select d.id, d.organization_id, coalesce(nullif(btrim(d.titre), ''), r.libelle, 'Document') as titre,
             public.echeance_conservation_document(d.id) as echeance
        from public.documents d
        join public.retention_rules r
          on r.data_type = 'document:' || d.type::text and r.actif and r.sort in ('suppression', 'anonymisation')
       where d.purged_at is null and d.type <> 'document_test'
         -- préfiltre bon marché, comme la purge : l'échéance n'est jamais avant le dépôt + min(durée, 36 mois)
         and d.retention_reference_date + make_interval(months => least(r.duree_mois, 36)) <= v_jour + 31
         and not exists (select 1 from public.document_liens l where l.document_id = d.id and l.entite = 'bail')
         and not exists (select 1 from public.baux bx where bx.document_signe = d.id or bx.reglement_copropriete = d.id)
         and not public.document_preuve_signature(d.id)
         and not (v_sans_bail is not null and public.document_dossier_sans_bail(d.id))
    )
    select x.organization_id, x.echeance, count(*) as n, array_agg(x.titre order by x.titre) as titres,
           md5(string_agg(x.id::text, ',' order by x.id::text)) as empreinte,
           md5('documents:' || x.organization_id::text || ':' || x.echeance::text)::uuid as cle
      from docs x
     where x.echeance between v_jour and v_jour + 30
     group by x.organization_id, x.echeance
  loop
    v_liste := array_to_string(b.titres[1:10], ', ')
               || case when cardinality(b.titres) > 10 then format(' et %s autre(s) document(s)', cardinality(b.titres) - 10) else '' end;
    v_cles := v_cles || b.cle::text;
    v_crees := v_crees + public.poser_alerte_conservation(
      b.organization_id, 'conservation_documents', b.cle, 'J-30 ' || to_char(b.echeance, 'YYYY-MM-DD') || ' ' || left(b.empreinte, 12),
      format('Les documents suivants, qui ne sont rattachés à aucun bail, seront supprimés le %s, au terme de leur durée de conservation (page confidentialité) : %s. Téléchargez ceux que vous devez conserver.',
             to_char(b.echeance, 'DD/MM/YYYY'), v_liste),
      jsonb_build_object('echeance', b.echeance, 'pieces', b.n, 'courriel', null, 'courriel_tentatives', 0),
      b.echeance);
  end loop;

  -- J-15 : les pièces d'une personne rattachée à aucun bail, quand la règle est active.
  if v_sans_bail is not null then
    for b in
      select p.id as person_id, p.organization_id,
             nullif(btrim(coalesce(p.prenom, '') || ' ' || p.nom), '') as nom,
             public.echeance_dossier_sans_bail(p.id, v_sans_bail) as echeance
        from public.persons p
       where exists (select 1 from public.document_liens l where l.entite = 'personne' and l.entite_id = p.id
                      and public.document_dossier_sans_bail(l.document_id))
    loop
      continue when b.echeance is null or b.echeance not between v_jour and v_jour + 15;
      v_cles := v_cles || b.person_id::text;
      v_crees := v_crees + public.poser_alerte_conservation(
        b.organization_id, 'conservation_sans_bail', b.person_id, 'J-15 ' || to_char(b.echeance, 'YYYY-MM-DD'),
        format('Les pièces de %s, qui n''est rattachée à aucun bail, seront supprimées le %s. Si cette personne est locataire ou caution d''un bail, rattachez-la au bail avant cette date.',
               coalesce(b.nom, 'cette personne'), to_char(b.echeance, 'DD/MM/YYYY')),
        jsonb_build_object('person_id', b.person_id, 'echeance', b.echeance, 'courriel', null, 'courriel_tentatives', 0),
        b.echeance);
    end loop;
  end if;

  -- Une alerte ouverte qui n'est plus due se ferme d'elle-même ; elle pourra revenir à sa nouvelle date.
  update public.alerts a
     set statut = 'fermee', closed_at = now(), updated_at = now(),
         closed_action = case when a.echeance < v_jour
                              then 'Fermée automatiquement : la date de suppression est passée.'
                              else 'Fermée automatiquement : la date de suppression a changé (gel, rattachement ou pièce retirée).' end,
         details = a.details || jsonb_build_object('fermeture_auto', true)
   where a.type in ('conservation_echeance', 'conservation_documents', 'conservation_sans_bail')
     and a.statut = 'ouverte'
     and not (coalesce(a.details ->> 'cle_conservation', '') = any (v_cles));

  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return v_crees;
end $$;

-- La file des courriels des alertes de conservation, pour la mission « rappels » (clé de service). Revérifiée au
-- moment de l'envoi : date pas encore passée, pas de gel qui la couvre, échéance sans bail inchangée.
create or replace function public.alertes_conservation_a_envoyer(p_limite integer default 50)
returns table (alerte_id uuid, organization_id uuid, organisation text, proprietaire_direct boolean, type text,
               titre text, details jsonb, destinataires text[])
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.organization_id, o.name, o.type::text = 'proprietaire_direct', a.type, a.titre, a.details,
         array(select distinct ac.email from public.memberships m join public.accounts ac on ac.id = m.account_id
                where m.organization_id = a.organization_id and m.status = 'active'
                  and m.role in ('admin_agence', 'proprietaire_direct') order by 1)
    from public.alerts a
    join public.organizations o on o.id = a.organization_id
   where a.type in ('conservation_echeance', 'conservation_documents', 'conservation_sans_bail') and a.statut = 'ouverte'
     and a.details ->> 'courriel' is null
     and coalesce((a.details ->> 'courriel_tentatives')::integer, 0) < 3
     and a.echeance >= (now() at time zone 'Europe/Paris')::date
     and (a.type <> 'conservation_echeance'
          or not exists (select 1 from public.baux bx where bx.id::text = a.details ->> 'bail_id'
                          and bx.conservation_gelee_jusqu_au >= a.echeance))
     and (a.type <> 'conservation_sans_bail'
          or public.echeance_dossier_sans_bail((a.details ->> 'person_id')::uuid,
                                               public.duree_conservation_active('dossier:sans_bail')) = a.echeance)
   order by a.created_at, a.id
   limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

-- Réserver (une seule fois) puis noter le résultat de l'envoi : envoyé, incertain (jamais renvoyé), sans destinataire,
-- ou échec certain (réservation retirée, trois tentatives au plus).
create or replace function public.noter_courriel_alerte_conservation(p_alerte uuid, p_etat text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_systeme text := coalesce(current_setting('gerimmo.systeme', true), ''); v_n integer;
begin
  if p_etat is null or p_etat not in ('reserve', 'envoye', 'incertain', 'sans_destinataire', 'echec') then
    raise exception 'État d''envoi inconnu' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('gerimmo.systeme', 'on', true);
  if p_etat = 'reserve' then
    update public.alerts set details = details || jsonb_build_object('courriel', 'reserve', 'courriel_le', now())
     where id = p_alerte and type in ('conservation_echeance', 'conservation_documents', 'conservation_sans_bail') and statut = 'ouverte'
       and details ->> 'courriel' is null;
  elsif p_etat = 'echec' then
    update public.alerts
       set details = (details - 'courriel')
                     || jsonb_build_object('courriel_tentatives', coalesce((details ->> 'courriel_tentatives')::integer, 0) + 1,
                                           'courriel_le', now())
     where id = p_alerte and details ->> 'courriel' = 'reserve';
  else
    update public.alerts set details = details || jsonb_build_object('courriel', p_etat, 'courriel_le', now())
     where id = p_alerte and details ->> 'courriel' = 'reserve';
  end if;
  get diagnostics v_n = row_count;
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return v_n = 1;
end $$;

-- ── 10. appliquer_retention : échéances, contrôle interne, lecture seule, catégories nouvelles ─────────────────────
-- Aucune fonction ouverte à authenticated ne touche au passage « système » (tests/abonnement-stripe.test.ts) :
-- appliquer_retention, que le super-administrateur lance depuis la console, délègue les écritures gardées par la
-- lecture seule à purger_document_conservation et à appliquer_conservation_complementaire (clé de service seulement),
-- qui posent ce passage le temps de leurs propres écritures puis le rendent.
do $patch$
declare f text; ancien text; nouveau text;
begin
  select pg_get_functiondef('public.appliquer_retention()'::regprocedure) into f;
  if strpos(f, 'CONSERVATION_20261024') > 0 then return; end if;

  ancien := $a$    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);$a$;
  nouveau := $n$    -- CONSERVATION_20261024 : douze mois en général ; les actions de contrôle interne suivent
    -- journal:audit_controle_interne (36 mois).
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois)
        and not public.action_audit_controle_interne(action);$n$;
  if (length(f) - length(replace(f, ancien, ''))) / length(ancien) <> 1 then raise exception 'appliquer_retention : bloc du journal d''audit inattendu'; end if;
  f := replace(f, ancien, nouveau);

  ancien := $a$           public.debut_conservation_document(d.id) as debut$a$;
  nouveau := $n$           public.echeance_conservation_document(d.id) as echeance$n$;
  if (length(f) - length(replace(f, ancien, ''))) / length(ancien) <> 1 then raise exception 'appliquer_retention : sélection documentaire inattendue'; end if;
  f := replace(f, ancien, nouveau);

  ancien := $a$      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()$a$;
  nouveau := $n$      and d.retention_reference_date + make_interval(months => least(r.duree_mois, 36)) <= now()$n$;
  if (length(f) - length(replace(f, ancien, ''))) / length(ancien) <> 1 then raise exception 'appliquer_retention : préfiltre inattendu'; end if;
  f := replace(f, ancien, nouveau);

  ancien := $a$    continue when v_doc.debut is null;
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
                               'debut_conservation', v_doc.debut));$a$;
  nouveau := $n$    -- L'échéance de la règle (echeance_conservation_document : fin du bail, gel, restitution ; pour les autres
    -- déclencheurs, debut_conservation_document) ; suppression le jour même, au jour de Paris.
    continue when v_doc.echeance is null;
    continue when v_doc.echeance > (now() at time zone 'Europe/Paris')::date;

    -- Même sort, même trace qu'avant, appliqués par purger_document_conservation : une pièce échue d'un compte en
    -- lecture seule se purge aussi (elle faisait échouer toute la purge de la nuit).
    continue when not public.purger_document_conservation(v_doc.id, v_doc.data_type, v_doc.echeance);
    if v_doc.sort = 'anonymisation' then
      v_docs_anonymises := v_docs_anonymises + 1;
    end if;$n$;
  if (length(f) - length(replace(f, ancien, ''))) / length(ancien) <> 1 then raise exception 'appliquer_retention : boucle des documents inattendue'; end if;
  f := replace(f, ancien, nouveau);

  -- Posé juste après la boucle des documents : le bloc de 20261014231000 reste le dernier avant le bilan, et le raccord
  -- de T12 (20261016180000) garde son texte, comme leurs retours l'attendent.
  ancien := $a$  end loop;
$a$;
  nouveau := $n$  end loop;

  -- Catégories du plan de conformité du 23/10 (lot 2) et alertes avant suppression.
  v_journaux := v_journaux || public.appliquer_conservation_complementaire();
$n$;
  if (length(f) - length(replace(f, ancien, ''))) / length(ancien) <> 1 then raise exception 'appliquer_retention : fin de la boucle des documents inattendue'; end if;
  execute replace(f, ancien, nouveau);
end $patch$;

-- ── 11. Droits ──────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.duree_conservation_active(text) from public, anon, authenticated;
grant execute on function public.duree_conservation_active(text) to service_role;
revoke all on function public.action_audit_controle_interne(text) from public, anon, authenticated;
grant execute on function public.action_audit_controle_interne(text) to service_role;
revoke all on function public.empreinte_adresse_prospection(text) from public, anon, authenticated;
grant execute on function public.empreinte_adresse_prospection(text) to service_role;
revoke all on function public.fin_conservation_bail(uuid) from public, anon, authenticated;
grant execute on function public.fin_conservation_bail(uuid) to service_role;
revoke all on function public.echeance_conservation_bail(uuid, integer) from public, anon, authenticated;
grant execute on function public.echeance_conservation_bail(uuid, integer) to service_role;
revoke all on function public.echeance_conservation_document(uuid) from public, anon, authenticated;
grant execute on function public.echeance_conservation_document(uuid) to service_role;
revoke all on function public.personne_sans_bail(uuid) from public, anon, authenticated;
grant execute on function public.personne_sans_bail(uuid) to service_role;
revoke all on function public.document_dossier_sans_bail(uuid) from public, anon, authenticated;
grant execute on function public.document_dossier_sans_bail(uuid) to service_role;
revoke all on function public.echeance_dossier_sans_bail(uuid, integer) from public, anon, authenticated;
grant execute on function public.echeance_dossier_sans_bail(uuid, integer) to service_role;
revoke all on function public.echeance_facture_archivee(jsonb, date, integer) from public, anon, authenticated;
grant execute on function public.echeance_facture_archivee(jsonb, date, integer) to service_role;
revoke all on function public.purger_document_conservation(uuid, text, date) from public, anon, authenticated;
grant execute on function public.purger_document_conservation(uuid, text, date) to service_role;
revoke all on function public.cibles_conservation_complementaire() from public, anon, authenticated;
grant execute on function public.cibles_conservation_complementaire() to service_role;
revoke all on function public.journal_auth_echus(boolean) from public, anon, authenticated;
grant execute on function public.journal_auth_echus(boolean) to service_role;
revoke all on function public.purger_comptes_jamais_utilises() from public, anon, authenticated;
grant execute on function public.purger_comptes_jamais_utilises() to service_role;
revoke all on function public.purger_archives_comptes() from public, anon, authenticated;
grant execute on function public.purger_archives_comptes() to service_role;
revoke all on function public.echeance_retractation_abonnement(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.echeance_retractation_abonnement(timestamptz, integer) to service_role;
revoke all on function public.appliquer_conservation_complementaire() from public, anon, authenticated;
grant execute on function public.appliquer_conservation_complementaire() to service_role;
revoke all on function public.generer_alertes_conservation() from public, anon, authenticated;
grant execute on function public.generer_alertes_conservation() to service_role;
revoke all on function public.alertes_conservation_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.alertes_conservation_a_envoyer(integer) to service_role;
revoke all on function public.noter_courriel_alerte_conservation(uuid, text) from public, anon, authenticated;
grant execute on function public.noter_courriel_alerte_conservation(uuid, text) to service_role;
revoke all on function public.poser_alerte_conservation(uuid, text, uuid, text, text, jsonb, date) from public, anon, authenticated;
grant execute on function public.poser_alerte_conservation(uuid, text, uuid, text, text, jsonb, date) to service_role;
revoke all on function public.echeance_levee_gel_bail(uuid) from public, anon, authenticated;
grant execute on function public.echeance_levee_gel_bail(uuid) to service_role;

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
