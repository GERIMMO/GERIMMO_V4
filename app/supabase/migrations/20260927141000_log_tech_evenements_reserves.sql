-- AUDIT SÉCURITÉ DU 27/09 — MAJEUR : `log_tech` ÉCRIVAIT N'IMPORTE QUOI.
--
-- `log_tech(evenement, details)` est ouverte à tout compte connecté (les écrans
-- y consignent une erreur ou un changement de mot de passe). Elle n'avait ni
-- liste d'événements ni borne de taille : un locataire écrivait
-- `tache_quittances` ou `tache_sauvegarde`, et la page Santé, /api/sante, la
-- porte de santé et le point du matin — qui lisent `tech_log like 'tache_%'` —
-- prenaient ce faux bilan pour une vraie passe. Une sauvegarde en panne
-- pouvait ainsi être masquée. `details` sans limite remplissait la table.
--
-- LA CORRECTION.
--  · Un compte connecté (auth.uid() non nul) n'écrit que les événements que
--    l'application consigne en son nom : erreur d'écran, changement de mot de
--    passe, remise d'un compte rendu mensuel, traces d'envoi de notification.
--    Tout le reste — `tache_*`, `notification_rappel` (la clé « déjà envoyé »
--    des rappels, qu'un utilisateur pourrait poser pour étouffer un rappel),
--    `veille_*`, `cycle_mensuel`… — est réservé au service (client de service
--    des tâches planifiées, chantier GitHub de sauvegarde) et à pg_cron, qui
--    n'ont pas d'utilisateur.
--  · `remise_rapport_mensuel` sert de preuve d'envoi à l'orchestration : un
--    gestionnaire ne peut la poser que pour une organisation qu'il gère.
--  · Nom d'événement : minuscules, chiffres et soulignés, 80 caractères au plus.
--  · `details` : objet JSON de 4 000 octets au plus.
--
-- La sauvegarde GitHub écrit directement dans `tech_log` par l'API REST avec la
-- clé service_role (droit d'INSERT de la table, pas cette fonction) : ce chemin
-- est inchangé. Côté lecture, les écrans ne retiennent plus que les lignes
-- sans auteur (`account_id is null`) pour les passes de tâches.
--
-- Idempotent : CREATE OR REPLACE, même signature et mêmes droits.

create or replace function public.log_tech(evenement text, details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_details jsonb := coalesce(details, '{}'::jsonb);
begin
  if evenement is null or evenement !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise exception 'Événement de journal invalide' using errcode = '22023';
  end if;
  if jsonb_typeof(v_details) <> 'object' or octet_length(v_details::text) > 4000 then
    raise exception 'Détails de journal invalides ou trop volumineux (4 000 octets au plus)'
      using errcode = '22023';
  end if;

  if v_uid is not null then
    if evenement not in ('erreur_ecran', 'changement_mot_de_passe', 'remise_rapport_mensuel',
                         'notification_envoyee', 'notification_echec',
                         'notification_sans_adresse', 'notification_sans_service') then
      raise exception 'Événement réservé au service' using errcode = '42501';
    end if;
    if evenement = 'remise_rapport_mensuel' and not coalesce(
         (v_details->>'organization_id') ~ '^[0-9a-fA-F-]{36}$'
         and (v_details->>'organization_id')::uuid in (select public.org_ids_avec_roles(
               array['admin_agence','agent','proprietaire_direct']::public.membership_role[])),
         false) then
      raise exception 'Organisation hors de votre périmètre' using errcode = '42501';
    end if;
  end if;

  insert into public.tech_log (account_id, evenement, details)
  values (v_uid, evenement, v_details);
end $$;

revoke execute on function public.log_tech(text, jsonb) from public, anon;
grant execute on function public.log_tech(text, jsonb) to authenticated, service_role;

-- Les faux bilans déjà écrits par un compte connecté ne doivent plus rien
-- prouver : ils sont renommés (le journal n'est pas effacé, il est requalifié).
update public.tech_log
   set evenement = 'suspect_' || left(evenement, 72)
 where account_id is not null
   and (evenement like 'tache\_%' or evenement = 'notification_rappel');

comment on function public.log_tech(text, jsonb) is
  'Journal technique. Connecté : événements d''écran seulement (liste fermée). '
  'tache_* et notification_rappel : service et pg_cron seulement. details <= 4000 octets (audit 27/09).';

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
