import { lireEditeur } from "@/lib/editeur-serveur";
import Link from "next/link";
import { Article, CoquilleLegale, TableauPrestataires } from "@/components/coquille-legale";
import {
  CONDITIONS_ARTISANS_DATE,
  CONDITIONS_ARTISANS_VERSION,
  courrielDeContact,
  documentsIncomplets,
  sousTraitantsClient,
} from "@/lib/editeur";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Conditions de l'espace artisan — Gerimmo",
  description:
    "Les conditions d'utilisation de l'espace artisan de Gerimmo : inscription et validation, gratuité, classement, évaluations, devis, données et responsabilités.",
  chemin: "/conditions/artisans",
});

// Les conditions de l'espace artisan (plan de conformité du 23/10/2026, lot 3, constat R10).
//
// Jusqu'à la V1, les artisans acceptaient à l'inscription les conditions écrites pour les bailleurs (prix, essai,
// rétractation…), qui ne disaient rien de ce qui les concerne : validation, classement, évaluations, exclusion. Elles
// ont désormais leur propre texte, versionné et archivé à part (document « conditions_artisans »,
// CONDITIONS_ARTISANS_VERSION), publié le même jour que la V1 des conditions clients.
//
// Décisions du dirigeant du 23/10 : espace gratuit et sans commission ; communes et métiers choisis par l'artisan
// lui-même (en production depuis la PR #244) ; la note ne compte qu'à partir de trois évaluations. Le règlement (UE)
// 2019/1150 (« P2B ») s'applique probablement (paramètres de classement, motifs de restriction, préavis de fermeture) :
// son application et ses obligations sur les plaintes n'ont pas été vérifiées sur la source (non ouverte le
// 23/10/2026). Aucun juriste n'a relu ce texte.

