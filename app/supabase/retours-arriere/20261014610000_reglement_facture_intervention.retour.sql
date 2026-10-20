-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014610000_reglement_facture_intervention.sql (lot « reglement-facture », décision D23-A, PRO2-21, CHN-02/X06)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Méthode : CHIRURGICALE, comme 20261014311000_artisan_exclusion_ecritures.retour.sql. La migration n'a fait qu'AJOUTER :
--   (a) un bloc entre « -- >> D23 (X06, CHN-02) » et « -- << D23 (X06, CHN-02) » dans valider_facture_artisan (ligne d'audit) ;
--   (b) un bloc entre « -- >> D23 (PRO2-21) » et « -- << D23 (PRO2-21) » dans ecriture_annulable_depuis_le_journal ;
--   (c) quatre fonctions nouvelles : enregistrer_reglement_facture, retirer_reglement_facture, mes_reglements_factures_artisan,
--       etat_facture_intervention ;
--   (d) la table intervention_facture_reglements, la colonne intervention_factures.reglee_le, la clé
--       intervention_factures_id_org_key et deux valeurs de la liste incident_evenements_type_check.
-- Ce script relit les définitions d'AUJOURD'HUI (pg_get_functiondef) et en retire exactement les blocs (a) et (b) : il
-- n'efface aucune modification apportée depuis par une autre migration, et aucune définition n'est écrite de mémoire.
-- Il supprime les quatre fonctions (c) après avoir vérifié qu'aucune autre fonction ne les appelle. Il se rejoue sans
-- effet. S'il trouve une marque sans bloc intact, il s'arrête sans rien modifier.
--
-- CE QU'IL NE DÉFAIT PAS, à dessein (fiche B.11 : « conserver la table ») :
--   · la table intervention_facture_reglements et ses lignes (règlements déclarés, retraits) : ce sont des traces ;
--   · les écritures de dépense et les contre-écritures nées des règlements : elles restent valides au journal. Sans le
--     bloc (b), une écriture de règlement redevient annulable depuis le journal par contre_ecriture (la ligne du règlement,
--     elle, n'en saura rien : à lire côte à côte si cela arrive) ;
--   · la colonne intervention_factures.reglee_le et ses valeurs (facultative, sans effet une fois les fonctions retirées) ;
--   · la clé intervention_factures_id_org_key (la table conservée la référence) ;
--   · les valeurs facture_reglee et reglement_retire de la liste des événements : tant qu'une ligne du fil les porte, la
--     contrainte ne peut pas les perdre (même situation que mission_annulee, voir LISEZ-MOI.md) ; elles sont inoffensives ;
--   · les lignes d'audit (facture_validee, reglement_facture_enregistre, reglement_facture_retire) déjà écrites ;
--   · le code de l'application : revenir au code d'avant la décision D23 AVANT de jouer ce script (l'écran de la facture et
--     « Ma facturation » de l'artisan appellent les fonctions supprimées : sans ce retour du code, ces écrans échouent).
--
-- RÉINTRODUIT les défauts corrigés : PRO2-21 (le règlement d'une facture d'artisan n'est plus un geste de l'application :
-- la facture ne passe plus à « réglée », l'artisan ne voit rien) et CHN-02/X06 (la validation d'une facture n'écrit plus au
-- journal d'audit).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014610000_reglement_facture_intervention.retour.sql

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.
-- Pré-contrôle en lecture seule, avant tout travail : si une AUTRE fonction appelle l'une des quatre fonctions du lot
-- (écrite après cette migration), la supprimer la casserait. On s'arrête, sans rien modifier.
do $retour_arriere$
declare v_autres text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_autres
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname not in ('enregistrer_reglement_facture', 'retirer_reglement_facture', 'mes_reglements_factures_artisan', 'etat_facture_intervention')
     and (p.prosrc like '%enregistrer_reglement_facture%' or p.prosrc like '%retirer_reglement_facture%'
          or p.prosrc like '%mes_reglements_factures_artisan%' or p.prosrc like '%etat_facture_intervention%');
  if v_autres is not null then
    raise exception 'RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : une fonction du lot D23 est appelée par % (écrit(e) après la migration). Voir LISEZ-MOI.md.', v_autres;
  end if;
end $retour_arriere$;


set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp) : retire d'une fonction le bloc compris entre deux marques, si et seulement si
-- chacune est présente exactement une fois et dans le bon ordre. Sans marque de début : rien à faire (rejeu).
create function pg_temp.retirer_bloc(p_signature text, p_debut text, p_fin text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_def text; p_d int; p_f int;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  p_d := position(p_debut in v_def);
  if p_d = 0 then
    return p_signature || ' : marque absente, rien à faire';
  end if;
  p_f := position(p_fin in v_def);
  if p_f = 0 or p_f < p_d
     or (length(v_def) - length(replace(v_def, p_debut, ''))) <> length(p_debut)
     or (length(v_def) - length(replace(v_def, p_fin, ''))) <> length(p_fin) then
    raise exception 'Retour arrière refusé, rien n''a été modifié : le bloc de % n''est plus intact (marques retouchées ou répétées). Le retirer à la main.', p_signature;
  end if;
  execute left(v_def, p_d - 1) || substr(v_def, p_f + length(p_fin));
  return p_signature || ' : bloc retiré';
end $retour_arriere$;

-- 1/4 (a) : la ligne d'audit de la validation, retirée de valider_facture_artisan (et d'elle seule).
select pg_temp.retirer_bloc('public.valider_facture_artisan(uuid,uuid,text)',
  '  -- >> D23 (X06, CHN-02)', E'-- << D23 (X06, CHN-02)\n');
revoke all on function public.valider_facture_artisan(uuid, uuid, text) from public, anon;
grant execute on function public.valider_facture_artisan(uuid, uuid, text) to authenticated;

-- 2/4 (b) : la branche « règlement de facture », retirée de ecriture_annulable_depuis_le_journal.
select pg_temp.retirer_bloc('public.ecriture_annulable_depuis_le_journal(uuid)',
  '    -- >> D23 (PRO2-21)', E'-- << D23 (PRO2-21)\n');
revoke all on function public.ecriture_annulable_depuis_le_journal(uuid) from public, anon;
grant execute on function public.ecriture_annulable_depuis_le_journal(uuid) to authenticated;

-- 3/4 (c) : les quatre fonctions du lot, SANS cascade (une dépendance inattendue arrête tout). L'ordre respecte leurs
-- appels : la lecture de l'artisan appelle la fonction d'état.
drop function if exists public.enregistrer_reglement_facture(uuid, uuid, bigint, date, text, text, uuid);
drop function if exists public.retirer_reglement_facture(uuid, uuid, text);
drop function if exists public.mes_reglements_factures_artisan();
drop function if exists public.etat_facture_intervention(uuid);

-- Information, pas une condition : ce que le retour laisse en place.
do $retour_arriere$
declare v_reglements bigint := 0; v_retires bigint := 0; v_reglees bigint := 0;
begin
  if to_regclass('public.intervention_facture_reglements') is not null then
    execute 'select count(*), count(*) filter (where retire_le is not null) from public.intervention_facture_reglements' into v_reglements, v_retires;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'intervention_factures' and column_name = 'reglee_le') then
    execute 'select count(*) from public.intervention_factures where reglee_le is not null' into v_reglees;
  end if;
  raise notice 'Conservés (fiche B.11) : table intervention_facture_reglements (% règlement(s), dont % retiré(s)), colonne intervention_factures.reglee_le (% facture(s) réglée(s)), leurs écritures et contre-écritures, les événements du fil et les lignes d''audit.', v_reglements, v_retires, v_reglees;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- 4/4 La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014610000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'valider_facture_artisan écrit l''audit (X06)' as objet,
       case when position('-- >> D23 (X06, CHN-02)' in pg_get_functiondef('public.valider_facture_artisan(uuid,uuid,text)'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end as etat
union all
select 'ecriture_annulable_depuis_le_journal connaît le règlement',
       case when position('-- >> D23 (PRO2-21)' in pg_get_functiondef('public.ecriture_annulable_depuis_le_journal(uuid)'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end
union all
select 'fonctions du règlement',
       case when to_regprocedure('public.enregistrer_reglement_facture(uuid,uuid,bigint,date,text,text,uuid)') is not null
                 or to_regprocedure('public.retirer_reglement_facture(uuid,uuid,text)') is not null
                 or to_regprocedure('public.mes_reglements_factures_artisan()') is not null
                 or to_regprocedure('public.etat_facture_intervention(uuid)') is not null
            then 'migrée (B)' else 'antérieure (A)' end
union all
select 'table intervention_facture_reglements (conservée à dessein)',
       case when to_regclass('public.intervention_facture_reglements') is not null then 'présente (conservée)' else 'absente' end;
$instructions_retour$;
end $retour_atomique$;
