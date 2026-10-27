-- RELEVÉ des incidents ouverts par le gérant et rattachés à un bail alors que le lot en comptait plusieurs en cours
-- (audit de la PR #264, FL-01 ; migration 20261027100100_incident_gerant_bail_explicite.sql).
-- LECTURE SEULE : aucune instruction de ce fichier n'écrit en base. La migration ne corrige pas ces incidents : décider,
-- dossier par dossier, du bail concerné (ou d'aucun) reste un geste du gestionnaire.
--
-- Pourquoi : avant la migration, `ouvrir_incident_agence` rattachait l'incident au bail vivant le plus récent du lot et
-- enregistrait son locataire principal comme déclarant. En colocation à baux individuels, ce colocataire voit l'incident
-- comme le sien et peut en contester l'imputation, même s'il concerne la chambre d'un autre.
--
-- Seuls les incidents rattachés par l'ancienne règle sont relevés : ceux du canal « agence » qui portent un déclarant
-- (depuis la migration, le gérant n'en enregistre plus ; un bail qu'il a choisi n'est pas une erreur).
-- « Plusieurs baux en cours » est reconstitué à la date de déclaration : un autre bail du même lot, sorti du brouillon,
-- commencé ce jour-là au plus tard et sans fin (ou une fin postérieure). Approximation assumée : un bail resté en
-- brouillon puis supprimé n'apparaît pas ; une fin de bail saisie après coup peut ajouter un dossier de trop.
-- Le relevé ne contient que des identifiants, des dates et des états (ni nom, ni description, ni coordonnée).
--
-- Usage (mot de passe par PGPASSWORD, jamais dans la ligne de commande) :
--   psql "$URL" -v ON_ERROR_STOP=1 -f releve-incidents-gerant-colocation.sql

-- 1. Combien de dossiers, et combien ont déjà été contestés au nom du colocataire rattaché.
with candidats as (
  select i.id, i.organization_id, i.imputation_contestee_le
    from public.incidents i
    join public.baux b on b.id = i.bail_id
   where i.canal = 'agence' and i.declarant_person_id is not null
     and exists (select 1 from public.baux autre
                  where autre.lot_id = i.lot_id and autre.id <> i.bail_id
                    and autre.etat <> 'brouillon'
                    and autre.date_debut <= (i.created_at at time zone 'Europe/Paris')::date
                    and coalesce(autre.date_fin, 'infinity'::date) >= (i.created_at at time zone 'Europe/Paris')::date)
)
select count(*)                                            as incidents_a_verifier,
       count(*) filter (where imputation_contestee_le is not null) as deja_contestes,
       count(distinct organization_id)                     as organisations_concernees
  from candidats;

-- 2. La liste exacte : de quoi revoir chaque dossier avec le gestionnaire.
select i.id                     as incident_id,
       i.numero,
       i.organization_id,
       i.lot_id,
       i.created_at             as declare_le,
       i.etat,
       i.bail_id                as bail_rattache,
       b.chambre_id             as chambre_du_bail_rattache,
       i.imputation,
       i.imputation_contestee_le,
       (select count(*) from public.baux autre
         where autre.lot_id = i.lot_id and autre.id <> i.bail_id
           and autre.etat <> 'brouillon'
           and autre.date_debut <= (i.created_at at time zone 'Europe/Paris')::date
           and coalesce(autre.date_fin, 'infinity'::date) >= (i.created_at at time zone 'Europe/Paris')::date
       )                        as autres_baux_en_cours
  from public.incidents i
  join public.baux b on b.id = i.bail_id
 where i.canal = 'agence' and i.declarant_person_id is not null
   and exists (select 1 from public.baux autre
                where autre.lot_id = i.lot_id and autre.id <> i.bail_id
                  and autre.etat <> 'brouillon'
                  and autre.date_debut <= (i.created_at at time zone 'Europe/Paris')::date
                  and coalesce(autre.date_fin, 'infinity'::date) >= (i.created_at at time zone 'Europe/Paris')::date)
 order by i.organization_id, i.created_at;