export default async function PageConditionsArtisans() {
  const { editeur: EDITEUR, indisponible } = await lireEditeur();
  // La même liste figée que l'annexe 1 des conditions clients : lue depuis les constantes, jamais depuis la base.
  const prestataires = sousTraitantsClient();
  return (
    <CoquilleLegale
      titre="Conditions de l'espace artisan"
      chapo={
        CONDITIONS_ARTISANS_DATE
          ? `Version du ${CONDITIONS_ARTISANS_DATE}, en vigueur depuis cette date.`
          : "Version à venir."
      }
      chemin="/conditions/artisans"
      incomplet={indisponible || documentsIncomplets(EDITEUR) || !CONDITIONS_ARTISANS_VERSION}
      courriel={courrielDeContact(EDITEUR)}
      // Le texte contractuel est marqué de son document et de sa version : la garde du code l'empreinte, l'archive le
      // range tel que publié (lib/conditions-versions.ts). Comme pour les conditions clients (relecture adverse du
      // socle, I1) : l'identité affichée, ou null si sa lecture a échoué, est portée hors du texte par l'élément marqué.
      texteContractuel={
        CONDITIONS_ARTISANS_VERSION
          ? { document: "conditions_artisans", version: CONDITIONS_ARTISANS_VERSION, identite: indisponible ? null : EDITEUR }
          : undefined
      }
      apres={
        <nav aria-label="Autres conditions" className="space-y-1 text-sm text-[var(--texte-secondaire)]">
          <p>
            <Link href="/conditions/versions" className="lien-texte">
              Versions archivées des conditions
            </Link>
          </p>
          <p>
            <Link href="/conditions" className="lien-texte">
              Conditions générales d&apos;utilisation et de vente (propriétaires bailleurs)
            </Link>
          </p>
        </nav>
      }
    >
      <Article titre="A1. Objet">
        <p>
          Les présentes conditions régissent l&apos;utilisation de
          l&apos;espace artisan de Gerimmo par les entreprises du bâtiment et de
          l&apos;entretien (l&apos;<b className="font-semibold">Artisan</b>).
          Elles sont distinctes des conditions générales applicables aux
          propriétaires bailleurs. L&apos;Artisan agit à titre professionnel.
          L&apos;<b className="font-semibold">Éditeur</b> est
          l&apos;entrepreneur individuel identifié aux{" "}
          <Link href="/mentions-legales" className="lien-texte">
            mentions légales
          </Link>
          , qui édite et exploite Gerimmo.
        </p>
      </Article>

      <Article titre="A2. Prix">
        <p>
          L&apos;espace artisan est <b className="font-semibold">gratuit</b>.
          L&apos;Éditeur ne prélève{" "}
          <b className="font-semibold">aucune commission</b> sur les devis,
          travaux ou règlements.
        </p>
      </Article>

      <Article titre="A3. Inscription et validation">
        <p>
          L&apos;Artisan crée un compte, inscrit son entreprise (SIRET, métiers,
          zone d&apos;intervention, téléphone mobile) et dépose ses
          attestations. L&apos;Éditeur vérifie le SIRET et valide
          l&apos;inscription au vu d&apos;une attestation d&apos;assurance
          décennale et d&apos;une attestation de responsabilité civile
          professionnelle en cours. Aucun propriétaire ne peut solliciter
          l&apos;Artisan avant cette validation. Sans document déposé dans les
          six mois, l&apos;inscription est supprimée. L&apos;Artisan tient ses
          attestations à jour ; sans décennale valide, il n&apos;est pas proposé
          pour les travaux qui l&apos;exigent.
        </p>
      </Article>

      <Article titre="A4. Visibilité et sollicitations">
        <p>
          L&apos;Artisan choisit sa visibilité : privée par défaut, publique
          s&apos;il le décide. Il peut être sollicité par les propriétaires qui
          l&apos;ont invité, pour un bien situé dans sa zone
          d&apos;intervention. S&apos;il est public, il peut aussi l&apos;être
          par les propriétaires dont le bien se trouve dans une commune
          qu&apos;il a choisie, pour un métier qu&apos;il a déclaré.
        </p>
      </Article>

      <Article titre="A5. Classement">
        <p>
          Lorsque plusieurs artisans répondent à un besoin, ils sont présentés
          au propriétaire selon les paramètres suivants : (1) critères
          d&apos;éligibilité : métier demandé, zone couvrant le bien,
          inscription validée, absence d&apos;exclusion, décennale valide pour
          les travaux qui l&apos;exigent ; (2) note moyenne décroissante, prise
          en compte à partir de trois évaluations ; elle est calculée sur les
          évaluations des propriétaires pour deux tiers et des locataires pour
          un tiers, ou sur les seules évaluations disponibles quand une seule de
          ces deux catégories a évalué ; (3) viennent ensuite les artisans qui
          ont moins de trois évaluations ; (4) à égalité, l&apos;ordre
          alphabétique de la raison sociale.{" "}
          <b className="font-semibold">Aucune rémunération ne permet
          d&apos;influer sur ce classement.</b>
        </p>
      </Article>

      <Article titre="A6. Évaluations et contestation">
        <p>
          Après une intervention, le propriétaire et le locataire peuvent
          évaluer l&apos;Artisan. L&apos;Artisan voit sa note et ses indicateurs
          de fiabilité. Il peut contester une évaluation depuis son espace : un
          membre de l&apos;équipe de l&apos;Éditeur réexamine la contestation et
          peut retirer l&apos;évaluation, ce qui recalcule la note.
        </p>
      </Article>

      <Article titre="A7. Devis, interventions et factures">
        <p>
          L&apos;Artisan établit ses devis et factures sous sa seule
          responsabilité, conformément aux règles qui s&apos;imposent à lui. Le
          contrat de travaux est conclu directement entre l&apos;Artisan et le
          propriétaire : l&apos;Éditeur n&apos;y est pas partie,
          n&apos;encaisse aucune somme et ne garantit pas le paiement.
          L&apos;acceptation d&apos;un devis peut être recueillie par signature
          électronique (prestataire Zoho Sign). Une intervention ne peut être
          clôturée sans compte rendu accompagné d&apos;une photographie.
        </p>
      </Article>

      <Article titre="A8. Clients externes et règlements">
        <p>
          L&apos;Artisan peut tenir dans son espace un carnet de clients
          externes, de chantiers, de devis, de factures et de règlements. Les
          règlements y sont déclarés par l&apos;Artisan : le Service
          n&apos;effectue aucune opération bancaire et ne vérifie pas les
          encaissements. Ce registre n&apos;est ni une comptabilité ni un
          logiciel de facturation certifié ; il est exportable à tout moment.
          Pour les données de ses clients externes, l&apos;Artisan est
          responsable de traitement et l&apos;Éditeur sous-traitant :
          l&apos;annexe des présentes conditions s&apos;applique.
        </p>
      </Article>

      <Article titre="A9. Données personnelles">
        <p>
          Pour le compte de l&apos;Artisan, la validation, la note, les
          indicateurs et les exclusions, l&apos;Éditeur est responsable de
          traitement ; la{" "}
          <Link href="/confidentialite" className="lien-texte">
            page confidentialité
          </Link>{" "}
          décrit ces traitements et les droits de l&apos;Artisan, dont celui
          d&apos;obtenir un réexamen humain de sa note.
        </p>
      </Article>

      <Article titre="A10. Restriction, suspension, exclusion">
        <p>
          L&apos;Éditeur peut restreindre la visibilité de l&apos;Artisan,
          suspendre son compte ou l&apos;exclure du réseau pour un motif
          objectif : attestations manquantes ou expirées, informations
          inexactes, manquements graves ou répétés constatés lors
          d&apos;interventions, contenu illicite. Il en communique les motifs
          par courriel, au plus tard quand la mesure prend effet, en précisant
          les faits en cause ; l&apos;Artisan peut y répondre et demander un
          réexamen. Sauf manquements répétés, ou obligation légale ou
          réglementaire qui l&apos;en empêche, la fermeture définitive du compte
          est notifiée trente jours avant de prendre effet.
        </p>
      </Article>

      <Article titre="A11. Durée">
        <p>
          Les présentes conditions s&apos;appliquent tant que le compte existe.
          L&apos;Artisan peut demander la fermeture de son compte à tout moment,
          sous réserve des interventions en cours.
        </p>
      </Article>

      <Article titre="A12. Modification">
        <p>
          Toute modification est notifiée à l&apos;Artisan par courriel au moins
          quinze jours avant sa prise d&apos;effet ; l&apos;Artisan qui la
          refuse peut fermer son compte avant cette date. Chaque version est
          archivée et consultable.
        </p>
      </Article>

      <Article titre="A13. Responsabilité">
        <p>
          L&apos;Éditeur fournit l&apos;espace avec une obligation de moyens. Il
          ne répond ni de l&apos;exécution des travaux, ni des relations entre
          l&apos;Artisan et ses clients, ni des contenus déposés par
          l&apos;Artisan. Sauf faute lourde ou dolosive, sa responsabilité est
          limitée aux dommages directs.
        </p>
      </Article>

      <Article titre="A14. Réclamations et droit applicable">
        <p>
          Les réclamations s&apos;adressent à l&apos;adresse de contact des{" "}
          <Link href="/mentions-legales" className="lien-texte">
            mentions légales
          </Link>{" "}
          ou depuis « Aide et retours ». Les présentes conditions sont soumises
          au <b className="font-semibold">droit français</b>.
        </p>
      </Article>

      {/* Le texte de l'annexe 1 des conditions clients, « Client » remplacé par « Artisan », sauf deux paragraphes (plan
          du 23/10, lot 3) : l'objet, et la sortie en cas de nouveau sous-traitant (l'espace étant gratuit, l'Artisan
          ferme son compte au lieu d'être remboursé). Les renvois aux articles 5 et 9 des conditions clients, qui ne
          s'appliquent pas à l'Artisan, renvoient ici à la page confidentialité et à l'export de l'article A8. */}
      <Article titre="Annexe — Traitement de données pour le compte de l'Artisan (article 28 du RGPD)">
        <p>
          <b className="font-semibold">Objet, durée, nature et finalité.</b> Pour
          les données des clients externes que l&apos;Artisan enregistre dans
          son espace (article A8), l&apos;Artisan est responsable de traitement
          et l&apos;Éditeur sous-traitant. Le traitement a pour seule finalité
          la fourniture de l&apos;espace artisan. Il consiste à héberger,
          enregistrer, organiser, consulter, mettre en forme dans des
          documents, transmettre par courriel et sauvegarder ces données. Il
          dure tant que le compte de l&apos;Artisan existe, puis jusqu&apos;à
          la suppression prévue ci-dessous. Il porte sur l&apos;identité et les
          coordonnées des clients externes, les adresses de chantier, les
          devis, factures et règlements déclarés, et les messages.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <b className="font-semibold">Obligations et droits de
            l&apos;Artisan.</b> L&apos;Artisan détermine les finalités du
            traitement, s&apos;assure de sa licéité, informe les personnes
            concernées et répond à leurs demandes. Il peut à tout moment donner
            des instructions à l&apos;Éditeur, obtenir les informations prévues
            à la présente annexe et faire réaliser les audits prévus
            ci-dessous.
          </li>
          <li>
            <b className="font-semibold">Instructions documentées.</b>{" "}
            L&apos;Éditeur ne traite ces données que sur instruction documentée
            de l&apos;Artisan, constituée des présentes conditions et des
            réglages et actions de l&apos;Artisan dans son espace, y compris en
            ce qui concerne les transferts hors de l&apos;Union européenne, sauf
            obligation légale de l&apos;Union ou d&apos;un État membre ; dans ce
            cas, il en informe l&apos;Artisan avant le traitement, sauf si la
            loi l&apos;interdit. Il informe immédiatement l&apos;Artisan si une
            instruction lui paraît contraire à la réglementation.
          </li>
          <li>
            <b className="font-semibold">Confidentialité.</b> Les personnes
            autorisées à traiter ces données sont soumises à une obligation de
            confidentialité.
          </li>
          <li>
            <b className="font-semibold">Sécurité.</b> L&apos;Éditeur met en
            œuvre les mesures décrites dans la page confidentialité
            (chiffrement, cloisonnement des espaces, contrôle des accès,
            journalisation des consultations sensibles, sauvegardes chiffrées).
          </li>
          <li>
            <b className="font-semibold">Sous-traitants ultérieurs.</b>{" "}
            L&apos;Artisan donne une autorisation générale au recours aux
            prestataires de la liste ci-dessous, qui fait partie de la présente
            version. L&apos;Éditeur informe l&apos;Artisan par courriel, au moins
            un mois à l&apos;avance, de tout ajout ou remplacement envisagé ;
            l&apos;Artisan peut s&apos;y opposer par écrit avant cette date. Si
            l&apos;Éditeur maintient le changement, l&apos;Artisan peut fermer
            son compte avant sa prise d&apos;effet. L&apos;Éditeur impose à
            chaque prestataire, par contrat, des obligations de protection des
            données équivalentes à la présente annexe, et il demeure pleinement
            responsable envers l&apos;Artisan de leur exécution.
          </li>
        </ul>
        <TableauPrestataires prestataires={prestataires} />
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <b className="font-semibold">Transferts hors de l&apos;Union.</b>{" "}
            Lorsque des données sont transférées ou accessibles hors de
            l&apos;Union européenne (prestataires signalés dans la liste), le
            transfert est encadré par une décision d&apos;adéquation de la
            Commission européenne, notamment le cadre de protection des données
            UE–États-Unis pour un prestataire certifié, ou par les clauses
            contractuelles types de la Commission. L&apos;Artisan peut en
            obtenir une copie sur demande.
          </li>
          <li>
            <b className="font-semibold">Droits des personnes.</b>{" "}
            L&apos;Éditeur aide l&apos;Artisan, dans la mesure du possible, à
            répondre aux demandes d&apos;exercice de droits des personnes
            concernées, et lui transmet sans délai toute demande reçue
            directement.
          </li>
          <li>
            <b className="font-semibold">Assistance.</b> L&apos;Éditeur aide
            l&apos;Artisan à garantir la sécurité du traitement et, le cas
            échéant, à réaliser une analyse d&apos;impact et à consulter
            l&apos;autorité de contrôle, compte tenu des informations dont il
            dispose.
          </li>
          <li>
            <b className="font-semibold">Violation de données.</b>{" "}
            L&apos;Éditeur notifie à l&apos;Artisan toute violation de données à
            caractère personnel{" "}
            <b className="font-semibold">dans les meilleurs délais</b> après en
            avoir pris connaissance, avec les informations utiles à la
            notification que l&apos;Artisan doit, le cas échéant, adresser à la
            CNIL.
          </li>
          <li>
            <b className="font-semibold">Fin du traitement.</b> Lorsque
            l&apos;Artisan demande la suppression de son compte, ou à la fin du
            contrat, et au choix de l&apos;Artisan, l&apos;Éditeur restitue les
            données (export de l&apos;article A8) puis les supprime, ou les
            supprime directement, ainsi que les copies existantes, sauf
            obligation légale de conservation. Les copies de sauvegarde sont
            effacées au terme de leur cycle de conservation.
          </li>
          <li>
            <b className="font-semibold">Information et audit.</b>{" "}
            L&apos;Éditeur met à la disposition de l&apos;Artisan les
            informations nécessaires pour démontrer le respect de la présente
            annexe, et permet la réalisation d&apos;audits, y compris
            d&apos;inspections, par l&apos;Artisan ou un auditeur qu&apos;il
            mandate, soumis à la confidentialité, sur préavis raisonnable.
          </li>
        </ul>
      </Article>
    </CoquilleLegale>
  );
}
