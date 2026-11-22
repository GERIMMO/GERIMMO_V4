-- RETOUR ARRIÈRE de 20261122235800_artisan_relance_facture_rdv_manque.sql (audit palier 1, P2-04 : relance d'une
-- facture par l'artisan, rendez-vous manqué consigné).
--
-- 1. Supprime les trois déclencheurs et les onze fonctions de ce lot : plus aucune relance ni consignation possible.
-- 2. RIEN N'EST EFFACÉ : les colonnes `relancee_le` et `relances` des factures restent avec leurs valeurs, la table
--    `intervention_rdv_manques` reste, fermée, avec ce qui y a été consigné, et les événements « facture_relancee »
--    et « rdv_manque » restent à la chronologie des incidents.
-- 3. Les deux types d'événement ne sont retirés de la liste fermée que si aucun dossier ne les porte.
--
-- CE QUE CE RETOUR NE DÉFAIT PAS :
--   · une mission revenue à « acceptée » après un rendez-vous manqué le reste : son rendez-vous est à reprendre
--     (c'est l'état normal d'une mission qui attend des créneaux) ;
--   · les alertes « facture_artisan_relancee » et « rdv_manque » encore ouvertes le restent ; elles ne se ferment
--     plus d'elles-mêmes et se ferment à la main.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente, et AVANT tout retour d'une migration plus
-- ancienne qui touche la fonction du jour de Paris. Rejouable.
do $retour$
declare
  v_def text;
  v_nouvelle text;
  v_type text;
begin
  drop trigger if exists fermer_alerte_relance_reglement on public.intervention_facture_reglements;
  drop trigger if exists fermer_alerte_relance_refus on public.intervention_factures;
  drop trigger if exists fermer_alerte_rdv_manque on public.incident_interventions;
  drop function if exists public.fermer_alerte_relance_facture();
  drop function if exists public.fermer_alerte_rdv_manque();
  drop function if exists public.mes_relances_factures();
  drop function if exists public.relance_etat_facture(uuid);
  drop function if exists public.relancer_ma_facture(uuid);
  drop function if exists public.consigner_rdv_manque_artisan(uuid, text);
  drop function if exists public.consigner_rdv_manque(uuid, uuid, text, text);
  drop function if exists public.rdv_manque_consigner_interne(uuid, text, text, text);
  drop function if exists public.rdv_manques_de_ma_mission(uuid);
  drop function if exists public.mes_rdv_manques_artisan();
  drop function if exists public.mes_rdv_manques_locataire(uuid);

  foreach v_type in array array['rdv_manque', 'facture_relancee'] loop
    if exists (select 1 from public.incident_evenements where type = v_type) then
      raise notice 'Retour P2-04 : des dossiers portent l''événement « % », il reste dans la liste fermée', v_type;
    else
      select pg_get_constraintdef(c.oid) into v_def
        from pg_constraint c
       where c.conrelid = 'public.incident_evenements'::regclass and c.conname = 'incident_evenements_type_check';
      v_nouvelle := replace(v_def, ', ''' || v_type || '''::text', '');
      if v_def is not null and v_nouvelle <> v_def then
        alter table public.incident_evenements drop constraint incident_evenements_type_check;
        execute 'alter table public.incident_evenements add constraint incident_evenements_type_check ' || v_nouvelle;
      end if;
    end if;
  end loop;
  delete from supabase_migrations.schema_migrations where version = '20261122235800';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
