-- Démarrer, terminer ou facturer avant le rendez-vous confirmé : l'écart est écrit à la chronologie
-- (audit du 13 octobre 2026, ART-21, décision D20, option B).
--
-- Constat : demarrer_intervention n'accepte que les statuts « acceptée » et « planifiée » et ne compare
-- pas la date ; la mission passait « en cours » puis « terminée » cinq jours avant le rendez-vous confirmé,
-- la facture était déposée et le propriétaire recevait « facture déposée » alors que le locataire attendait
-- encore l'artisan. Rien dans le dossier ne le disait.
--
-- Correction, SANS BLOQUER (l'option C, qui bloquerait les arrivées anticipées légitimes et les urgences,
-- n'est pas retenue ; l'option D, la confirmation du locataire avant facturation, non plus) :
--   · quand le geste a lieu plus de 2 heures avant `debut_prevu` (le début du rendez-vous confirmé), l'événement
--     de la chronologie qu'il écrit déjà porte en plus l'écart : `avant_rendez_vous`, `debut_prevu`,
--     `ecart_minutes`. Trois événements existants : `intervention_demarree` (demarrer_intervention),
--     `compte_rendu` (deposer_compte_rendu), `facture_deposee` (deposer_facture_artisan). Aucun type
--     d'événement nouveau : la contrainte `incident_evenements_type_check` n'est pas touchée.
--   · sans rendez-vous confirmé (dépannage démarré avant qu'un créneau soit calé), ou une fois l'heure du
--     rendez-vous passée à 2 h près, rien n'est ajouté : l'événement reste exactement ce qu'il était.
--   · la règle (marge de 2 h) vit à un seul endroit : `public.ecart_rendez_vous(debut_prevu)`.
-- L'avertissement affiché à l'artisan avant le geste et la mention « rendez-vous prévu le … / terminé le … »
-- sur l'écran de validation de la facture sont dans l'application (aucune donnée nouvelle).
--
-- Aucune ligne existante n'est modifiée. Les trois fonctions sont modifiées EN RELISANT leur définition en
-- vigueur (pg_get_functiondef), comme 20261013120000 : une fonction réécrite à la main écraserait les gardes
-- injectées par les migrations suivantes. Si la définition en vigueur n'est pas celle attendue, la migration
-- s'arrête (dans la transaction du chantier `migrations.yml`, rien ne subsiste). Elle se rejoue sans effet :
-- chaque bloc cherche la marque de son propre correctif et, si elle y est, ne fait rien.
--
-- Retour arrière : app/supabase/retours-arriere/20261014301000_ecart_rendez_vous_chronologie.retour.sql

-- ART-21 (0/3) : la règle, en un seul endroit. Renvoie les clés à ajouter au détail de l'événement, ou un
-- objet vide. `now()` est l'instant de la transaction du geste.
create or replace function public.ecart_rendez_vous(p_debut_prevu timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when p_debut_prevu is null or now() >= p_debut_prevu - interval '2 hours' then '{}'::jsonb
    else jsonb_build_object(
      'avant_rendez_vous', true,
      'debut_prevu', p_debut_prevu,
      'ecart_minutes', floor(extract(epoch from (p_debut_prevu - now())) / 60)::integer)
  end
$$;

-- Utilisée seulement par les trois fonctions ci-dessous (qui s'exécutent avec les droits de leur propriétaire).
revoke all on function public.ecart_rendez_vous(timestamptz) from public, anon, authenticated;
grant execute on function public.ecart_rendez_vous(timestamptz) to service_role;

-- ART-21 (1/3) : le démarrage.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.demarrer_intervention(uuid)'::regprocedure) into v_def;
  if position('Audit du 13/10 (ART-21)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$jsonb_build_object('intervention_id', p_intervention));$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif ART-21 (demarrer_intervention) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$jsonb_build_object('intervention_id', p_intervention)
          -- Audit du 13/10 (ART-21) : un démarrage plus de 2 h avant le rendez-vous confirmé n'est pas
          -- bloqué ; l'écart s'écrit ici, à la chronologie de l'incident.
          || public.ecart_rendez_vous(v.debut_prevu));$nouveau$);
  execute v_def;
end $correctif$;

-- ART-21 (2/3) : le compte rendu (fin d'intervention).
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.deposer_compte_rendu(uuid,text,text,public.incident_imputation,bigint,boolean)'::regprocedure) into v_def;
  if position('Audit du 13/10 (ART-21)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$'montant_final_cents', p_montant_final_cents));$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif ART-21 (deposer_compte_rendu) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$'montant_final_cents', p_montant_final_cents)
                             -- Audit du 13/10 (ART-21) : un compte rendu déposé plus de 2 h avant le rendez-vous
                             -- confirmé n'est pas bloqué ; l'écart s'écrit ici, à la chronologie.
                             || public.ecart_rendez_vous(v.debut_prevu));$nouveau$);
  execute v_def;
end $correctif$;

-- ART-21 (3/3) : la facture.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.deposer_facture_artisan(uuid,text,bigint,text,text,text,bigint,text)'::regprocedure) into v_def;
  if position('Audit du 13/10 (ART-21)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$'montant_reference_cents', v_plafond));$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif ART-21 (deposer_facture_artisan) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$'montant_reference_cents', v_plafond)
                             -- Audit du 13/10 (ART-21) : une facture déposée plus de 2 h avant le rendez-vous
                             -- confirmé n'est pas bloquée ; l'écart s'écrit ici, à la chronologie.
                             || public.ecart_rendez_vous(v.debut_prevu));$nouveau$);
  execute v_def;
end $correctif$;

select public.fermer_fonctions_a_anon();
