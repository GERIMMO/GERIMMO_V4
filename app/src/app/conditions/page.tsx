import Link from "next/link";
import { Article, CoquilleLegale, AFournir, Fait } from "@/components/coquille-legale";
import { CONDITIONS_DATE, CONDITIONS_VERSION, EDITEUR } from "@/lib/editeur";

export const metadata = { title: "Conditions générales — Gerimmo" };

// Le contrat que la case d'inscription fait accepter.
//
// Jusqu'au 11/09, cette case faisait cocher « j'accepte les conditions
// d'utilisation » et l'action serveur refusait l'inscription sans elle — pour
// un document qui n'existait nulle part. On faisait signer un contrat
// introuvable.
//
// Le texte n'engage QUE ce que le produit fait réellement, vérifié dans le
// code : les trois exports promis par le projet de 2025 n'existaient pas, la
// suspension « en lecture seule » non plus. L'article 9 le dit.
export default function PageConditions() {
  return (
    <CoquilleLegale
      titre="Conditions générales d'utilisation"
      chapo={`Version ${CONDITIONS_VERSION} — en vigueur depuis le ${CONDITIONS_DATE}.`}
    >
      <Article titre="1. Objet">
        <p>
          Les présentes conditions régissent l&apos;accès au service Gerimmo et
          son utilisation. Gerimmo est un{" "}
          <b className="font-semibold">logiciel de gérance immobilière en
          ligne</b> : il tient le référentiel d&apos;un parc (biens, lots, baux,
          personnes, mandats), produit les documents de la location, suit les
          loyers et les incidents, et ouvre à chaque partie prenante un espace
          propre.
        </p>
        <p>
          Elles forment, avec la{" "}
          <Link href="/confidentialite" className="lien-discret">
            page confidentialité
          </Link>{" "}
          et les{" "}
          <Link href="/mentions-legales" className="lien-discret">
            mentions légales
          </Link>
          , l&apos;accord entre le Client et l&apos;Éditeur.
        </p>
      </Article>

      <Article titre="2. Définitions">
        <p>
          <b className="font-semibold">Éditeur</b> : la société identifiée aux{" "}
          <Link href="/mentions-legales" className="lien-discret">
            mentions légales
          </Link>
          .
        </p>
        <p>
          <b className="font-semibold">Service</b> : l&apos;application
          Gerimmo, ses espaces, ses documents générés et ses exports.
        </p>
        <p>
          <b className="font-semibold">Client</b> : la personne physique ou
          morale qui ouvre un compte et souscrit au Service — agence de gestion,
          ou propriétaire bailleur gérant son propre parc. C&apos;est le Client
          qui accepte les présentes conditions.
        </p>
        <p>
          <b className="font-semibold">Organisation</b> : l&apos;espace de
          travail du Client. Chaque organisation est{" "}
          <b className="font-semibold">étanche</b> : aucune donnée n&apos;y est
          visible depuis une autre.
        </p>
        <p>
          <b className="font-semibold">Locataire, propriétaire mandant</b> :
          les personnes auxquelles le Client ouvre un espace de consultation.{" "}
          <b className="font-semibold">Elles ne sont pas Clientes</b> : elles ne
          souscrivent rien, ne paient rien, et leur accès dépend du Client.
          L&apos;article 7 leur est consacré.
        </p>
      </Article>

      <Article titre="3. Acceptation et formation du contrat">
        <p>
          Le contrat se forme lorsque le Client coche la case
          d&apos;acceptation et valide son inscription. La case n&apos;est pas
          pré-cochée et l&apos;inscription est refusée sans elle.
        </p>
        <p>
          La <b className="font-semibold">version acceptée</b> et sa date sont
          conservées avec le compte : c&apos;est le texte de cette version-là
          qui lie les parties, même si les présentes conditions évoluent
          ensuite (article 16).
        </p>
      </Article>

      <Article titre="4. Nature du Service : un journal de gestion">
        <p>
          <b className="font-semibold">4.1 — Ce que le Service fait.</b> Le
          Service tient un <b className="font-semibold">journal de gestion</b> :
          il suit les loyers appelés et les dépenses déclarées, calcule les
          honoraires selon les mandats paramétrés, produit les rapports de
          gestion destinés aux propriétaires et prépare les récapitulatifs
          fiscaux. L&apos;export des écritures est décrit à l&apos;article 9.
        </p>
        <p>
          <b className="font-semibold">4.2 — Ce que le Service ne fait pas.</b>{" "}
          Le Service <b className="font-semibold">n&apos;est pas un logiciel de
          comptabilité</b> et ne tient pas la comptabilité de gérance du Client.
          Il ne gère aucun compte mandant, n&apos;assure aucun séquestre de
          fonds, ne fait transiter aucun mouvement de fonds, ne se synchronise
          pas avec les comptes bancaires du Client et ne constitue pas un tiers
          de confiance au sens probatoire. Il ne remplace ni
          l&apos;expert-comptable du Client, ni les obligations propres aux
          titulaires d&apos;une carte professionnelle.
        </p>
        <p>
          <b className="font-semibold">4.3 — Ce qui fait foi.</b> Les montants
          appelés, imputations et honoraires calculés font foi dans le Service ;
          les montants effectivement encaissés ou versés font foi dans les
          relevés bancaires du Client.{" "}
          <b className="font-semibold">En cas d&apos;écart, le relevé bancaire
          prime</b> ; le Client corrige le journal par contre-écriture. Le
          rapprochement bancaire relève du Client.
        </p>
        <p>
          <b className="font-semibold">4.4 — Intégrité du journal.</b> Toute
          écriture est <b className="font-semibold">immuable dès sa
          création</b> : une correction s&apos;effectue exclusivement par
          contre-écriture motivée, l&apos;historique restant intégralement
          consultable. La réouverture d&apos;une période close ne rend aucune
          écriture modifiable.
        </p>
        <p>
          <b className="font-semibold">4.5 — Documents générés.</b> Le Service
          produit des documents à partir des données saisies par le Client
          (baux, quittances, états des lieux, congés, décomptes de
          restitution…). <b className="font-semibold">Ces documents engagent le
          Client</b>, qui en vérifie le contenu avant tout usage. Lorsqu&apos;une
          donnée obligatoire manque, le document la signale en toutes lettres
          plutôt que de la deviner : il appartient au Client de la compléter
          avant signature ou envoi.
        </p>
        <p>
          <b className="font-semibold">4.6 — Responsabilité.</b> Le Client reste
          seul responsable de sa comptabilité, de ses obligations fiscales,
          sociales et professionnelles, et de l&apos;exactitude des saisies
          effectuées dans le Service.
        </p>
      </Article>

      <Article titre="5. Compte, accès et sécurité">
        <p>
          Le Client fournit des informations exactes et les tient à jour. Les
          identifiants sont personnels et confidentiels ; le Client répond des
          actes accomplis depuis son compte et informe l&apos;Éditeur sans délai
          de tout accès non autorisé.
        </p>
        <p>
          L&apos;Éditeur met en œuvre l&apos;état de l&apos;art : chiffrement en
          transit et au repos, cloisonnement strict entre organisations{" "}
          <b className="font-semibold">vérifié à chaque livraison par des tests
          d&apos;attaque</b>, journalisation des accès aux pièces sensibles,
          contrôle du type réel des fichiers déposés.
        </p>
      </Article>

      <Article titre="6. Rôles et habilitations">
        <p>
          Le Client répartit les accès entre ses utilisateurs selon les rôles
          prévus par le Service.{" "}
          <b className="font-semibold">Un agent peut être restreint à son
          portefeuille</b> : il ne voit alors que les lots qui lui sont confiés.
          Le Client est responsable de cette répartition et de sa mise à jour,
          notamment au départ d&apos;un collaborateur.
        </p>
      </Article>

      <Article titre="7. Espaces des locataires et des propriétaires mandants">
        <p>
          Le Client peut ouvrir un espace de consultation à ses locataires et à
          ses propriétaires mandants. Ces personnes :
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <b className="font-semibold">ne contractent pas</b> avec
            l&apos;Éditeur et ne lui doivent rien ;
          </li>
          <li>
            accèdent à leur propre dossier, et peuvent y déposer des pièces,
            signaler un incident ou écrire à leur gestionnaire ;
          </li>
          <li>
            exercent leurs droits sur leurs données{" "}
            <b className="font-semibold">auprès du Client</b>, responsable de
            traitement, et non auprès de l&apos;Éditeur.
          </li>
        </ul>
        <p>
          Le Client s&apos;assure de disposer du fondement juridique nécessaire
          pour leur ouvrir cet espace et pour y publier les documents qui les
          concernent.
        </p>
      </Article>

      <Article titre="8. Prix, essai et facturation">
        <p>
          <b className="font-semibold">8.1 — Grille.</b> Le{" "}
          <b className="font-semibold">premier bien est offert, sans limite de
          durée et sans carte bancaire</b>. Chaque bien supplémentaire est
          facturé <b className="font-semibold">5,99 € par mois</b>, sans
          engagement de durée.
        </p>
        <p>
          <b className="font-semibold">8.2 — Essai.</b> L&apos;ouverture
          d&apos;un compte donne accès à un{" "}
          <b className="font-semibold">essai gratuit de 14 jours</b> couvrant la
          formule complète. À son terme, à défaut de souscription, le compte
          conserve le premier bien offert.
        </p>
        <p>
          <b className="font-semibold">8.3 — Facturation.</b>{" "}
          <AFournir quoi="périodicité, moyen de paiement, émission des factures" />
        </p>
        <p>
          <b className="font-semibold">8.4 — TVA.</b> Les prix sont indiqués{" "}
          <AFournir quoi="hors taxes ou toutes taxes comprises" />.
        </p>
        <p>
          <b className="font-semibold">8.5 — Révision.</b> Toute évolution
          tarifaire est notifiée au Client{" "}
          <AFournir quoi="préavis" /> avant sa prise d&apos;effet. Le Client qui
          la refuse peut résilier sans frais avant cette date.
        </p>
        <p>
          <b className="font-semibold">8.6 — Rétractation.</b>{" "}
          <AFournir quoi="droit de rétractation du client particulier — article à rédiger avec le formulaire type" />
        </p>
      </Article>

      <Article titre="9. Réversibilité">
        <p>
          Le Client peut exporter à tout moment,{" "}
          <b className="font-semibold">sans frais ni condition</b>, le{" "}
          <b className="font-semibold">journal de gestion</b> : toutes les
          écritures de la période choisie, au format CSV, avec le bien, le lot
          et le mandant en clair. Ses documents restent par ailleurs
          consultables et téléchargeables un par un depuis son espace.
        </p>
        <p>
          <b className="font-semibold">Engagements supplémentaires</b> —
          archive documentaire indexée, export du référentiel, maintien de
          l&apos;accès en lecture seule après suspension :{" "}
          <AFournir quoi="à arrêter avant publication ; ces fonctions ne sont pas encore écrites" />
        </p>
        <p>
          À la résiliation, les données sont conservées{" "}
          <AFournir quoi="durée" /> pour permettre l&apos;export, puis
          supprimées ou anonymisées.
        </p>
      </Article>

      <Article titre="10. Disponibilité, maintenance et support">
        <p>
          L&apos;Éditeur s&apos;engage à une obligation de{" "}
          <b className="font-semibold">moyens</b>. Le Service peut être
          interrompu pour maintenance ; l&apos;Éditeur en informe le Client dès
          qu&apos;il le peut.
        </p>
        <p>
          <AFournir quoi="engagement de disponibilité, horaires et canaux du support, délai de première réponse" />
        </p>
      </Article>

      <Article titre="11. Données personnelles">
        <p>
          Le traitement des données est décrit dans la{" "}
          <Link href="/confidentialite" className="lien-discret">
            page confidentialité
          </Link>
          .
        </p>
        <p>
          <b className="font-semibold">Répartition des rôles.</b> Pour les
          données de gestion locative (baux, pièces, loyers, incidents,
          messages), <b className="font-semibold">le Client est responsable de
          traitement et l&apos;Éditeur sous-traitant</b>. Pour les traitements
          de plateforme (comptes, authentification, facturation),
          l&apos;Éditeur est responsable.
        </p>
      </Article>

      <Article titre="12. Propriété intellectuelle">
        <p>
          L&apos;Éditeur concède au Client un droit d&apos;usage personnel, non
          exclusif et non cessible du Service, pour la durée de
          l&apos;abonnement.
        </p>
        <p>
          <b className="font-semibold">Les données et documents du Client lui
          appartiennent.</b> L&apos;Éditeur n&apos;en acquiert aucun droit, ne
          les exploite à aucune autre fin que la fourniture du Service, et ne
          les cède ni ne les commercialise. Le Client qui appose son identité
          sur son espace en conserve la propriété pleine et entière.
        </p>
      </Article>

      <Article titre="13. Obligations du Client">
        <p>
          Le Client s&apos;engage à utiliser le Service conformément au droit, à
          ne déposer aucun contenu illicite, à ne pas tenter d&apos;accéder aux
          données d&apos;une autre organisation, à ne pas entraver le
          fonctionnement du Service, et à répondre de l&apos;exactitude des
          informations qu&apos;il saisit.
        </p>
      </Article>

      <Article titre="14. Responsabilité">
        <p>
          L&apos;Éditeur répond des dommages directs causés par un manquement à
          ses obligations. Il ne répond pas :
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            de l&apos;usage que le Client fait des documents générés, ni de leur
            contenu, que le Client vérifie (article 4.5) ;
          </li>
          <li>des conséquences de données inexactes saisies par le Client ;</li>
          <li>
            des manquements du Client à ses propres obligations légales,
            professionnelles, fiscales ou sociales.
          </li>
        </ul>
        <p>
          <AFournir quoi="plafond de responsabilité" />
        </p>
      </Article>

      <Article titre="15. Suspension et résiliation">
        <p>
          <b className="font-semibold">Par le Client</b> : à tout moment, sans
          frais ni préavis, depuis son espace ou par simple demande. La
          réversibilité de l&apos;article 9 s&apos;applique.
        </p>
        <p>
          <b className="font-semibold">Par l&apos;Éditeur</b> : en cas de défaut
          de paiement ou de manquement grave, après mise en demeure restée sans
          effet pendant <AFournir quoi="délai" />.
        </p>
      </Article>

      <Article titre="16. Modification des conditions">
        <p>
          L&apos;Éditeur peut modifier les présentes conditions. Toute
          modification est notifiée au Client <AFournir quoi="préavis" /> avant
          sa prise d&apos;effet. Le Client qui la refuse peut résilier sans
          frais avant cette date ; la poursuite de l&apos;utilisation après
          cette date vaut acceptation.
        </p>
        <p>
          L&apos;Éditeur conserve <b className="font-semibold">chaque
          version</b> et la date de son acceptation par le Client. La version
          en vigueur est la{" "}
          <b className="font-semibold">{CONDITIONS_VERSION}</b>.
        </p>
      </Article>

      <Article titre="17. Droit applicable et litiges">
        <p>
          Les présentes conditions sont soumises au{" "}
          <b className="font-semibold">droit français</b>. En cas de litige, les
          parties recherchent une solution amiable ; la réclamation
          s&apos;adresse à{" "}
          <Fait valeur={EDITEUR.email} quoi="adresse de contact" />.
        </p>
        <p>
          À défaut de solution amiable, le{" "}
          <b className="font-semibold">Client consommateur ou
          non-professionnel</b> peut recourir gratuitement au médiateur de la
          consommation désigné aux{" "}
          <Link href="/mentions-legales" className="lien-discret">
            mentions légales
          </Link>
          , avant toute saisine du juge.
        </p>
      </Article>
    </CoquilleLegale>
  );
}
