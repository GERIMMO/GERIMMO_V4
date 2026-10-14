-- Lot « artisan-externe », décision D25-B du dirigeant (14/10/2026), fiche ARC-08 :
-- un artisan dont l'inscription est REFUSÉE par la plateforme, ou qui figure sur la LISTE NOIRE
-- GLOBALE, ne peut plus écrire dans l'outil clients externes (client, chantier, devis, facture).
-- Il continue de lire ses dossiers et d'exporter son registre. Un artisan « en attente » garde
-- l'outil (adoption). Le module reste désactivé en production : rien n'est activé ici.
--
--   1. artisan_exclusion_plateforme() : dit pourquoi l'écriture est fermée pour le compte connecté
--      (NULL = ouverte ; 'refuse' ; 'liste_noire', qui l'emporte quand les deux se cumulent) ;
--   2. artisan_externe_ecrire : refuse toute écriture quand elle n'est pas NULL, avec le texte repris
--      par l'écran (src/lib/artisan-prive-exclusion.ts) ;
--   3. mon_activite_artisan_privee : la clé activation.exclusion le rend lisible à l'écran et à l'export.
--
-- Hors décision, donc NON modifiés : artisan_reglement_ecrire (déclarations de règlement), artisan_classer_piece
-- et le dépôt Storage (justificatifs). exiger_artisan_reel n'est pas touchée : d'autres parcours l'utilisent.
-- C'est réversible : lever le refus ou la liste noire rouvre l'écriture, sans autre geste.
-- Les deux fonctions existantes sont modifiées EN RELISANT leur définition en vigueur
-- (pg_get_functiondef), comme 20261013120000 et 20261014310000, et se rejouent sans effet.
-- Retour arrière : supabase/retours-arriere/20261014311000_artisan_exclusion_ecritures.retour.sql

create or replace function public.artisan_exclusion_plateforme()
returns text language sql stable security definer set search_path = '' as $$
  -- Même identité que artisan_module_actif : le compte connecté, jamais un emprunt de support.
  select case
           when a.blacklist_globale_le is not null then 'liste_noire'
           when a.statut_plateforme = 'refuse' then 'refuse'
         end
  from public.artisans a
  where a.account_id = (select auth.uid())
$$;
revoke all on function public.artisan_exclusion_plateforme() from public, anon;
grant execute on function public.artisan_exclusion_plateforme() to authenticated;

-- artisan_externe_ecrire : le refus, juste après le contrôle d'activation du module (avant même la
-- relecture d'une clé déjà jouée : un artisan exclu entre-temps ne rejoue rien).
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure) into v_def;
  if position('-- >> Audit du 14/10 (ARC-08)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$raise exception 'Clients externes : saisie désactivée'; end if;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif ARC-08 (écriture) : définition inattendue (le contrôle d''activation est absent ou répété)';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre || $nouveau$
 -- >> Audit du 14/10 (ARC-08) : refusé par la plateforme ou sur la liste noire globale, l'artisan lit et exporte
 -- encore mais n'écrit plus (client, chantier, devis, facture). « En attente » garde l'outil.
 if public.artisan_exclusion_plateforme() = 'liste_noire' then
  raise exception 'Votre compte a été retiré du réseau par Gerimmo : vous ne pouvez plus ajouter ni modifier de clients, de chantiers, de devis ni de factures dans cet outil. Vos dossiers, vos justificatifs et votre export restent consultables.';
 end if;
 if public.artisan_exclusion_plateforme() = 'refuse' then
  raise exception 'Votre inscription a été refusée par Gerimmo : vous ne pouvez plus ajouter ni modifier de clients, de chantiers, de devis ni de factures dans cet outil. Vos dossiers, vos justificatifs et votre export restent consultables.';
 end if;
 -- << Audit du 14/10 (ARC-08)$nouveau$);
  execute v_def;
end $correctif$;

-- mon_activite_artisan_privee : l'écran et l'export savent pourquoi la saisie est fermée.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.mon_activite_artisan_privee()'::regprocedure) into v_def;
  if position($marque$'exclusion',public.artisan_exclusion_plateforme()$marque$ in v_def) > 0 then return; end if;

  v_ancre := $ancre$'reglements',public.artisan_module_actif('reglements')$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif ARC-08 (lecture) : définition inattendue (la clé activation est absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre || $nouveau$,'exclusion',public.artisan_exclusion_plateforme()$nouveau$);
  execute v_def;
end $correctif$;

revoke all on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) from public, anon;
grant execute on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) to authenticated;
revoke all on function public.mon_activite_artisan_privee() from public, anon;
grant execute on function public.mon_activite_artisan_privee() to authenticated;

select public.fermer_fonctions_a_anon();
