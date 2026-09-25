import { Article, CoquilleLegale, OuNousEcrire, TableauPrestataires } from "@/components/coquille-legale";
import { documentsIncomplets, prestatairesIncomplets } from "@/lib/editeur";

export const metadata = { title: "Confidentialité — Gerimmo" };

// Information de confidentialité. Elle portait son propre en-tête avant le
// 11/09, comme les deux autres pages légales — chacune le sien, tous
// différents. Les trois partagent désormais la même coquille.
//
// Jusqu'au 20/09, la page renvoyait à « la politique complète » qui n'existait
// nulle part. Elle dit désormais ce que le produit fait RÉELLEMENT, vérifié
// dans le code et la base : les sous-traitants sont ceux du déploiement, les
// durées sont celles de la table `retention_rules` (matrice A2 du
// référentiel), les mesures de sécurité celles qui sont en place. Ce que le
// produit ne fait pas — publicité, revente, lecture de comptes bancaires —
// est dit aussi. Une relecture par un conseil reste prévue avant que
// l'encadré « en cours de finalisation » ne disparaisse.
export default function PageConfidentialite() {
  return (
    <CoquilleLegale
      titre="Confidentialité"
      chapo="Ce que nous faisons de vos données, et ce que nous n'en faisons pas."
      chemin="/confidentialite"
      incomplet={documentsIncomplets() || prestatairesIncomplets()}
    >
      <Article titre="Qui est responsable de quoi">
        <p>
          Gerimmo est un logiciel de gérance immobilière. Deux situations se
          présentent, et elles n&apos;engagent pas les mêmes personnes.
        </p>
        <p>
          <b className="font-semibold">Les données de votre dossier de gestion
          locative</b> — bail, pièces, loyers, quittances, incidents, messages —
          sont traitées <b className="font-semibold">pour le compte de votre
          agence ou de votre propriétaire bailleur</b>, qui en est responsable
          de traitement. Gerimmo n&apos;en est que le sous-traitant : il les
          héberge et les met en forme, il n&apos;en décide pas l&apos;usage.
          Pour exercer vos droits sur ces données, c&apos;est à votre agence ou
          à votre propriétaire qu&apos;il faut vous adresser.
        </p>
        <p>
          <b className="font-semibold">Les données de plateforme</b> — votre
          compte et son authentification, la facturation des abonnements,
          l&apos;annuaire des artisans et leurs évaluations, les demandes de
          devis et les retours envoyés depuis le site — sont traitées{" "}
          <b className="font-semibold">par Gerimmo, en tant que responsable de
          traitement</b>. Pour celles-là, écrivez-nous directement.
        </p>
      </Article>

      <Article titre="Les données traitées">
        <p>
          <b className="font-semibold">Votre compte.</b> Adresse électronique,
          mot de passe (conservé sous forme hachée, jamais en clair), second
          facteur d&apos;authentification si vous l&apos;avez activé, version
          des conditions acceptées et date de leur acceptation, historique de
          connexion.
        </p>
        <p>
          <b className="font-semibold">Votre dossier de gestion locative</b>, si
          vous êtes locataire, propriétaire ou garant : identité et coordonnées,
          pièces du dossier (identité, revenus, imposition, attestations
          d&apos;assurance), bail et états des lieux, loyers appelés et réglés,
          quittances, incidents déclarés et leurs photos, échanges avec le
          gestionnaire.
        </p>
        <p>
          <b className="font-semibold">Votre fiche d&apos;artisan</b>, si vous
          intervenez pour des agences : raison sociale, SIRET, métiers et zones
          d&apos;intervention, justificatifs déposés, comptes rendus
          d&apos;intervention, évaluations laissées par les agences. Une note
          contestée est réexaminée par une personne, jamais par un calcul seul.
        </p>
        <p>
          <b className="font-semibold">La facturation.</b> Les abonnements sont
          encaissés par Stripe : Gerimmo ne voit ni ne conserve votre numéro de
          carte, seulement l&apos;état de l&apos;abonnement et l&apos;issue des
          prélèvements.
        </p>
        <p>
          <b className="font-semibold">Le formulaire de demande de devis.</b>{" "}
          Les informations transmises (nom, adresse électronique, agence,
          téléphone, taille du portefeuille, message) servent uniquement à vous
          recontacter au sujet de votre demande. Elles sont supprimées au plus
          tard 24 mois après leur dépôt.
        </p>
        <p>
          <b className="font-semibold">Ce que Gerimmo ne fait pas.</b> Il ne lit
          aucun compte bancaire, ne revend aucune donnée, n&apos;affiche aucune
          publicité et n&apos;installe aucun traceur de mesure d&apos;audience.
          Les seuls cookies sont ceux qui tiennent votre session ouverte.
        </p>
      </Article>

      <Article titre="Où vos données sont hébergées, et qui y accède">
        <p>
          Vos données sont hébergées <b className="font-semibold">dans
          l&apos;Union européenne</b> (base, fichiers, application). Certains
          services annexes sont rendus par des prestataires établis hors de
          l&apos;Union : la colonne « Localisation » le dit pour chacun, et la
          colonne « Rôle » précise ce qui lui est transmis, et seulement cela.
        </p>
        {/* La même liste que les mentions légales (lib/editeur.ts). */}
        <TableauPrestataires />
        <p>
          Au sein de Gerimmo, seule la supervision technique peut accéder aux
          données en dehors de votre organisation ; cet accès exige un second
          facteur d&apos;authentification et chaque traversée est journalisée
          trois ans. Chaque organisation est cloisonnée des autres au niveau de
          la base elle-même.
        </p>
      </Article>

      <Article titre="Combien de temps">
        <p>
          Chaque durée découle d&apos;une finalité écrite ; au terme, la donnée
          est supprimée, ou anonymisée quand une obligation comptable impose de
          garder l&apos;écriture sans la personne. Les principales :
        </p>
        <div className="tableau-defilant">
          <table className="tableau">
            <thead>
              <tr>
                <th>Données</th>
                <th>Durée</th>
                <th>À partir de</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pièces du dossier locataire (identité, revenus, imposition)</td>
                <td>5 ans, puis suppression</td>
                <td>Fin du dernier bail</td>
              </tr>
              <tr>
                <td>Baux, états des lieux, mandats de gestion</td>
                <td>5 ans, puis anonymisation</td>
                <td>Fin du contrat</td>
              </tr>
              <tr>
                <td>Quittances et rapports de gestion</td>
                <td>10 ans, puis anonymisation</td>
                <td>Émission</td>
              </tr>
              <tr>
                <td>Photos d&apos;incident</td>
                <td>2 ans, puis suppression</td>
                <td>Clôture de l&apos;incident</td>
              </tr>
              <tr>
                <td>Alertes traitées</td>
                <td>1 an, puis suppression</td>
                <td>Fermeture de l&apos;alerte</td>
              </tr>
              <tr>
                <td>Journal des consultations de pièces</td>
                <td>1 an</td>
                <td>Consultation</td>
              </tr>
              <tr>
                <td>Journal d&apos;audit (actions sensibles)</td>
                <td>3 ans</td>
                <td>Action</td>
              </tr>
              <tr>
                <td>Journal technique (connexions, erreurs)</td>
                <td>6 mois</td>
                <td>Événement</td>
              </tr>
              <tr>
                <td>Demandes de devis reçues depuis le site</td>
                <td>24 mois, puis suppression</td>
                <td>Dépôt</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Les cinq ans correspondent à la prescription des actions nées du bail
          d&apos;habitation ; les dix ans à l&apos;obligation de conservation
          comptable. Un contentieux en cours suspend le compte à rebours
          jusqu&apos;à sa clôture. Votre compte est conservé tant qu&apos;il est
          ouvert.
        </p>
      </Article>

      <Article titre="Comment vos données sont protégées">
        <ul className="list-disc space-y-1 pl-5">
          <li>Chiffrement en transit et au repos, base, fichiers et sauvegardes compris.</li>
          <li>
            Cloisonnement par organisation appliqué dans la base de données
            elle-même : une agence ne peut pas lire les données d&apos;une autre,
            même par erreur de programme.
          </li>
          <li>
            Mot de passe de douze caractères au moins, vérifié contre les fuites
            de données connues ; second facteur disponible pour tous, obligatoire
            pour la supervision.
          </li>
          <li>
            Aucun fichier n&apos;est accessible par une adresse publique : chaque
            consultation passe par l&apos;application, sous contrôle des droits,
            et toute consultation d&apos;une pièce sensible est tracée.
          </li>
        </ul>
        <p>
          En cas de violation de données susceptible de vous concerner, Gerimmo
          en informe l&apos;organisation responsable sans délai et, lorsque la
          loi l&apos;exige, la CNIL sous 72 heures et les personnes concernées.
        </p>
      </Article>

      <Article titre="Vos droits">
        <p>
          Vous pouvez demander l&apos;<b className="font-semibold">accès</b> à vos
          données, leur <b className="font-semibold">rectification</b>, leur{" "}
          <b className="font-semibold">effacement</b>, la{" "}
          <b className="font-semibold">limitation</b> de leur traitement, vous{" "}
          <b className="font-semibold">opposer</b> à un traitement, et obtenir
          celles que vous avez fournies dans un format lisible par une machine
          (<b className="font-semibold">portabilité</b>).
        </p>
        <p>
          L&apos;effacement connaît des limites que la loi impose : un bail en
          cours, un impayé non soldé, un contentieux ou une écriture comptable
          empêchent de supprimer immédiatement ; la donnée est alors gelée, puis
          anonymisée au terme. Les pièces de votre dossier, elles, peuvent être
          retirées sur demande même avant ce terme.
        </p>
        <p>
          <b className="font-semibold">À qui écrire.</b> Pour votre dossier de
          gestion locative, à votre agence ou à votre propriétaire bailleur,
          depuis la messagerie de votre espace. Pour votre compte, la
          facturation, l&apos;annuaire des artisans ou une demande envoyée
          depuis le site, à Gerimmo, <OuNousEcrire objet="données personnelles" />.
          Chaque demande reçoit une réponse dans le mois, après vérification de
          l&apos;identité du demandeur.
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez
          saisir la Commission nationale de l&apos;informatique et des libertés
          (CNIL), 3 place de Fontenoy, 75007 Paris —{" "}
          <a href="https://www.cnil.fr" className="lien-texte" rel="noreferrer">
            www.cnil.fr
          </a>
          .
        </p>
      </Article>
    </CoquilleLegale>
  );
}
