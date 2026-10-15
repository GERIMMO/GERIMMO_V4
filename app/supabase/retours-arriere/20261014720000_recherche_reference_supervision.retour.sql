-- RETOUR ARRIÈRE de 20261014720000_recherche_reference_supervision.sql (décision X18, fiche SA-09)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- La migration ne fait que CRÉER une fonction (aucune table, aucune politique, aucun droit existant n'est modifié) : le retour
-- la supprime, sans cascade. Rien d'antérieur n'est à rétablir. Rejouable : `drop function if exists`.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014720000_recherche_reference_supervision.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (SA-09) : la recherche de la console ne retrouve plus ni un bien, ni un lot, ni un incident par
-- sa référence. ATTENTION : l'application candidate appelle cette fonction à chaque recherche de la console
-- (`rechercherDansSupervision`) ; sans elle, la fenêtre de recherche affiche « Certains résultats sont momentanément
-- indisponibles » (les organisations, artisans et comptes restent trouvés) jusqu'au retrait du code — à retirer AVEC la base.
--
-- NE DÉFAIT PAS : les lignes déjà écrites au journal d'audit (`audit_log`, action `recherche_reference`), qui restent lisibles
-- de la supervision, comme toute trace.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- Ne supprime que la fonction de cette décision : une fonction du même nom sans sa marque n'est pas la nôtre.
-- (Deux tests imbriqués : la conversion en regprocedure échouerait sur une fonction déjà supprimée, au rejeu.)
do $retour_arriere$
declare v_fonction regprocedure := to_regprocedure('public.rechercher_reference_supervision(text)');
begin
  if v_fonction is not null then
    if position('Décision X18 du 14/10 (SA-09)' in pg_get_functiondef(v_fonction)) = 0 then
      raise exception 'Retour X18 refusé : rechercher_reference_supervision(text) ne porte pas la marque de la décision X18';
    end if;
  end if;
end $retour_arriere$;

-- SANS cascade : une dépendance inattendue arrête tout.
drop function if exists public.rechercher_reference_supervision(text);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014720000';
  end if;
end $retour_arriere$;

commit;
