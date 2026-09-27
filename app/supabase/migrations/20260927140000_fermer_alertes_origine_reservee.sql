-- AUDIT SÉCURITÉ DU 27/09 — BLOQUANT : `fermer_alertes_origine` OUVERTE À TOUS.
--
-- La fonction (SECURITY DEFINER, 29/08) ferme les alertes d'une organisation
-- et d'un objet d'origine. Elle ne contrôlait NI l'appartenance NI le rôle :
-- un compte connecté d'une autre agence fermait les alertes d'Alpha, et un
-- locataire fermait l'alerte « incident à qualifier » de son propre incident
-- (le gestionnaire ne voyait plus qu'un incident attendait sa décision).
-- Appel direct possible depuis le navigateur : POST /rest/v1/rpc/...
--
-- LA CORRECTION. La fonction n'est appelée que par d'autres fonctions de la
-- base (restitution, rapport, cycle mensuel, retenues, baux…) qui portent
-- chacune leur propre garde. Elle n'a donc rien à faire dans l'API : le droit
-- d'exécution est retiré à `authenticated`.
--
-- Trois déclencheurs l'appelaient en SECURITY INVOKER (diagnostic archivé,
-- document remplacé, EDL signé) : ils s'exécutaient avec les droits de
-- l'utilisateur qui modifiait la ligne, et perdraient le droit d'appel. Ils
-- passent en SECURITY DEFINER — sans autre changement : ils ne ferment que
-- les alertes de la ligne que l'utilisateur vient légitimement d'écrire
-- (`new.organization_id`, `new.id`), sous la RLS de cette écriture.
--
-- Idempotent : ALTER FUNCTION et REVOKE se rejouent sans effet.

alter function public.diagnostic_archive_ferme_alertes() security definer;
alter function public.document_remplace_ferme_alertes() security definer;
alter function public.edl_signe_ferme_alertes() security definer;

-- Un déclencheur n'est pas appelable en RPC, mais on ferme la porte quand même.
revoke execute on function public.diagnostic_archive_ferme_alertes() from public, anon, authenticated;
revoke execute on function public.document_remplace_ferme_alertes() from public, anon, authenticated;
revoke execute on function public.edl_signe_ferme_alertes() from public, anon, authenticated;

revoke execute on function public.fermer_alertes_origine(uuid, text, uuid, text, text[])
  from public, anon, authenticated;
grant execute on function public.fermer_alertes_origine(uuid, text, uuid, text, text[])
  to service_role;

comment on function public.fermer_alertes_origine(uuid, text, uuid, text, text[]) is
  'Ferme les alertes liées à un objet d''origine. Réservée aux fonctions de la base '
  '(chacune porte sa garde) et au service : jamais exposée à authenticated (audit 27/09).';

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
