-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014233000_photos_demande_devis_artisan.sql (D16, fiche ART-15)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- La migration ne fait que CRÉER deux fonctions (aucune table, aucune politique de stockage, aucun droit existant n'est modifié) :
-- le retour les supprime, sans cascade. Rien d'antérieur n'est à rétablir. Rejouable : `drop function if exists`.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014233000_photos_demande_devis_artisan.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (ART-15) : l'artisan ne voit plus les photos jointes par le locataire, ni à la demande de devis
-- ni sur la mission ; il chiffre de nouveau à l'aveugle. ATTENTION : l'application candidate appelle ces fonctions
-- (`mes_photos_incident_artisan`, au chargement de la demande de devis et de la mission) : sans elles, ces deux écrans affichent
-- « Les photos n'ont pas pu être chargées » jusqu'au retrait du code — à retirer AVEC la base.
--
-- NE DÉFAIT PAS : les lignes déjà écrites au journal d'accès aux pièces (`acces_pieces_log`, action « consultation »), qui restent
-- lisibles de l'administrateur de l'agence et de la supervision.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- La lecture d'abord (elle appelle la liste), puis la liste. SANS cascade : une dépendance inattendue arrête tout.
drop function if exists public.lire_photo_incident_artisan(uuid, uuid, uuid);
drop function if exists public.mes_photos_incident_artisan(uuid, uuid);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014233000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
