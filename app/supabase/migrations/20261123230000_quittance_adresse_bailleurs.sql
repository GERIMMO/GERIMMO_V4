-- QUITTANCE DÉLIVRÉE CHEZ UN PROPRIÉTAIRE QUI GÈRE LUI-MÊME : L'EN-TÊTE DES BAILLEURS (ADRESSE ET CONTACT), COMME LE PDF
-- (phase 3 de la mission palier 1, lot 48, U07, relevé sur les documents générés et laissé ouvert par la reprise du lot 46 ;
-- complété à la reprise du lot 48).
--
-- LE DÉFAUT. Chez un propriétaire qui gère lui-même, le PDF d'une quittance (documents/modeles/quittance.ts, `expediteur`)
-- imprime en en-tête le nom, l'adresse, l'adresse électronique et le téléphone des détenteurs du lot (à défaut d'adresse
-- électronique, celle de l'espace précédée de « Contact de gestion : »). La quittance délivrée au locataire (page
-- /quittance/[id], « Mes documents », lien des e-mails de quittance), composée à partir de `quittance_document`, imprimait le
-- nom des bailleurs avec l'adresse, l'adresse électronique et le téléphone du PROFIL DE L'ESPACE : deux en-têtes pour la même
-- quittance. `quittance_document` ne rendait aucune coordonnée des bailleurs, que le locataire ne lit pas ailleurs (la RLS le
-- tient à l'écart de `persons`). La première version de ce lot ne rendait que l'adresse postale : l'e-mail et le téléphone
-- restaient ceux de l'espace (reprise du lot 48).
--
-- MAINTENANT. Chez un propriétaire direct (`organizations.type = 'proprietaire_direct'`), chaque bailleur rendu par
-- `quittance_document` porte aussi `adresse`, `code_postal`, `ville`, `email` et `telephone` : les coordonnées de sa fiche que
-- le PDF de la même quittance imprime en en-tête, rien d'autre (ni date ou commune de naissance, ni identifiant). Dans un
-- espace d'agence, l'objet du bailleur est IDENTIQUE à avant (l'agence émet, avec ses propres coordonnées). Les contrôles
-- d'accès de la fonction ne changent pas.
--
-- CE QUI EST OUVERT, ET À QUI (reprise du lot 48 : la première version disait à tort qu'il s'agissait de « l'adresse que le
-- contrat de bail désigne déjà au locataire », ce qui n'est pas toujours vrai). Les bailleurs de `quittance_document` sont les
-- détenteurs ACTUELS du lot (détention sans date de fin), comme le nom déjà rendu et comme le PDF ; pas ceux de la date de la
-- quittance. La fonction (SECURITY DEFINER) rend ces coordonnées à quiconque peut lire la quittance : le gestionnaire de
-- l'espace, la tâche d'envoi, et le locataire principal ou un colocataire rattaché au bail, sans condition sur l'état ni sur
-- les dates du bail. Un ancien locataire, ou un colocataire encore rattaché, qui rouvre une ancienne quittance après une
-- cession dans l'espace lit donc les coordonnées d'un détenteur arrivé après son bail, que son contrat ne lui a pas
-- désigné. C'est un élargissement de lecture : il est soumis au dirigeant et au juriste (questions de la reprise du lot 48),
-- non justifié ici par le contrat, et non tranché. Le retour arrière ci-dessous le referme entièrement.
--
-- EFFETS POUR LE LOCATAIRE ET LES ENVOIS (reprise du lot 48 : non annoncés par la première version). La quittance délivrée
-- applique la même barrière que le PDF : un détenteur sans adresse postale laisse « domicile ou siège social » et « commune » à
-- renseigner (le PDF de la même quittance l'était déjà). Avant, l'adresse du profil de l'espace suffisait. Cela vaut AUSSI pour
-- les quittances déjà émises et déjà consultées : tant que la fiche du détenteur n'est pas complétée, le locataire ne peut
-- plus les ouvrir ni les télécharger (« en préparation »), l'envoi automatique les reporte (« reportées », motif « document
-- incomplet ») et l'envoi manuel est refusé avec la liste. L'adresse électronique, elle, ne bloque pas davantage : celle des
-- détenteurs, ou à défaut le contact de gestion de l'espace, suffit (avant : le seul contact de l'espace). Le téléphone est
-- facultatif. Requête de contrôle, à lancer avant la mise en ligne pour prévenir les espaces concernés (lecture seule) :
--   select o.id, o.name, count(distinct q.id) as quittances
--   from public.quittances q join public.baux b on b.id = q.bail_id join public.organizations o on o.id = q.organization_id
--   join public.detentions d on d.lot_id = b.lot_id and d.date_fin is null join public.persons p on p.id = d.person_id
--   where o.type = 'proprietaire_direct' and coalesce(btrim(p.address_line1), '') = ''
--   group by o.id, o.name order by quittances desc;
--
-- EMPREINTE DES COURRIELS. `empreinte_metier_courriel` hache la sortie de `quittance_document` : un courriel de quittance d'un
-- propriétaire direct préparé AVANT cette migration et pas encore finalisé est revalidé (« à vérifier »), jamais envoyé sur
-- une empreinte périmée. Un espace d'agence n'est pas concerné.
--
-- COMMENT. La fonction est relue dans sa définition EN VIGUEUR (pg_get_functiondef), jamais recopiée à la main : la fin de la
-- liste des bailleurs (après le représentant d'une société, migration 20261119200200) reçoit les coordonnées, après
-- vérification qu'elle s'y trouve exactement UNE fois. Une fonction convertie par la première version de ce lot (adresse
-- seule) est complétée de la même manière. Déjà convertie : rien à faire, rejeu sans effet. Toute autre forme arrête la
-- migration, sans rien modifier. Les droits sont ceux en vigueur (`create or replace` les conserve : comptes connectés et
-- service, jamais anon) ; la fermeture à `anon` est rappelée en fin de fichier. Aucune ligne n'est lue ni écrite.
--
-- Retour arrière : supabase/retours-arriere/20261123230000_quittance_adresse_bailleurs.retour.sql (à jouer AVANT le retour de
-- 20261119200200, qui relit la liste des bailleurs telle qu'il l'a laissée).

do $adresse_bailleurs$
declare
  c_signature constant text := 'public.quittance_document(uuid)';
  c_avant constant text := $sql$'{}'::jsonb)
        order by p.nom, p.prenom)$sql$;
  -- La première version de ce lot (adresse postale seule), complétée si elle est en place.
  c_premiere constant text := $sql$'{}'::jsonb)
        -- Phase 3, lot 48 (U07) : chez un propriétaire qui gère lui-même, l'adresse postale du bailleur (sa fiche), que le PDF
        -- de la quittance imprime en en-tête ; rien d'autre, et rien dans un espace d'agence (l'agence émet, à son adresse).
        || case when o.type = 'proprietaire_direct'
                then jsonb_build_object('adresse', p.address_line1, 'code_postal', p.postal_code, 'ville', p.city)
                else '{}'::jsonb end
        order by p.nom, p.prenom)$sql$;
  c_pose constant text := $sql$'{}'::jsonb)
        -- Phase 3, lot 48 (U07, et sa reprise) : chez un propriétaire qui gère lui-même, les coordonnées du bailleur (sa
        -- fiche) que le PDF de la quittance imprime en en-tête : adresse postale, adresse électronique, téléphone. Rien
        -- d'autre, et rien dans un espace d'agence (l'agence émet, avec ses propres coordonnées).
        || case when o.type = 'proprietaire_direct'
                then jsonb_build_object('adresse', p.address_line1, 'code_postal', p.postal_code, 'ville', p.city,
                                        'email', p.email, 'telephone', p.telephone)
                else '{}'::jsonb end
        order by p.nom, p.prenom)$sql$;
  c_marque constant text := $sql$jsonb_build_object('adresse', p.address_line1$sql$;
  v_oid regprocedure;
  v_def text;
  v_avant integer;
  v_premiere integer;
  v_pose integer;
  v_marque integer;
begin
  v_oid := to_regprocedure(c_signature);
  if v_oid is null then
    raise exception 'Adresse des bailleurs : la fonction % est absente de cette base ; appliquez d''abord 20260927161000, rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_avant := (length(v_def) - length(replace(v_def, c_avant, ''))) / length(c_avant);
  v_premiere := (length(v_def) - length(replace(v_def, c_premiere, ''))) / length(c_premiere);
  v_pose := (length(v_def) - length(replace(v_def, c_pose, ''))) / length(c_pose);
  v_marque := (length(v_def) - length(replace(v_def, c_marque, ''))) / length(c_marque);
  if v_avant = 1 and v_marque = 0 then
    execute replace(v_def, c_avant, c_pose);
  elsif v_premiere = 1 and v_pose = 0 and v_marque = 1 then
    execute replace(v_def, c_premiere, c_pose);
    raise notice 'Adresse des bailleurs : % rendait l''adresse seule (première version du lot) ; adresse électronique et téléphone ajoutés.', c_signature;
  elsif v_pose = 1 and v_marque = 1 then
    raise notice 'Adresse des bailleurs : % rend déjà les coordonnées des bailleurs, rien à faire.', c_signature;
  else
    raise exception 'Adresse des bailleurs : % contient % fois la fin de liste attendue, % fois celle de ce lot et % fois une adresse de bailleur : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
      c_signature, v_avant, v_pose, v_marque;
  end if;
end $adresse_bailleurs$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
