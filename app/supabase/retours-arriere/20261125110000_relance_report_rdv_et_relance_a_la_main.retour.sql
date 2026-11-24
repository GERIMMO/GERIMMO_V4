-- RETOUR ARRIÈRE de 20261125110000_relance_report_rdv_et_relance_a_la_main.sql (décisions du 24/11/2026, lot D4, Q37 et Q24).
--
-- Rend aux deux chaînes leur tête d'avant : les contextes « relance_report_rdv » et « relance_loyer_manuelle » ne sont
-- plus reconnus. La relance d'une demande de report et la relance de loyer envoyée à la main redeviennent suspendues
-- par la liste fermée, comme avant cette migration. Le cinquième interrupteur est retiré, et les quatre fonctions du
-- réglage retrouvent leur texte du 22/11 (quatre envois). L'état des quatre premiers interrupteurs est conservé.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Si le code du 24/11 reste en place, il
-- attend cinq réponses de la lecture des écrans et n'en reçoit plus que quatre : il tient alors TOUS les envois pour
-- fermés côté écrans (rien n'est proposé), et la tâche des reports tient le sien pour fermé.
--
-- RIEN N'EST EFFACÉ des traces métier : relances notées sur les demandes de report, relances consignées aux baux,
-- journal des gestes du superviseur. Les e-mails de ces deux types encore en file ne peuvent plus être prouvés par
-- l'ancienne chaîne : ils sont marqués « à vérifier », sans reprise automatique, et leur contenu chiffré est effacé.
-- Rejouable : sur un schéma déjà revenu, aucune action.
--
-- ORDRE : ce retour ne défait que le maillon de tête de la chaîne des e-mails. Tant qu'une migration plus récente
-- prolonge cette chaîne, il se refuse sans rien modifier : son retour à elle se joue d'abord. Il se joue AVANT le
-- retour de 20261122200000, qui supprime la table des interrupteurs.
do $retour$
begin
  if (to_regprocedure('public.empreinte_avant_relances_d4(uuid,jsonb)') is not null
      and position('public.empreinte_avant_relances_d4(' in coalesce((select p.prosrc from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.empreinte_metier_courriel(uuid,jsonb)')), '')) = 0)
     or (to_regprocedure('public.finaliser_avant_relances_d4(text)') is not null
      and position('public.finaliser_avant_relances_d4(' in coalesce((select p.prosrc from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.finaliser_courriel_metier(text)')), '')) = 0) then
    raise exception 'Retour refusé : une migration plus récente prolonge la chaîne des e-mails au-dessus de ce maillon. Jouer d''abord son retour (ordre inverse du manifeste).';
  end if;
  if to_regprocedure('public.empreinte_avant_relances_d4(uuid,jsonb)') is not null then
    update public.courriels_durables
       set reprise_autonome = false, finalisation_etat = 'a_verifier', charge_chiffree = null,
           motif = 'Retour arrière du 24/11 : relance refermée'
     where contexte_metier->>'type' in ('relance_report_rdv', 'relance_loyer_manuelle')
       and finalisation_etat is distinct from 'terminee';
    drop function public.empreinte_metier_courriel(uuid, jsonb);
    alter function public.empreinte_avant_relances_d4(uuid, jsonb) rename to empreinte_metier_courriel;
    revoke all on function public.empreinte_metier_courriel(uuid, jsonb) from public, anon, authenticated;
    grant execute on function public.empreinte_metier_courriel(uuid, jsonb) to service_role;
  end if;
  if to_regprocedure('public.finaliser_avant_relances_d4(text)') is not null then
    drop function public.finaliser_courriel_metier(text);
    alter function public.finaliser_avant_relances_d4(text) rename to finaliser_courriel_metier;
    revoke all on function public.finaliser_courriel_metier(text) from public, anon, authenticated;
    grant execute on function public.finaliser_courriel_metier(text) to service_role;
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261125110000';
  end if;
end $retour$;

-- Les quatre fonctions du réglage reprennent leur texte de 20261122200000 (quatre envois), si la table existe encore
-- (sinon le retour de 20261122200000 a déjà tout retiré). Elles sont reposées AVANT le retrait de la colonne, qu'elles
-- ne citent plus.
do $rendre$
begin
  if to_regclass('public.envois_automatiques_reglage') is null then return; end if;
  execute $sql$
create or replace function public.envoi_automatique_ouvert(p_flux text)
returns boolean language sql stable security definer set search_path = '' as $f$
  select coalesce((
    select case p_flux
             when 'avis_echeance' then r.avis_echeance
             when 'relance_loyer' then r.relance_loyer
             when 'rappel_rendez_vous' then r.rappel_rendez_vous
             when 'relance_invitation' then r.relance_invitation
             else false
           end
      from public.envois_automatiques_reglage r where r.singleton), false);
$f$;
comment on function public.envoi_automatique_ouvert(text) is
  'Vrai si le superviseur a ouvert cet envoi automatique (P1-08). Flux inconnu ou réglage absent : faux.';
revoke all on function public.envoi_automatique_ouvert(text) from public, anon, authenticated;
grant execute on function public.envoi_automatique_ouvert(text) to service_role;

create or replace function public.lire_envois_automatiques()
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare
  r public.envois_automatiques_reglage;
begin
  if public.is_super_admin() is not true then
    raise exception 'Accès réservé à la supervision' using errcode = '42501';
  end if;
  select * into r from public.envois_automatiques_reglage where singleton;
  return jsonb_build_object(
    'avis_echeance', coalesce(r.avis_echeance, false),
    'relance_loyer', coalesce(r.relance_loyer, false),
    'rappel_rendez_vous', coalesce(r.rappel_rendez_vous, false),
    'relance_invitation', coalesce(r.relance_invitation, false),
    'modifie_le', r.modifie_le,
    -- Avant d'ouvrir : combien d'espaces ont déjà donné leur accord permanent. Leurs e-mails partiraient aussitôt.
    'espaces_avis_echeance', (select count(*) from public.organizations o where o.appels_envoi_auto),
    'espaces_relance_loyer', (select count(*) from public.organizations o where o.relances_envoi_auto));
end;
$f$;
comment on function public.lire_envois_automatiques() is
  'État des quatre interrupteurs d''envoi automatique, pour la console du superviseur (P1-08).';
revoke all on function public.lire_envois_automatiques() from public, anon, service_role;
grant execute on function public.lire_envois_automatiques() to authenticated;

-- Ce que les écrans des espaces peuvent proposer : rien de confidentiel, quatre oui/non. Fermé : le profil d'un espace
-- continue d'afficher « envoi suspendu » et ne demande aucun accord.
create or replace function public.envois_automatiques_proposes()
returns jsonb language sql stable security definer set search_path = '' as $f$
  select jsonb_build_object(
    'avis_echeance', public.envoi_automatique_ouvert('avis_echeance'),
    'relance_loyer', public.envoi_automatique_ouvert('relance_loyer'),
    'rappel_rendez_vous', public.envoi_automatique_ouvert('rappel_rendez_vous'),
    'relance_invitation', public.envoi_automatique_ouvert('relance_invitation'));
$f$;
comment on function public.envois_automatiques_proposes() is
  'Les envois automatiques que le superviseur a ouverts (P1-08), pour que les écrans des espaces sachent quoi proposer. Quatre booléens, aucun autre contenu.';
revoke all on function public.envois_automatiques_proposes() from public, anon;
grant execute on function public.envois_automatiques_proposes() to authenticated, service_role;

create or replace function public.regler_envoi_automatique(p_flux text, p_ouvert boolean)
returns void language plpgsql security definer set search_path = '' as $f$
declare
  r public.envois_automatiques_reglage;
  v_precedent boolean;
begin
  if public.is_permanent_super_admin() is not true then
    raise exception 'Supervision permanente et double vérification requises';
  end if;
  if p_flux is null or p_flux not in ('avis_echeance', 'relance_loyer', 'rappel_rendez_vous', 'relance_invitation') then
    raise exception 'Envoi automatique inconnu';
  end if;
  if p_ouvert is null then
    raise exception 'Indiquez si cet envoi est ouvert ou fermé';
  end if;
  insert into public.envois_automatiques_reglage (singleton) values (true) on conflict (singleton) do nothing;
  select * into r from public.envois_automatiques_reglage where singleton for update;
  v_precedent := case p_flux
    when 'avis_echeance' then r.avis_echeance when 'relance_loyer' then r.relance_loyer
    when 'rappel_rendez_vous' then r.rappel_rendez_vous else r.relance_invitation end;
  update public.envois_automatiques_reglage
     set avis_echeance = case when p_flux = 'avis_echeance' then p_ouvert else avis_echeance end,
         relance_loyer = case when p_flux = 'relance_loyer' then p_ouvert else relance_loyer end,
         rappel_rendez_vous = case when p_flux = 'rappel_rendez_vous' then p_ouvert else rappel_rendez_vous end,
         relance_invitation = case when p_flux = 'relance_invitation' then p_ouvert else relance_invitation end,
         modifie_le = now(), modifie_par = auth.uid()
   where singleton;
  insert into public.supervision_operations (objet, action, auteur, details)
  values (null, 'envoi_automatique', auth.uid(),
          jsonb_build_object('flux', p_flux, 'ouvert', p_ouvert, 'precedent', v_precedent));
end;
$f$;
comment on function public.regler_envoi_automatique(text, boolean) is
  'Le superviseur permanent ouvre ou ferme un envoi automatique (P1-08) ; geste journalisé (supervision_operations, action « envoi_automatique »).';
revoke all on function public.regler_envoi_automatique(text, boolean) from public, anon, service_role;
grant execute on function public.regler_envoi_automatique(text, boolean) to authenticated;

  $sql$;
  alter table public.envois_automatiques_reglage drop column if exists relance_report_rdv;
  comment on table public.envois_automatiques_reglage is
    'Interrupteurs des envois automatiques suspendus (P1-08) : avis d''échéance, relance amiable, rappel de rendez-vous, relance d''invitation. Tous fermés par défaut. Écrit par regler_envoi_automatique seulement.';
end $rendre$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
