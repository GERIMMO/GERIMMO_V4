-- RETOUR ARRIÈRE de 20261122200000_envois_automatiques_reglage.sql (audit palier 1, P1-08).
--
-- Rend aux deux chaînes leur tête d'avant : les quatre contextes « avis_echeance », « relance_loyer »,
-- « rappel_rendez_vous » et « relance_invitation » ne sont plus reconnus. Les quatre envois automatiques redeviennent
-- suspendus par la liste fermée, comme avant cette migration, quel que soit l'état des interrupteurs.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Si le code du 22/11 reste en place, il lit
-- les interrupteurs par une fonction qui n'existe plus : il les tient pour fermés et rien ne part.
--
-- RIEN N'EST EFFACÉ des traces métier : appels marqués envoyés, relances consignées, rappels marqués et relances
-- d'invitation notées restent tels quels ; le journal des gestes du superviseur aussi. Les e-mails de ces types encore
-- en file ne peuvent plus être prouvés par l'ancienne chaîne : ils sont marqués « à vérifier », sans reprise
-- automatique, et leur contenu chiffré est effacé. La table des interrupteurs et ses quatre fonctions sont retirées.
-- Rejouable : sur un schéma déjà revenu, aucune action.
--
-- ORDRE : ce retour ne défait que le maillon de tête de la chaîne des e-mails. Tant qu'une migration plus récente
-- prolonge cette chaîne, il se refuse sans rien modifier : son retour à elle se joue d'abord.
do $retour$
begin
  -- Ce retour ne défait que le maillon de TÊTE. Si une migration plus récente a prolongé la chaîne, la tête ne délègue
  -- plus aux fonctions « …_avant_envois_automatiques » : la retirer ici déferait le maillon d'un autre. On refuse, sans rien
  -- modifier — les retours se jouent du plus récent au plus ancien.
  if (to_regprocedure('public.empreinte_avant_envois_automatiques(uuid,jsonb)') is not null
      and position('public.empreinte_avant_envois_automatiques(' in coalesce((select p.prosrc from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.empreinte_metier_courriel(uuid,jsonb)')), '')) = 0)
     or (to_regprocedure('public.finaliser_avant_envois_automatiques(text)') is not null
      and position('public.finaliser_avant_envois_automatiques(' in coalesce((select p.prosrc from pg_catalog.pg_proc p
            where p.oid = to_regprocedure('public.finaliser_courriel_metier(text)')), '')) = 0) then
    raise exception 'Retour refusé : une migration plus récente prolonge la chaîne des e-mails au-dessus de ce maillon. Jouer d''abord son retour (ordre inverse du manifeste).';
  end if;
  if to_regprocedure('public.empreinte_avant_envois_automatiques(uuid,jsonb)') is not null then
    update public.courriels_durables
       set reprise_autonome = false, finalisation_etat = 'a_verifier', charge_chiffree = null,
           motif = 'Retour arrière du 22/11 : envoi automatique refermé'
     where contexte_metier->>'type' in ('avis_echeance', 'relance_loyer', 'rappel_rendez_vous', 'relance_invitation')
       and finalisation_etat is distinct from 'terminee';
    drop function public.empreinte_metier_courriel(uuid, jsonb);
    alter function public.empreinte_avant_envois_automatiques(uuid, jsonb) rename to empreinte_metier_courriel;
    revoke all on function public.empreinte_metier_courriel(uuid, jsonb) from public, anon, authenticated;
    grant execute on function public.empreinte_metier_courriel(uuid, jsonb) to service_role;
  end if;
  if to_regprocedure('public.finaliser_avant_envois_automatiques(text)') is not null then
    drop function public.finaliser_courriel_metier(text);
    alter function public.finaliser_avant_envois_automatiques(text) rename to finaliser_courriel_metier;
    revoke all on function public.finaliser_courriel_metier(text) from public, anon, authenticated;
    grant execute on function public.finaliser_courriel_metier(text) to service_role;
  end if;
  drop function if exists public.regler_envoi_automatique(text, boolean);
  drop function if exists public.lire_envois_automatiques();
  drop function if exists public.envois_automatiques_proposes();
  drop function if exists public.envoi_automatique_ouvert(text);
  drop table if exists public.envois_automatiques_reglage;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261122200000';
  end if;
end $retour$;
notify pgrst, 'reload schema';
