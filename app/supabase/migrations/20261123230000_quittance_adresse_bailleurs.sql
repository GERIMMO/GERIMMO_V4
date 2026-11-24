-- QUITTANCE DÉLIVRÉE CHEZ UN PROPRIÉTAIRE QUI GÈRE LUI-MÊME : L'ADRESSE DU BAILLEUR, COMME LE PDF (phase 3 de la mission
-- palier 1, lot 48, U07, relevé sur les documents générés et laissé ouvert par la reprise du lot 46).
--
-- LE DÉFAUT. Chez un propriétaire qui gère lui-même, le PDF d'une quittance (documents/modeles/quittance.ts, `expediteur`)
-- imprime en en-tête le nom ET l'adresse des détenteurs du lot. La quittance délivrée au locataire (page /quittance/[id],
-- « Mes documents », lien des e-mails de quittance), composée à partir de `quittance_document`, imprimait le nom des
-- bailleurs avec l'adresse du PROFIL DE L'ESPACE : deux adresses d'émetteur pour la même quittance (une SCI y paraissait à
-- l'adresse de l'espace). `quittance_document` ne rendait pas l'adresse des bailleurs, que le locataire ne lit pas ailleurs
-- (la RLS le tient à l'écart de `persons`).
--
-- MAINTENANT. Chez un propriétaire direct (`organizations.type = 'proprietaire_direct'`), chaque bailleur rendu par
-- `quittance_document` porte aussi `adresse`, `code_postal` et `ville` : l'adresse postale de sa fiche, rien d'autre (ni
-- e-mail, ni téléphone, ni date de naissance). C'est l'adresse que le contrat de bail désigne déjà au locataire (« domicile
-- ou siège social » du bailleur) et que le PDF de la quittance imprime. Dans un espace d'agence, l'objet du bailleur est
-- IDENTIQUE à avant (l'agence émet, à l'adresse de son profil). Les contrôles d'accès de la fonction ne changent pas.
--
-- EMPREINTE DES COURRIELS. `empreinte_metier_courriel` hache la sortie de `quittance_document` : un courriel de quittance d'un
-- propriétaire direct préparé AVANT cette migration et pas encore finalisé est revalidé (« à vérifier »), jamais envoyé sur
-- une empreinte périmée. Un espace d'agence n'est pas concerné.
--
-- COMMENT. La fonction est relue dans sa définition EN VIGUEUR (pg_get_functiondef), jamais recopiée à la main : la fin de la
-- liste des bailleurs (après le représentant d'une société, migration 20261119200200) reçoit l'adresse, après vérification
-- qu'elle s'y trouve exactement UNE fois. Déjà convertie (le fragment de ce lot une fois) : rien à faire, rejeu sans effet.
-- Toute autre forme arrête la migration, sans rien modifier. Les droits sont ceux en vigueur (`create or replace` les
-- conserve : comptes connectés et service, jamais anon) ; la fermeture à `anon` est rappelée en fin de fichier. Aucune ligne
-- n'est lue ni écrite.
--
-- Retour arrière : supabase/retours-arriere/20261123230000_quittance_adresse_bailleurs.retour.sql (à jouer AVANT le retour de
-- 20261119200200, qui relit la liste des bailleurs telle qu'il l'a laissée).

do $adresse_bailleurs$
declare
  c_signature constant text := 'public.quittance_document(uuid)';
  c_avant constant text := $sql$'{}'::jsonb)
        order by p.nom, p.prenom)$sql$;
  c_pose constant text := $sql$'{}'::jsonb)
        -- Phase 3, lot 48 (U07) : chez un propriétaire qui gère lui-même, l'adresse postale du bailleur (sa fiche), que le PDF
        -- de la quittance imprime en en-tête ; rien d'autre, et rien dans un espace d'agence (l'agence émet, à son adresse).
        || case when o.type = 'proprietaire_direct'
                then jsonb_build_object('adresse', p.address_line1, 'code_postal', p.postal_code, 'ville', p.city)
                else '{}'::jsonb end
        order by p.nom, p.prenom)$sql$;
  c_marque constant text := $sql$jsonb_build_object('adresse', p.address_line1$sql$;
  v_oid regprocedure;
  v_def text;
  v_avant integer;
  v_pose integer;
  v_marque integer;
begin
  v_oid := to_regprocedure(c_signature);
  if v_oid is null then
    raise exception 'Adresse des bailleurs : la fonction % est absente de cette base ; appliquez d''abord 20260927161000, rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_avant := (length(v_def) - length(replace(v_def, c_avant, ''))) / length(c_avant);
  v_pose := (length(v_def) - length(replace(v_def, c_pose, ''))) / length(c_pose);
  v_marque := (length(v_def) - length(replace(v_def, c_marque, ''))) / length(c_marque);
  if v_avant = 1 and v_marque = 0 then
    execute replace(v_def, c_avant, c_pose);
  elsif v_pose = 1 and v_marque = 1 then
    raise notice 'Adresse des bailleurs : % rend déjà l''adresse des bailleurs, rien à faire.', c_signature;
  else
    raise exception 'Adresse des bailleurs : % contient % fois la fin de liste attendue, % fois celle de ce lot et % fois une adresse de bailleur : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
      c_signature, v_avant, v_pose, v_marque;
  end if;
end $adresse_bailleurs$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
