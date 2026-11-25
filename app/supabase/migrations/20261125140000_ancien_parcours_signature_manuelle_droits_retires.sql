-- Décisions du 24/11, lot D5 (question Q21 du dirigeant) — l'ancien parcours « télécharger, signer, redéposer ».
--
-- Le dirigeant a décidé : « vérifie en lecture seule qu'aucune ancienne demande n'est en cours, puis retire l'écran et
-- son code. » Contrôle fait en production le 24/11 : la table demandes_signature est vide. L'écran du locataire, son
-- action de dépôt, l'action d'annulation et l'e-mail « Document à signer » sont retirés du code par ce lot.
--
-- RIEN N'EST SUPPRIMÉ EN BASE (règle de la mission) : la table, ses colonnes, ses règles d'accès, ses déclencheurs et
-- les fonctions restent en place. Cette migration retire seulement, au rôle des comptes connectés, le droit d'appeler
-- les TROIS fonctions qui ÉCRIVENT dans ce parcours et que plus aucun écran n'utilise :
--   · envoyer_pour_signature(uuid, uuid, uuid)       — créait une demande (déjà refusée depuis le 18/10 par le
--                                                       déclencheur signature_manuelle_fin_nouveaux_envois) ;
--   · retourner_document_signe(uuid, uuid, text, text, bigint, text) — le dépôt du document signé par le locataire ;
--   · annuler_demande_signature(uuid, uuid)          — l'annulation, qui SUPPRIME la ligne de la demande.
-- Les droits du rôle de service et du propriétaire ne changent pas. Aucun droit n'est ouvert, à personne.
--
-- Ce qui n'est PAS touché, volontairement :
--   · mes_demandes_signature(uuid) : lecture seule des demandes du locataire lui-même. Le code d'AVANT ce lot l'appelle
--     à chaque page de l'espace du locataire ; lui retirer son droit ferait apparaître un bandeau « lecture impossible »
--     si la migration était appliquée avant le code. Elle reste donc appelable ; son retrait ira au lot de nettoyage.
--   · demandes_signature_document(uuid, uuid) : la fiche d'un document, côté gestionnaire, y lit encore l'historique.
--   · les fonctions de l'ancien prestataire de signature (…_youtrust) : hors du périmètre de la décision Q21.
--
-- GARDE-FOU : la migration s'arrête, sans rien modifier, si une demande manuelle est encore en attente de signature
-- (le locataire ne pourrait plus la solder). Requête de contrôle, en lecture seule, à rejouer avant d'appliquer :
--   select count(*) from public.demandes_signature where signee_le is null;
--
-- Ordre : indifférent par rapport au code (l'ancien code n'appelle ces trois fonctions que sur une demande existante,
-- et il n'en existe aucune). Rejouable.
-- Retour arrière : supabase/retours-arriere/20261125140000_ancien_parcours_signature_manuelle_droits_retires.retour.sql
do $d5$
declare
  en_attente bigint;
begin
  perform set_config('lock_timeout', '10s', true);
  select count(*) into en_attente from public.demandes_signature
   where signee_le is null and prestataire = 'manuel';
  if en_attente > 0 then
    raise exception 'Migration arrêtée : % ancienne(s) demande(s) de signature manuelle encore en attente. Rien n''est modifié.', en_attente;
  end if;

  revoke execute on function public.envoyer_pour_signature(uuid, uuid, uuid) from authenticated;
  revoke execute on function public.retourner_document_signe(uuid, uuid, text, text, bigint, text) from authenticated;
  revoke execute on function public.annuler_demande_signature(uuid, uuid) from authenticated;
  -- Ceinture : ces fonctions n'ont jamais été ouvertes au visiteur ; on le redit sans rien changer.
  revoke execute on function public.envoyer_pour_signature(uuid, uuid, uuid) from public, anon;
  revoke execute on function public.retourner_document_signe(uuid, uuid, text, text, bigint, text) from public, anon;
  revoke execute on function public.annuler_demande_signature(uuid, uuid) from public, anon;
end $d5$;
