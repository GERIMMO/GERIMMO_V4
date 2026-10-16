-- Liste noire locale : jamais sans relation préalable (relecture du 15/10/2026 du lot « invitation-artisan », constat de
-- sécurité antérieur au lot).
--
-- Constat : `artisan_blacklist_locale(p_org, p_artisan, p_motif)` acceptait N'IMPORTE QUEL identifiant d'artisan et créait
-- la ligne `artisan_agences` manquante (`insert … on conflict do update`). Une organisation sans aucune relation avec
-- l'artisan se donnait ainsi une relation : `artisan_lisible` lui ouvrait ensuite la fiche de l'entreprise (nom, SIRET,
-- téléphone, e-mail, métiers, zone) et l'artisan apparaissait dans son carnet. L'appel servait aussi d'oracle : un
-- identifiant inexistant échouait (clé étrangère), un identifiant existant réussissait.
--
-- Correctif : avant tout, la fonction exige une relation préalable RÉELLE entre l'organisation et l'artisan : une ligne
-- du carnet (`artisan_agences`, quel que soit son statut), ou une sollicitation, une intervention ou un devis de cette
-- organisation avec cet artisan. Sinon, un refus NEUTRE, le même que l'artisan existe ou non. Rien d'autre ne change :
-- rôles admis, motif obligatoire, interventions en cours, devis et demandes qui tombent, droits.
-- Inventaire des fonctions voisines qui créent une ligne `artisan_agences` (aucune n'est modifiée) :
-- `artisan_creer_ou_rattacher` part d'un SIRET (profil public, créé par l'agence ou déjà rattaché) ;
-- `repondre_invitation_artisan` est le geste de l'artisan lui-même ; `artisan_statut_local` et
-- `artisan_lever_blacklist_locale` ne modifient qu'une ligne existante.
--
-- Modèle de rejeu à marques (20261013120000) : la définition en vigueur est RELUE (pg_get_functiondef) ; l'ancre, UNE
-- ligne (le décompte des interventions en cours), est précédée du bloc du correctif, qui porte la marque. Rejouée, la
-- migration trouve sa marque et ne fait rien ; si l'ancre manque ou se répète, elle s'arrête (dans la transaction de
-- `migrations.yml`, rien ne subsiste).
-- ATTENTION, retour de 20261014601000 : il rétablit `artisan_blacklist_locale` EN ENTIER (définition de la livraison 1 de
-- D18), ce qui effacerait aussi ce correctif. S'il doit être joué, jouer d'abord le retour de cette migration, puis
-- celui de 601000, puis rejouer cette migration (l'ancre est présente dans la définition de la livraison 1).
-- Retour arrière : app/supabase/retours-arriere/20261014843000_liste_noire_locale_relation_prealable.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration. Aucune ligne n'est touchée.

do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$  select count(*) into v_en_cours from public.incident_interventions i$ancre$;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (liste noire à l'aveugle) : une relation préalable réelle, voir 20261014843000.
  if not (exists (select 1 from public.artisan_agences aa where aa.organization_id = p_org and aa.artisan_id = p_artisan)
          or exists (select 1 from public.incident_sollicitations s where s.organization_id = p_org and s.artisan_id = p_artisan)
          or exists (select 1 from public.incident_interventions ir where ir.organization_id = p_org and ir.artisan_id = p_artisan)
          or exists (select 1 from public.incident_devis d where d.organization_id = p_org and d.artisan_id = p_artisan)) then
    raise exception 'Cet artisan n’est pas en relation avec votre organisation : il ne peut pas être mis sur votre liste noire';
  end if;
  select count(*) into v_en_cours from public.incident_interventions i$nouveau$;
begin
  select pg_get_functiondef('public.artisan_blacklist_locale(uuid,uuid,text)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (liste noire à l'aveugle)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014843000 : définition inattendue de artisan_blacklist_locale (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- Droits explicites, identiques à ceux en vigueur : les clients connectés (la fonction vérifie le rôle), jamais `anon`
-- ni PUBLIC.
revoke all on function public.artisan_blacklist_locale(uuid, uuid, text) from public, anon;
grant execute on function public.artisan_blacklist_locale(uuid, uuid, text) to authenticated;

select public.fermer_fonctions_a_anon();
