-- RETOUR ARRIÈRE de 20261122130000_lien_garant_admis.sql (audit palier 1, P1-01).
--
-- Rend aux deux chaînes leur tête d'avant : le type « confirmation_mobile_garant » n'est plus reconnu, le lien du
-- garant est de nouveau suspendu par la liste fermée (la signature électronique d'un bail avec garant redevient
-- impossible ; le dépôt du contrat signé sur papier reste disponible).
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Si le code du 22/11 reste en place, ses
-- envois de ce type sont simplement refusés (fermé par défaut), sans erreur de l'écran autre que « l'e-mail n'est pas
-- parti ».
--
-- Les e-mails de ce type encore en file ne peuvent plus être prouvés par l'ancienne chaîne : ils sont marqués « à
-- vérifier », sans reprise automatique, et leur contenu chiffré est effacé. Aucun lien déjà reçu n'est annulé.
-- Rejouable : sur un schéma déjà revenu, aucune action.
--
-- ORDRE : ce retour ne défait que le maillon de tête de la chaîne des e-mails. Tant qu'une migration plus récente
-- prolonge cette chaîne, il se refuse sans rien modifier : son retour à elle se joue d'abord.
do $retour$
begin
  -- Ce retour ne défait que le maillon de TÊTE. Si une migration plus récente a prolongé la chaîne, la tête ne délègue
  -- plus aux fonctions « …_avant_lien_garant » : la retirer ici déferait le maillon d'un autre. On refuse, sans rien
  -- modifier — les retours se jouent du plus récent au plus ancien.
  if (to_regprocedure('public.empreinte_avant_lien_garant(uuid,jsonb)') is not null
      and position('public.empreinte_avant_lien_garant(' in coalesce((select p.prosrc from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.empreinte_metier_courriel(uuid,jsonb)')), '')) = 0)
     or (to_regprocedure('public.finaliser_avant_lien_garant(text)') is not null
      and position('public.finaliser_avant_lien_garant(' in coalesce((select p.prosrc from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.finaliser_courriel_metier(text)')), '')) = 0) then
    raise exception 'Retour refusé : une migration plus récente prolonge la chaîne des e-mails au-dessus de ce maillon. Jouer d''abord son retour (ordre inverse du manifeste).';
  end if;
  if to_regprocedure('public.empreinte_avant_lien_garant(uuid,jsonb)') is not null then
    update public.courriels_durables
       set reprise_autonome = false, finalisation_etat = 'a_verifier', charge_chiffree = null,
           motif = 'Retour arrière du 22/11 : lien du garant à renvoyer depuis le dossier'
     where contexte_metier->>'type' = 'confirmation_mobile_garant'
       and finalisation_etat is distinct from 'terminee';
    drop function public.empreinte_metier_courriel(uuid, jsonb);
    alter function public.empreinte_avant_lien_garant(uuid, jsonb) rename to empreinte_metier_courriel;
    revoke all on function public.empreinte_metier_courriel(uuid, jsonb) from public, anon, authenticated;
    grant execute on function public.empreinte_metier_courriel(uuid, jsonb) to service_role;
  end if;
  if to_regprocedure('public.finaliser_avant_lien_garant(text)') is not null then
    drop function public.finaliser_courriel_metier(text);
    alter function public.finaliser_avant_lien_garant(text) rename to finaliser_courriel_metier;
    revoke all on function public.finaliser_courriel_metier(text) from public, anon, authenticated;
    grant execute on function public.finaliser_courriel_metier(text) to service_role;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261122130000';
end $retour$;
notify pgrst, 'reload schema';
