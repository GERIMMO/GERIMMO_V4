import { lireEditeur } from "@/lib/editeur-serveur";
import Link from "next/link";
import { Article, CoquilleLegale, Fait, TableauPrestataires } from "@/components/coquille-legale";
import {
  CONDITIONS_DATE,
  CONDITIONS_VERSION,
  REGIME_TVA,
  courrielDeContact,
  documentsIncomplets,
  sousTraitantsClient,
  type FaitEditeur,
} from "@/lib/editeur";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Conditions générales d'utilisation et de vente — Gerimmo",
  description:
    "Les conditions générales d'utilisation et de vente du logiciel de gestion locative Gerimmo : service, prix, essai, facturation, rétractation, résiliation, données et responsabilités.",
  chemin: "/conditions",
});

// 29/09 : le document porte aussi le prix, la facturation, la reconduction et
// la résiliation — ce sont des conditions de VENTE autant que d'utilisation.
// Il s'appelle donc « Conditions générales d'utilisation et de vente » partout
// (pied de page, case d'inscription), sous la même adresse /conditions.
//
// V1 (plan de conformité du 23/10/2026, lot 3, et décisions du dirigeant du
// même jour) : l'offre ne vise plus que les propriétaires qui gèrent leurs
// propres biens ; les agences sont retirées, les artisans relèvent de leurs
// propres conditions (/conditions/artisans). Aucun juriste n'a relu ce texte :
// les règles citées viennent d'une copie non officielle de la base LEGI et de
// résumés ; chaque texte de loi reproduit est marqué « à recomparer ».
// Le texte n'engage QUE ce que le produit fait : il ne paraît qu'une fois en
// production le code qui le rend vrai (rétractation en ligne, confirmation,
// résiliation, impayé, archive des versions, fermeture, inactivité,
// conservation, signature de la caution et de l'état des lieux).

// Les prix publiés s'entendent selon le régime de TVA de l'éditeur : en
// franchise en base, écrire « toutes taxes comprises » d'un côté et « hors
// taxes » de l'autre contredisait l'article 8.4 (aucune TVA facturée).
const FRANCHISE = REGIME_TVA?.nature === "franchise";

// Le contrat que la case d'inscription fait accepter.
//
// Jusqu'au 11/09, cette case faisait cocher « j'accepte les conditions
// d'utilisation » et l'action serveur refusait l'inscription sans elle — pour
// un document qui n'existait nulle part. On faisait signer un contrat
// introuvable.
//
// Le texte n'engage QUE ce que le produit fait réellement, vérifié dans le
// code. V1 (plan du 23/10, R06) : la lecture seule existe désormais (fin
// d'essai, fin d'abonnement, impayé) ; l'article 15 décrit le calendrier de
// l'impayé (J+0 mise en demeure, J+15 lecture seule, J+30 résiliation possible)
// que les courriers et la base appliquent.
//
// La version s'affiche par sa date (24/09) : CONDITIONS_VERSION, au format
// 2026-09-11, reste la clé enregistrée avec le compte, pas une désignation
// pour un lecteur.

/**
 * Les clauses pas encore arrêtées (24/09). `null` = à venir : la clause
 * s'affiche en réserve à sa place, et l'encadré « en cours de finalisation »
 * reste tant qu'il en subsiste une — même une fois l'identité de l'éditeur
 * fournie. Une clause arrêtée s'écrit ici, et nulle part ailleurs.
 */
const CLAUSES: Record<
  | "facturation"
  | "tva"
  | "preavisTarif"
  | "conservation"
  | "disponibilite"
  | "plafond"
  | "delaiMiseEnDemeure"
  | "preavisModification",
  FaitEditeur
> = {
  // Arrêtée le 28/09/2026 avec la grille tarifaire ; V1 : les agences sont retirées de l'offre.
  facturation:
    "Le Client choisit un paiement mensuel ou annuel. Le paiement se fait par carte, auprès du prestataire de paiement de l'Éditeur, à chaque échéance ; l'abonnement annuel est prélevé en une fois. Les factures sont émises électroniquement et consultables depuis « Mon abonnement ».",
  tva: REGIME_TVA === null
    ? null
    : REGIME_TVA.nature === "franchise"
      ? "TVA non applicable, article 293 B du code général des impôts : les prix affichés sont les montants payés."
      : `Les prix s'entendent toutes taxes comprises, TVA de ${REGIME_TVA.tauxPourcent} % incluse.`,
  // Décision du porteur, 28/09/2026 : un mois.
  preavisTarif: "au moins un mois",
  // V1 (plan du 23/10, R14 et R39 ; décision du dirigeant du 23/10 « je ne suis pas commerçant ») : le compte n'est
  // plus gardé sans limite (24 mois sans connexion ni abonnement, deux avertissements) ; les factures émises par
  // Gerimmo se gardent SIX ans (livre des procédures fiscales, art. L. 102 B — et non dix ans, durée du code de commerce
  // propre aux commerçants) ; la preuve du contrat DIX ans après la fin du dernier abonnement payé (code de la
  // consommation, art. L. 213-1). Sources non ouvertes le 23/10/2026 : à recomparer sur Légifrance avant publication.
  // « au moins six ans » (relecture du lot 3) : les factures sont émises chez le prestataire de paiement, qui ne
  // supprime pas une facture finalisée, et le client chez ce prestataire n'est jamais supprimé (plan, lot 1E) ; la
  // page confidentialité décrit ce que ce prestataire garde. Les préavis de suppression ne visent que les deux
  // alertes du lot 1E (J-30 par bail, J-15 par personne sans bail) : aucune autre pièce n'est promise d'un préavis.
  conservation:
    "tant que le compte est utilisé. À la fin de l'essai ou de l'abonnement, elles restent consultables et exportables en lecture seule ; cette fin n'entraîne pas à elle seule leur suppression. Le compte et les données de gestion sont supprimés vingt-quatre mois après la plus tardive des dates suivantes : la dernière connexion d'un utilisateur du compte, la fin du dernier abonnement payé. L'Éditeur prévient le Client par courriel deux mois, puis quinze jours avant cette suppression ; une connexion ou une demande écrite avant l'échéance l'annule. Certaines pièces suivent leur durée de conservation propre, décrite dans la page confidentialité (par exemple les pièces du dossier locataire, supprimées trois ans après la fin du dernier bail et la clôture de ses comptes, sauf litige signalé) ; le Client est prévenu trente jours avant la suppression des pièces rattachées à un bail, et quinze jours avant celle des pièces d'une personne rattachée à aucun bail. Le Client peut demander à tout moment la fermeture de son compte et la suppression de ses données, après avoir exporté ce qu'il souhaite garder ; si un abonnement payé est en cours, il choisit une fermeture à la fin de la période payée ou quatorze jours après sa confirmation, avec le remboursement de la part non utilisée de cette période. Il lui appartient de conserver lui-même les documents qu'il est tenu de garder. L'Éditeur conserve, pour ses seules obligations, les factures qu'il a émises pendant au moins six ans à compter de leur émission, et la preuve de l'acceptation des conditions et de l'abonnement pendant dix ans après la fin du dernier abonnement payé (article 3.3)",
  disponibilite:
    "L'Éditeur ne garantit pas une disponibilité ininterrompue. Les opérations de maintenance programmées sont annoncées à l'avance lorsque c'est possible, de préférence en dehors des heures ouvrées. Le support est assuré par écrit depuis la page « Aide et retours » de l'application ; l'Éditeur y répond dans les meilleurs délais.",
  // V1 (plan du 23/10, R08) : aucun plafond n'est opposé au consommateur ni au non-professionnel (art. R. 212-1 du
  // code de la consommation, numérotation à vérifier) ; le plafond ne vaut que pour le Client professionnel.
  plafond:
    "Lorsque le Client est un consommateur ou un non-professionnel, aucune stipulation des présentes ne supprime ni ne réduit son droit à réparation du préjudice causé par un manquement de l'Éditeur à ses obligations ; l'Éditeur en répond dans les conditions du droit commun. Lorsque le Client agit à des fins professionnelles, et sauf faute lourde ou dolosive, la responsabilité de l'Éditeur est limitée aux dommages directs et plafonnée, toutes causes confondues, au montant payé par le Client au titre du Service au cours des douze mois précédant le fait générateur.",
  delaiMiseEnDemeure: "trente jours",
  // Décision du porteur, 29/09/2026 : un mois, comme la révision tarifaire.
  preavisModification: "au moins un mois",
};

export default async function PageConditions() {
  const {editeur:EDITEUR,indisponible}=await lireEditeur();
  // V1 (plan du 23/10, R11) : l'annexe 1 ne cite que les sous-traitants ultérieurs des données du Client, lus depuis
  // les constantes du code et jamais depuis la base : la liste fait partie de la version acceptée.
  const prestataires = sousTraitantsClient();
  return (
    <CoquilleLegale
      titre="Conditions générales d'utilisation et de vente"
      chapo={`Version du ${CONDITIONS_DATE}, en vigueur depuis cette date.`}
      chemin="/conditions"
      incomplet={(indisponible || documentsIncomplets(EDITEUR)) || Object.values(CLAUSES).some((c) => !c)}
      courriel={courrielDeContact(EDITEUR)}
      // 24/10 (plan de conformité, R12) : le texte contractuel est marqué de son document et de sa version ; l'archive
      // des versions le range tel que publié, la garde du code l'empreinte (lib/conditions-versions.ts). Le lien vers
      // les versions archivées suit le texte sans en faire partie.
      // Relecture adverse du 24/10 (I1) : l'identité affichée, ou null si sa lecture a échoué (page dégradée), est portée
      // par l'élément marqué, hors du texte : l'archive refuse une page dégradée ou rendue avec une autre identité.
      texteContractuel={{ document: "conditions_clients", version: CONDITIONS_VERSION, identite: indisponible ? null : EDITEUR }}
      apres={
        <nav aria-label="Versions des conditions" className="text-sm text-[var(--texte-secondaire)]">
          <Link href="/conditions/versions" className="lien-texte">
            Versions archivées des conditions générales
          </Link>
        </nav>
      }
    >
      <Article titre="1. Objet">
        <p>
          Les présentes conditions régissent l&apos;accès au service Gerimmo et
          son utilisation. Gerimmo est un{" "}
          <b className="font-semibold">logiciel de gestion locative en
          ligne</b> destiné aux propriétaires bailleurs qui gèrent eux-mêmes
          leurs biens : il tient le référentiel de leur parc (biens, lots, baux,
          locataires, cautions), produit les documents de la location, suit les
          loyers et les incidents, permet de solliciter des artisans et ouvre un
          espace de consultation aux locataires.
        </p>
        <p>
          L&apos;offre destinée aux professionnels qui gèrent des biens pour le
          compte de tiers n&apos;est pas ouverte à la souscription ; si elle
          l&apos;est un jour, elle fera l&apos;objet de conditions distinctes.
          Les artisans qui utilisent l&apos;espace professionnel relèvent des
          «{" "}
          <Link href="/conditions/artisans" className="lien-texte">
            Conditions de l&apos;espace artisan
          </Link>{" "}
          ».
        </p>
        <p>
          Les présentes conditions et leurs annexes forment l&apos;accord entre
          le Client et l&apos;Éditeur. La{" "}
          <Link href="/confidentialite" className="lien-texte">
            page confidentialité
          </Link>{" "}
          et les{" "}
          <Link href="/mentions-legales" className="lien-texte">
            mentions légales
          </Link>{" "}
          l&apos;accompagnent à titre d&apos;information.
        </p>
      </Article>

      <Article titre="2. Définitions">
        <p>
          <b className="font-semibold">Éditeur</b> : l&apos;entrepreneur
          individuel identifié aux{" "}
          <Link href="/mentions-legales" className="lien-texte">
            mentions légales
          </Link>
          , qui édite et exploite le Service.
        </p>
        <p>
          <b className="font-semibold">Service</b> : l&apos;application
          Gerimmo, ses espaces, ses documents générés et ses exports.
        </p>
        <p>
          <b className="font-semibold">Client</b> : la personne qui ouvre un
          compte pour gérer ses propres biens et souscrit au Service : personne
          physique, indivision, société civile ou autre personne morale.
          C&apos;est le Client qui accepte les présentes conditions. Le{" "}
          <b className="font-semibold">Client consommateur</b> est la personne
          physique qui agit à des fins qui n&apos;entrent pas dans le cadre de
          son activité commerciale, industrielle, artisanale, libérale ou
          agricole. Le <b className="font-semibold">Client
          non-professionnel</b> est la personne morale qui n&apos;agit pas à des
          fins professionnelles. Les autres Clients sont des professionnels.
        </p>
        <p>
          <b className="font-semibold">Organisation</b> : l&apos;espace de
          travail du Client. Chaque organisation est{" "}
          <b className="font-semibold">étanche</b> : aucune donnée n&apos;y est
          visible depuis une autre.
        </p>
        <p>
          <b className="font-semibold">Locataire, caution et autres personnes
          invitées</b> : les personnes auxquelles le Client ouvre un espace de
          consultation ou qu&apos;il invite à signer un document.{" "}
          <b className="font-semibold">Elles ne sont pas Clientes</b> : elles ne
          souscrivent rien, ne paient rien, et leur accès dépend du Client.
          L&apos;article 7 leur est consacré.
        </p>
        <p>
          <b className="font-semibold">Artisan</b> : le professionnel inscrit
          sur l&apos;espace artisan, que le Client peut solliciter
          (article 8.8). Il n&apos;est ni le préposé ni le mandataire de
          l&apos;Éditeur.
        </p>
      </Article>

      <Article titre="3. Acceptation et formation du contrat">
        <p>
          <b className="font-semibold">3.1 — Ouverture du compte.</b> Le compte
          s&apos;ouvre en trois étapes : saisie de l&apos;adresse électronique,
          confirmation par le lien reçu, choix du mot de passe et acceptation
          des présentes conditions. La case d&apos;acceptation n&apos;est pas
          pré-cochée et l&apos;inscription est refusée sans elle. Le contrat
          d&apos;utilisation est conclu à cette acceptation.
        </p>
        <p>
          <b className="font-semibold">3.2 — Souscription d&apos;un abonnement
          payant.</b> Le Client souscrit depuis « Mon abonnement » : (1) il
          choisit la périodicité et la formule ; (2) il vérifie le récapitulatif
          (formule, prix, date du premier prélèvement, durée, reconduction,
          droit de rétractation) et peut revenir modifier ses choix ; (3) il
          coche la case de confirmation ; (4) il saisit sa carte sur la page
          sécurisée du prestataire de paiement et valide la commande par le
          bouton de paiement. Jusqu&apos;à cette validation, il peut corriger ou
          abandonner sans engagement. L&apos;abonnement payant est conclu
          lorsque le prestataire de paiement confirme la souscription ; cette
          date fait courir le délai de rétractation de l&apos;article 8.10.
          L&apos;Éditeur confirme la souscription par courrier électronique,
          avec les présentes conditions au format PDF et le formulaire de
          rétractation.
        </p>
        <p>
          <b className="font-semibold">3.3 — Langue, archivage et preuve.</b> Le
          contrat est conclu en français. La{" "}
          <b className="font-semibold">version acceptée</b>, sa date et son
          heure sont enregistrées : c&apos;est le texte de cette version qui lie
          les parties, tant qu&apos;une nouvelle version ne s&apos;applique pas
          dans les conditions de l&apos;article 16. Chaque version des présentes conditions est archivée par
          l&apos;Éditeur sans modification possible et reste consultable sur la
          page des versions archivées des conditions générales, accessible
          depuis la présente page ; la version acceptée par le Client est
          consultable depuis « Mon compte » et lui est communiquée sur simple
          demande. L&apos;Éditeur conserve la preuve de l&apos;acceptation et de
          l&apos;abonnement pendant dix ans après la fin du dernier abonnement
          payé ; pour un compte qui n&apos;a jamais souscrit d&apos;abonnement
          payant, cette preuve est supprimée avec le compte.
        </p>
      </Article>

      <Article titre="4. Nature du Service : un journal de gestion">
        <p>
          <b className="font-semibold">4.1 — Ce que le Service fait.</b> Le
          Service tient un <b className="font-semibold">journal de gestion</b> :
          il suit les loyers appelés et les dépenses déclarées, produit les
          quittances et prépare les récapitulatifs utiles à la déclaration des
          revenus fonciers. L&apos;export des écritures est décrit à
          l&apos;article 9.
        </p>
        <p>
          <b className="font-semibold">4.2 — Ce que le Service ne fait pas.</b>{" "}
          Le Service <b className="font-semibold">n&apos;est pas un logiciel de
          comptabilité</b> et ne tient pas la comptabilité du Client. Il
          n&apos;assure aucun séquestre de fonds, ne fait transiter aucun
          mouvement de fonds, ne se synchronise pas avec les comptes bancaires
          du Client et ne constitue pas un tiers de confiance au sens
          probatoire. Il ne remplace ni l&apos;expert-comptable ni le conseil
          juridique ou fiscal du Client.
        </p>
        <p>
          <b className="font-semibold">4.3 — Ce qui fait foi.</b> Les montants
          appelés et les dépenses saisies font foi dans le Service ; les
          montants effectivement encaissés ou versés font foi dans les relevés
          bancaires du Client.{" "}
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
          (baux, avenants, actes de cautionnement, quittances, états des lieux,
          congés, accords d&apos;échelonnement ou de travaux, décomptes de
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
        {/* V1 (plan du 23/10, R13 ; décision du dirigeant du 23/10 « le cautionnement et l'état des lieux doivent être
            signés sur Gerimmo directement ») : ni la fermeture du cautionnement électronique ni l'état des lieux « sur
            papier » du plan ; la caution saisit elle-même son mobile et sa mention, le Client confirme l'établissement
            contradictoire et sur place de l'état des lieux. Pas de « signature simple au sens du règlement » (catégorie
            non sourcée) ni d'exonération ; un seul certificat, commun à tous les signataires. Risque résiduel : valeur
            probante d'une signature par code SMS pour ces deux actes, à faire relire par un juriste.
            Délai de l'état des lieux d'entrée (loi n° 89-462 du 6 juillet 1989, art. 3-2) : « dix jours à compter de son
            établissement » selon la décision du 23/10 ; « établissement » ou « signature » n'a pas été vérifié sur la
            source (non ouverte le 23/10/2026) : à recomparer sur Légifrance avant publication. Le modèle généré
            (lib/documents/modeles/edl.ts, mention de l'état des lieux d'entrée) dit encore « dans les dix jours de sa
            signature » : les deux textes doivent dire le même mot, et, si c'est « établissement », l'expiration du circuit
            de l'état des lieux (trente jours) laisse le délai s'écouler avant la signature du locataire. Comme le modèle,
            le texte rattache les deux droits (dix jours, période de chauffe) à l'état des lieux d'entrée. */}
        <p>
          <b className="font-semibold">4.7 — Signature électronique.</b> Le
          Service permet au Client de faire signer en ligne certains documents
          qu&apos;il a générés : le bail et ses avenants, l&apos;acte de
          cautionnement, l&apos;état des lieux, l&apos;accord
          d&apos;échelonnement, l&apos;accord de travaux et l&apos;acceptation
          d&apos;un devis d&apos;artisan. La signature est réalisée chez Zoho
          Sign, prestataire désigné à l&apos;annexe 1 ; les documents sont
          hébergés dans un centre de données de l&apos;Union européenne et les
          SMS sont acheminés par les prestataires de Zoho. Chaque signataire
          reçoit une invitation par courrier électronique, peut consulter
          l&apos;ensemble du document et de ses annexes, puis signe après avoir
          saisi un code à usage unique reçu par SMS ; aucun compte Gerimmo ne
          lui est demandé. Les signataires signent dans l&apos;ordre affiché
          avant l&apos;envoi, le ou les bailleurs en dernier. Des rappels peuvent
          être adressés à ceux qui n&apos;ont pas encore signé. La demande
          expire au plus tard trente jours après la préparation du document ou,
          pour un devis, à la fin de sa validité ; la date d&apos;expiration est
          affichée avant l&apos;envoi. Un circuit refusé, expiré ou annulé
          n&apos;engage aucun signataire.
        </p>
        <p>
          Il s&apos;agit d&apos;une{" "}
          <b className="font-semibold">signature électronique simple, par code
          à usage unique</b>. Elle n&apos;est pas une signature électronique
          qualifiée au sens du règlement (UE) n° 910/2014 du 23 juillet 2014 :
          elle ne bénéficie pas de la présomption de fiabilité attachée à cette
          dernière, et sa fiabilité s&apos;apprécie, en cas de contestation, au
          vu du document signé et du certificat de réalisation décrits
          ci-dessous. Le code SMS atteste que le signataire disposait du
          téléphone indiqué ; il ne vaut pas vérification de son identité
          civile.
        </p>
        <p>
          Avant chaque envoi, le Client relit le document et vérifie
          l&apos;identité de chaque signataire, l&apos;ordre de signature, ainsi
          que l&apos;adresse électronique et, sauf pour la caution, le numéro de
          téléphone saisis, qui doivent être personnels au signataire. Le Client
          ne signe jamais à la place d&apos;un tiers et ne saisit jamais ses
          propres coordonnées, ni celles d&apos;une autre personne, pour un
          signataire.
        </p>
        <p>
          <b className="font-semibold">Acte de cautionnement.</b> La caution
          reçoit par courrier électronique un lien qui lui est propre, par
          lequel elle saisit elle-même le numéro de téléphone mobile auquel son
          code de signature sera envoyé ; le Client ne saisit pas ce numéro.
          Dans sa session de signature, la caution appose elle-même la mention
          prévue par l&apos;article 2297 du code civil ; le Service refuse de
          valider l&apos;acte si la mention reçue est incomplète ou différente
          de la mention attendue.
        </p>
        <p>
          <b className="font-semibold">État des lieux.</b> Avant l&apos;envoi en
          signature, le Client confirme que l&apos;état des lieux a été établi
          contradictoirement, sur place, à la date de la visite, en présence du
          locataire ou de son représentant. Pour un état des lieux
          d&apos;entrée, le locataire est informé de son droit de demander
          qu&apos;il soit complété : dans les dix jours qui suivent son
          établissement et, pour les éléments de chauffage, pendant le premier
          mois de la période de chauffe.
        </p>
        <p>
          À la fin du circuit, le Service enregistre dans les Documents du
          Client le document signé et le{" "}
          <b className="font-semibold">certificat de réalisation</b> délivré par
          le prestataire, commun à tous les signataires. Ces pièces suivent la
          durée de conservation de l&apos;acte signé, décrite dans la page
          confidentialité ; lorsqu&apos;elles sont rattachées à un bail, le
          Client est prévenu trente jours avant leur suppression (article 9).
          Il peut les télécharger à tout moment. Il appartient au Client d&apos;en garder une copie aussi longtemps que
          l&apos;acte peut être invoqué ou contesté, y compris après la fin de
          son abonnement.
        </p>
        <p>
          La signature électronique est{" "}
          <b className="font-semibold">comprise dans l&apos;abonnement et dans
          l&apos;essai gratuit</b> : ni le Client ni les signataires ne paient de
          frais pour l&apos;envoi ou pour le code SMS. Elle s&apos;exerce dans la
          limite d&apos;un volume mensuel commun à l&apos;ensemble des clients
          et peut être momentanément indisponible, notamment lorsque ce volume
          est atteint ou pour des raisons de sécurité ; le Client en est informé
          à l&apos;écran. Il peut toujours faire signer le document sur papier
          et en déposer l&apos;exemplaire signé dans le Service.
        </p>
        <p>
          Les autres documents (quittances, reçus, avis, courriers) peuvent
          porter l&apos;image de la signature que le Client a enregistrée dans
          son profil ; cette image n&apos;est pas une signature électronique au
          sens de l&apos;article 1367 du code civil.
        </p>
        <p>
          L&apos;Éditeur n&apos;est pas partie aux actes signés. Le Client
          vérifie le contenu de chaque acte avant l&apos;envoi (article 4.5). Le
          présent article ne limite pas la responsabilité de l&apos;Éditeur
          lorsque le Service, y compris un modèle de document qu&apos;il
          fournit, ne fonctionne pas comme décrit.
        </p>
        <p>
          <b className="font-semibold">4.8 — Fonctionnement et
          compatibilité.</b> Le Service s&apos;utilise en ligne, depuis un
          navigateur web à jour, sur ordinateur, tablette ou téléphone ; il ne
          nécessite aucune installation. Les documents sont produits au format
          PDF et les exports au format CSV, lisibles par les tableurs courants.
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

      <Article titre="6. Accès au compte">
        <p>
          Le compte est personnel. Lorsque le Service permet au Client
          d&apos;ouvrir un accès à d&apos;autres personnes, le Client choisit
          ces personnes et l&apos;étendue de leur accès, et le retire
          lorsqu&apos;il n&apos;a plus lieu d&apos;être.
        </p>
      </Article>

      <Article titre="7. Espaces des locataires et des personnes invitées">
        <p>
          Le Client peut ouvrir un espace de consultation à ses locataires et
          inviter toute personne partie à un document à le signer. Ces
          personnes :
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <b className="font-semibold">ne contractent pas</b> avec
            l&apos;Éditeur et ne lui doivent rien ;
          </li>
          <li>
            accèdent, le cas échéant, à leur propre dossier et peuvent, selon ce
            que le Service propose, y déposer des pièces, signaler un incident,
            convenir, reporter ou annuler un rendez-vous avec un artisan, évaluer
            une intervention, signer les documents qui leur sont soumis et
            écrire au Client ;
          </li>
          <li>
            exercent leurs droits sur les données de la location{" "}
            <b className="font-semibold">auprès du Client</b>, responsable de ce
            traitement, et, pour leur compte de connexion, dont l&apos;Éditeur
            est responsable (article 11), auprès de l&apos;Éditeur, selon la
            page confidentialité.
          </li>
        </ul>
        <p>
          Elles s&apos;engagent à n&apos;utiliser leur espace que pour la
          location concernée, à n&apos;y déposer aucun contenu illicite et à ne
          pas tenter d&apos;accéder à d&apos;autres données ; l&apos;Éditeur
          peut suspendre un accès utilisé en violation de ces règles et en
          informe le Client. Le Client s&apos;assure de disposer du fondement
          juridique nécessaire pour leur ouvrir cet espace et pour y publier les
          documents qui les concernent.
        </p>
      </Article>

      <Article titre="8. Prix, essai et facturation">
        <p>
          <b className="font-semibold">8.1 — Formules.</b> Le prix dépend du
          nombre de biens gérés ; les fonctions de gestion sont les mêmes quelle
          que soit la formule. Les formules sont Solo (1 bien), Bailleur
          (jusqu&apos;à 3), Investisseur (jusqu&apos;à 10) et Patrimoine
          (jusqu&apos;à 20, puis un supplément par bien), en paiement mensuel ou
          annuel{FRANCHISE ? "" : ", prix toutes taxes comprises"}.
          {FRANCHISE
            ? " L'Éditeur ne facturant pas de TVA (article 8.4), les prix publiés sont les montants payés."
            : ""}{" "}
          Les montants en vigueur sont publiés sur la page{" "}
          <a href="/tarifs" className="underline">Tarifs</a> et rappelés avant
          toute souscription. Aucune formule n&apos;est gratuite en permanence.
        </p>
        <p>
          <b className="font-semibold">8.2 — Essai.</b> L&apos;ouverture
          d&apos;un compte donne accès à un{" "}
          <b className="font-semibold">essai gratuit de deux mois pour toute
          inscription jusqu&apos;au 31 décembre 2026 inclus</b> (offre de
          lancement), <b className="font-semibold">d&apos;un mois pour toute
          inscription à compter du 1er janvier 2027</b>, sans moyen de
          paiement. La durée applicable est celle en vigueur au jour de
          l&apos;ouverture du compte (heure de Paris) ; elle se compte en mois
          calendaires. Aucun abonnement ne démarre sans souscription
          explicite. À son terme, à défaut de souscription, la saisie de
          nouvelles données est suspendue ; les données restent consultables et
          exportables et ne sont pas supprimées du seul fait de cette fin
          (article 9). Une souscription pendant l&apos;essai n&apos;en réduit
          pas la durée : le premier prélèvement intervient à son terme.
        </p>
        <p>
          <b className="font-semibold">8.3 — Facturation.</b> {CLAUSES.facturation}
        </p>
        <p>
          <b className="font-semibold">8.4 — Taxes.</b>{" "}
          <Fait valeur={CLAUSES.tva} quoi="régime de TVA de l'éditeur" />
        </p>
        <p>
          <b className="font-semibold">8.5 — Changements.</b> Toute
          augmentation du montant (formule supérieure, biens ou lots
          supplémentaires) n&apos;est appliquée qu&apos;après que le nouveau
          montant, sa date d&apos;effet et l&apos;éventuel prorata ont été
          présentés au Client et confirmés par lui. Une diminution
          s&apos;applique à la prochaine échéance. Une formule annuelle
          n&apos;est pas convertie en mensuelle en cours de période, sauf
          rétractation du passage à l&apos;abonnement annuel (article 8.10).
        </p>
        <p>
          <b className="font-semibold">8.6 — Résiliation.</b> L&apos;abonnement
          mensuel est conclu pour une durée indéterminée et facturé par périodes
          d&apos;un mois. Le Client résilie à tout moment depuis « Mon
          abonnement », sans frais, au moyen de la fonctionnalité « Résilier
          votre contrat ». La résiliation prend effet à la prochaine échéance,
          mensuelle ou annuelle ; l&apos;accès payé reste ouvert jusqu&apos;à
          cette date, et la période en cours n&apos;est pas remboursée, sauf
          dans les cas prévus aux articles 8.7, 8.10, 9, 15.4, 15.5 et 16 et
          à l&apos;annexe 1 (sous-traitants ultérieurs). L&apos;Éditeur accuse
          réception de la résiliation par courrier électronique, en indiquant
          la date de fin du contrat et ses effets.
        </p>
        <p>
          <b className="font-semibold">8.7 — Reconduction de
          l&apos;abonnement annuel.</b> L&apos;abonnement annuel est payé en une
          fois pour douze mois et se renouvelle par tacite reconduction pour
          douze mois à sa date anniversaire, sauf résiliation préalable.
          Lorsque le Client est un consommateur ou un non-professionnel,
          l&apos;Éditeur l&apos;informe par écrit, par courrier électronique,{" "}
          <b className="font-semibold">au plus tôt trois mois et au plus tard
          un mois avant le terme</b> de la période en cours, de la possibilité
          de ne pas reconduire l&apos;abonnement et indique, dans un encadré
          apparent, la date limite de non-reconduction ; ce choix s&apos;exerce
          depuis « Mon abonnement ». À défaut de cette information, le Client
          consommateur ou non-professionnel peut mettre fin gratuitement à
          l&apos;abonnement à tout moment à compter de la date de reconduction,
          et les sommes versées pour la période postérieure à la résiliation
          lui sont remboursées dans un délai de trente jours (article L. 215-1
          du code de la consommation). Les articles L. 215-1 à L. 215-3 et
          L. 241-3 du code de la consommation sont reproduits à
          l&apos;annexe 2.
        </p>
        <p>
          <b className="font-semibold">8.8 — Artisans et travaux.</b> Le
          Service permet de solliciter des artisans validés par l&apos;Éditeur,
          qu&apos;ils soient proposés par le Service ou invités par le Client.
          Les devis, travaux et factures sont conclus
          et réglés directement entre le Client et l&apos;artisan :
          l&apos;Éditeur n&apos;est pas partie à ces contrats, n&apos;encaisse
          aucune somme et ne garantit ni le prix ni l&apos;exécution des
          travaux. Ces travaux ne sont jamais compris dans l&apos;abonnement.
          Les artisans proposés exercent le métier demandé, interviennent dans
          la commune du bien, sont validés et, pour les travaux qui
          l&apos;exigent, disposent d&apos;une assurance décennale valide. Ils
          sont présentés par note moyenne décroissante, prise en compte à
          partir de trois évaluations et calculée sur les évaluations des
          propriétaires pour deux tiers et des locataires pour un tiers, ou sur
          les seules évaluations disponibles quand une seule de ces deux
          catégories a évalué ; viennent ensuite les artisans qui ont moins de
          trois évaluations ; à égalité, l&apos;ordre alphabétique de la raison
          sociale. Aucun artisan ne paie pour être mieux classé. Aucuns frais
          d&apos;installation ne sont facturés pour un démarrage autonome.
        </p>
        <p>
          <b className="font-semibold">8.9 — Révision.</b> Toute évolution
          tarifaire est notifiée au Client par courrier électronique{" "}
          <Fait valeur={CLAUSES.preavisTarif} quoi="préavis" /> avant sa prise
          d&apos;effet. Elle ne s&apos;applique jamais à une période déjà payée :
          pour un abonnement annuel, le prix payé reste acquis jusqu&apos;au
          terme de la période en cours, et le nouveau prix figure dans
          l&apos;avis de l&apos;article 8.7. Pour le Client consommateur ou
          non-professionnel, elle ne s&apos;applique qu&apos;avec son{" "}
          <b className="font-semibold">accord exprès</b>, recueilli dans son
          espace ; à défaut d&apos;accord à la date d&apos;effet,
          l&apos;abonnement n&apos;est pas reconduit au-delà de la période en
          cours, aucune somme n&apos;est prélevée pour la période suivante, et
          les données restent consultables et exportables dans les conditions
          de l&apos;article 9. Pour le Client professionnel, elle s&apos;applique
          à la première échéance qui suit sa prise d&apos;effet ; le Client qui
          la refuse peut résilier sans frais avant cette date.
        </p>
        {/* V1 (plan du 23/10, R01, R16, R37) : rétractation ouverte à toutes les formules, bouton en ligne, nouveau délai
            au passage à l'annuel, remboursement intégral même après un début d'exécution demandé. Réforme du 19/06/2026
            (art. L. 221-21 et D. 221-5 du code de la consommation) connue par des sources secondaires seulement. */}
        <p id="retractation">
          <b className="font-semibold">8.10 — Rétractation.</b> Le Client
          consommateur dispose d&apos;un délai de{" "}
          <b className="font-semibold">quatorze jours</b> pour se rétracter de
          l&apos;abonnement payant, sans avoir à motiver sa décision (articles
          L. 221-18 et suivants du code de la consommation). Le délai court à
          compter de la conclusion de l&apos;abonnement (article 3.2) ; le jour
          de la conclusion n&apos;est pas compté. Le délai expire le
          quatorzième jour à 23 h 59, heure de Paris ; s&apos;il expire un
          samedi, un dimanche ou un jour férié ou chômé, il est prolongé
          jusqu&apos;au premier jour ouvrable suivant, à la même heure.
          L&apos;Éditeur accorde ce droit, dans les mêmes conditions, à tout
          Client titulaire d&apos;une formule Solo, Bailleur, Investisseur ou
          Patrimoine. Le passage d&apos;un abonnement mensuel à un abonnement
          annuel ouvre un nouveau délai de quatorze jours à compter de la
          demande de passage.
        </p>
        <p>
          Le Client notifie sa décision avant l&apos;expiration du délai, au
          moyen de la fonctionnalité{" "}
          <b className="font-semibold">« Renoncer au contrat ici »</b> de la
          page « Mon abonnement », disponible pendant tout le délai, du
          formulaire ci-dessous ou de toute autre déclaration dénuée
          d&apos;ambiguïté adressée à{" "}
          <Fait valeur={EDITEUR.email} quoi="adresse de contact" />.
          L&apos;Éditeur en accuse réception sans délai par courrier
          électronique, en reprenant le contenu de la déclaration, sa date et
          son heure.
        </p>
        <p>
          L&apos;Éditeur rembourse <b className="font-semibold">l&apos;intégralité</b>{" "}
          des sommes versées au titre de l&apos;abonnement, sans frais, au plus
          tard quatorze jours après avoir été informé de la décision, par le
          même moyen de paiement que celui utilisé. Lorsque le Client a demandé
          que l&apos;abonnement payant commence avant la fin du délai de
          rétractation, il conserve ce droit et l&apos;Éditeur lui rembourse
          l&apos;intégralité des sommes versées, sans retenue pour la période
          déjà fournie. L&apos;abonnement prend fin ; si l&apos;essai gratuit
          court encore, il se poursuit jusqu&apos;à son terme ; sinon, les
          données du Client restent consultables et exportables en lecture
          seule, dans les conditions de l&apos;article 9. La rétractation
          d&apos;un passage à l&apos;abonnement annuel rétablit
          l&apos;abonnement mensuel et donne lieu au remboursement intégral de
          la première échéance annuelle. La période d&apos;essai gratuite ne
          réduit pas le délai.
        </p>
        {/* Modèle de formulaire annexé à l'article R. 221-1 du code de la consommation (peut-être modifié par le décret
            n° 2026-3), adapté au service : à recomparer mot pour mot sur Légifrance avant publication (source non ouverte
            le 23/10/2026). */}
        <div className="rounded-lg border border-[var(--filet)] p-4 text-[13px]">
          <p className="font-semibold">Formulaire de rétractation</p>
          <p className="mt-2">
            (Veuillez compléter et renvoyer le présent formulaire uniquement si
            vous souhaitez vous rétracter du contrat.)
          </p>
          <p className="mt-2">
            À l&apos;attention de{" "}
            <Fait valeur={EDITEUR.denomination} quoi="dénomination de l'éditeur" />,{" "}
            <Fait valeur={EDITEUR.siege} quoi="adresse du siège" />,{" "}
            <Fait valeur={EDITEUR.email} quoi="adresse de contact" /> :
          </p>
          <p className="mt-2">
            Je vous notifie par la présente ma rétractation du contrat portant
            sur la prestation de services ci-dessous : abonnement Gerimmo
            (formule et organisation concernées).
          </p>
          <p className="mt-2">Commandé le :</p>
          <p>Nom du consommateur :</p>
          <p>Adresse du consommateur :</p>
          <p>Signature du consommateur (uniquement en cas de notification sur papier) :</p>
          <p>Date :</p>
        </div>
        <p>
          <b className="font-semibold">8.11 — Parrainage.</b> Chaque
          organisation dispose d&apos;un code de parrainage. Lorsqu&apos;une
          nouvelle organisation (le « filleul ») s&apos;inscrit avec ce code,
          le Client qui l&apos;a recommandée (le « parrain ») reçoit{" "}
          <b className="font-semibold">un mois offert</b> dès que le filleul
          devient client payant, c&apos;est-à-dire au paiement de sa première
          facture d&apos;un montant non nul — jamais à la seule inscription.
          Ce mois prend la forme d&apos;un avoir égal au montant mensuel de
          l&apos;abonnement du parrain (un douzième du montant annuel pour un
          abonnement annuel), imputé sur ses prochaines factures, ou, si le
          parrain est encore en période d&apos;essai, d&apos;une prolongation
          d&apos;un mois de cet essai. Le filleul ne reçoit pas d&apos;avantage
          supplémentaire : l&apos;essai ordinaire s&apos;applique. Une seule
          récompense est accordée par filleul ; l&apos;avoir n&apos;a aucune
          valeur monétaire, n&apos;est ni remboursable ni convertible en
          espèces, et ne profite pas à un parrain dont le compte est clos.
          Tout usage frauduleux (organisation fictive, auto-parrainage,
          contournement) entraîne l&apos;annulation des avantages concernés.
        </p>
      </Article>

      {/* V1 : la phrase de l'« archive complète » (plan du 23/10, R49) n'est publiée que lorsque l'export complet est en
          production ; il ne l'est pas encore. */}
      <Article titre="9. Réversibilité et conservation">
        <p>
          Le Client peut exporter à tout moment,{" "}
          <b className="font-semibold">sans frais ni condition</b>, le{" "}
          <b className="font-semibold">journal de gestion</b> : toutes les
          écritures de la période choisie, au format CSV, avec le bien et le lot
          en clair. Ses documents restent par ailleurs consultables et
          téléchargeables un par un depuis son espace.
        </p>
        <p>
          <b className="font-semibold">Conservation.</b> Les données du Client
          sont conservées <Fait valeur={CLAUSES.conservation} quoi="durée" />.
        </p>
      </Article>

      <Article titre="10. Disponibilité, maintenance et support">
        <p>
          L&apos;Éditeur est tenu d&apos;une obligation de{" "}
          <b className="font-semibold">moyens</b> : il met en œuvre les
          moyens raisonnables pour assurer l&apos;accès au Service et sa
          continuité. Le Service peut être interrompu pour maintenance ;
          l&apos;Éditeur en informe le Client dès qu&apos;il le peut.
        </p>
        <p>
          <Fait
            valeur={CLAUSES.disponibilite}
            quoi="engagement de disponibilité, horaires et canaux du support, délai de première réponse"
          />
        </p>
      </Article>

      <Article titre="11. Données personnelles">
        <p>
          Le traitement des données est décrit dans la{" "}
          <Link href="/confidentialite" className="lien-texte">
            page confidentialité
          </Link>
          .
        </p>
        <p>
          <b className="font-semibold">Répartition des rôles.</b> Pour les
          données de gestion locative (baux, pièces, loyers, incidents,
          messages), <b className="font-semibold">le Client est responsable de
          traitement et l&apos;Éditeur sous-traitant</b>. Pour les traitements
          de plateforme (comptes et authentification de tous les utilisateurs,
          facturation, validation, note et exclusion des artisans),
          l&apos;Éditeur est responsable.
        </p>
        <p>
          Pour les données qu&apos;il traite pour le compte du Client,
          l&apos;Éditeur s&apos;engage dans les termes de l&apos;annexe 1 «
          Traitement de données pour le compte du Client », qui fait partie
          des présentes conditions (article 28 du règlement général sur la
          protection des données).
        </p>
      </Article>

      <Article titre="12. Propriété intellectuelle">
        <p>
          L&apos;Éditeur concède au Client un droit d&apos;usage personnel, non
          exclusif et non cessible du Service, pendant l&apos;essai,
          l&apos;abonnement et la période de consultation en lecture seule
          prévue à l&apos;article 9.
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
            de l&apos;usage que le Client fait des documents générés, ni des
            informations qu&apos;il y saisit, complète ou modifie, et qu&apos;il
            vérifie avant tout usage (article 4.5). L&apos;Éditeur répond en
            revanche d&apos;une erreur ou d&apos;une omission propre à ses
            modèles de documents ;
          </li>
          <li>des conséquences de données inexactes saisies par le Client ;</li>
          <li>
            des manquements du Client à ses propres obligations légales,
            professionnelles, fiscales ou sociales.
          </li>
        </ul>
        <p>
          <Fait valeur={CLAUSES.plafond} quoi="plafond de responsabilité" />
        </p>
      </Article>

      {/* V1 (plan du 23/10, R20) : encadré d'après le modèle annexé à l'article D. 211-4 du code de la consommation, tel
          que lu dans une copie non officielle de la base LEGI (25/02/2026), adapté au service fourni en continu (« toute
          la durée de l'abonnement ») : à recomparer mot pour mot sur Légifrance avant publication (source non ouverte le
          23/10/2026). */}
      <Article titre="14 bis. Garanties légales (Client consommateur)">
        <p>
          L&apos;Éditeur, identifié aux{" "}
          <Link href="/mentions-legales" className="lien-texte">
            mentions légales
          </Link>{" "}
          (nom, adresse, téléphone, adresse électronique), répond des garanties
          ci-dessous envers le Client consommateur et les applique de la même
          façon au Client non-professionnel. Le Client les met en œuvre depuis
          la page « Aide et retours » ou à l&apos;adresse de contact. Les
          articles 10 et 14 ne les limitent pas.
        </p>
        <div className="space-y-2 rounded-lg border-2 border-[var(--encre)] p-4">
          <p>
            Le consommateur a droit à la mise en œuvre de la garantie légale de
            conformité en cas d&apos;apparition d&apos;un défaut de conformité
            pendant toute la durée de l&apos;abonnement, à compter de la
            fourniture du contenu numérique ou du service numérique. Durant ce
            délai, le consommateur n&apos;est tenu d&apos;établir que
            l&apos;existence du défaut de conformité et non la date
            d&apos;apparition de celui-ci.
          </p>
          <p>
            La garantie légale de conformité emporte obligation de fournir
            toutes les mises à jour nécessaires au maintien de la conformité du
            contenu numérique ou du service numérique durant toute la durée de
            l&apos;abonnement.
          </p>
          <p>
            La garantie légale de conformité donne au consommateur droit à la
            mise en conformité du contenu numérique ou du service numérique sans
            retard injustifié suivant sa demande, sans frais et sans
            inconvénient majeur pour lui.
          </p>
          <p>
            Le consommateur peut obtenir une réduction du prix en conservant le
            contenu numérique ou le service numérique, ou il peut mettre fin au
            contrat en se faisant rembourser intégralement contre renoncement au
            contenu numérique ou au service numérique, si : 1° Le professionnel
            refuse de mettre le contenu numérique ou le service numérique en
            conformité ; 2° La mise en conformité du contenu numérique ou du
            service numérique est retardée de manière injustifiée ; 3° La mise
            en conformité du contenu numérique ou du service numérique ne peut
            intervenir sans frais imposés au consommateur ; 4° La mise en
            conformité du contenu numérique ou du service numérique occasionne
            un inconvénient majeur pour le consommateur ; 5° La non-conformité
            du contenu numérique ou du service numérique persiste en dépit de la
            tentative de mise en conformité du professionnel restée
            infructueuse.
          </p>
          <p>
            Le consommateur a également droit à une réduction du prix ou à la
            résolution du contrat lorsque le défaut de conformité est si grave
            qu&apos;il justifie que la réduction du prix ou la résolution du
            contrat soit immédiate. Le consommateur n&apos;est alors pas tenu de
            demander la mise en conformité du contenu numérique ou du service
            numérique au préalable.
          </p>
          <p>
            Dans les cas où le défaut de conformité est mineur, le consommateur
            n&apos;a droit à l&apos;annulation du contrat que si le contrat ne
            prévoit pas le paiement d&apos;un prix.
          </p>
          <p>
            Toute période d&apos;indisponibilité du contenu numérique ou du
            service numérique en vue de sa remise en conformité suspend la
            garantie qui restait à courir jusqu&apos;à la fourniture du contenu
            numérique ou du service numérique de nouveau conforme.
          </p>
          <p>
            Ces droits résultent de l&apos;application des articles L. 224-25-1
            à L. 224-25-31 du code de la consommation.
          </p>
          <p>
            Le professionnel qui fait obstacle de mauvaise foi à la mise en
            œuvre de la garantie légale de conformité encourt une amende civile
            d&apos;un montant maximal de 300 000 euros, qui peut être porté
            jusqu&apos;à 10 % du chiffre d&apos;affaires moyen annuel (article
            L. 242-18-1 du code de la consommation).
          </p>
          <p>
            Le consommateur bénéficie également de la garantie légale des vices
            cachés en application des articles 1641 à 1649 du code civil,
            pendant une durée de deux ans à compter de la découverte du défaut.
            Cette garantie donne droit à une réduction de prix si le contenu
            numérique ou le service numérique est conservé, ou à un
            remboursement intégral contre renonciation au contenu numérique ou
            au service numérique.
          </p>
        </div>
      </Article>

      {/* V1 (plan du 23/10, R06, R07, R23, R25, R27 ; décision 5 : la facture restée impayée est annulée à la
          résiliation pour impayé). Jusqu'à la V1, cet article ne disait rien de la lecture seule, et Stripe annulait
          l'abonnement vers J+14, contre l'ancien article 15 (mise en demeure de trente jours). */}
      <Article titre="15. Défaut de paiement, suspension et résiliation">
        <p>
          <b className="font-semibold">15.1 — Résiliation par le Client.</b> À
          tout moment, sans frais, depuis « Mon abonnement ». La résiliation
          prend effet à la prochaine échéance, dans les conditions des
          articles 8.6 et 8.7. La réversibilité de l&apos;article 9
          s&apos;applique.
        </p>
        <p>
          <b className="font-semibold">15.2 — Échec d&apos;un prélèvement.</b> Si
          un prélèvement échoue, l&apos;Éditeur en informe le Client par
          courrier électronique le jour même. Ce courrier indique le montant dû,
          la façon de régulariser depuis « Mon abonnement », la date de passage
          en lecture seule et la date à partir de laquelle l&apos;abonnement
          peut être résilié. Il vise l&apos;article 15.4 et vaut mise en
          demeure au sens de cet article. Aucune pénalité ni aucuns frais de
          relance ne sont facturés.
        </p>
        <p>
          <b className="font-semibold">15.3 — Lecture seule.</b> Si
          l&apos;échéance reste impayée quinze jours après l&apos;échec, le
          compte passe en lecture seule ; l&apos;Éditeur le rappelle au Client
          par courrier électronique sept jours après l&apos;échec, puis la
          veille. Si le Client n&apos;a encore réglé aucune échéance (premier
          prélèvement à la fin de l&apos;essai), la lecture seule
          s&apos;applique dès l&apos;échec, comme à la fin d&apos;un essai sans
          souscription (article 8.2), et le Client en est informé le jour même.
          En lecture seule, le Client ne peut plus saisir de nouvelles données,
          et les envois automatiques (appels de loyer, quittances, relances,
          rappels) sont interrompus. Il continue de consulter ses données et de
          les exporter (article 9) ; ses locataires et les artisans gardent
          l&apos;accès à leur espace.{" "}
          <b className="font-semibold">Aucune donnée n&apos;est supprimée du
          fait de l&apos;impayé.</b> Dès que le paiement aboutit, la saisie et
          les envois automatiques reprennent pour l&apos;avenir ; les envois qui
          n&apos;ont pas eu lieu pendant la lecture seule ne sont pas tous
          rattrapés.
        </p>
        <p>
          <b className="font-semibold">15.4 — Résiliation par
          l&apos;Éditeur.</b> En cas de défaut de paiement ou de manquement
          grave du Client, l&apos;Éditeur peut résilier l&apos;abonnement au
          plus tôt <Fait valeur={CLAUSES.delaiMiseEnDemeure} quoi="délai" />{" "}
          après une mise en demeure restée sans effet, qui vise le présent
          article. La résiliation est notifiée par courrier électronique. En
          cas de défaut de paiement, la facture restée impayée est alors
          annulée. En dehors du défaut de paiement, la part du prix payé
          correspondant à la période restant à courir est remboursée au Client
          dans les quatorze jours. Les données restent ensuite consultables et exportables en
          lecture seule, dans les conditions de l&apos;article 9.
        </p>
        <p>
          <b className="font-semibold">15.5 — Résiliation pour manquement de
          l&apos;Éditeur.</b> Si l&apos;Éditeur manque gravement à ses
          obligations et n&apos;y remédie pas dans les trente jours d&apos;une
          réclamation écrite du Client (page « Aide et retours » ou adresse de
          contact), le Client peut résilier l&apos;abonnement avec effet
          immédiat. L&apos;Éditeur lui rembourse alors, dans les quatorze
          jours, la part du prix payé correspondant à la période restant à
          courir. Ce droit s&apos;ajoute à ceux que le Client tient de la loi.
        </p>
      </Article>

      {/* V1 (plan du 23/10, R19) : continuer d'utiliser le Service ne vaut plus acceptation d'une nouvelle version ; un changement de prix, de
          durée ou de caractéristiques essentielles demande l'accord exprès du consommateur, faute de quoi l'abonnement
          n'est pas reconduit (écran de ré-acceptation, lot 1A). */}
      <Article titre="16. Modification des conditions">
        <p>
          L&apos;Éditeur peut faire évoluer les présentes conditions. Toute
          nouvelle version est notifiée au Client par courrier électronique et
          dans son espace{" "}
          <Fait valeur={CLAUSES.preavisModification} quoi="préavis" /> avant sa
          prise d&apos;effet, avec un résumé des changements. Un changement qui
          porte sur le prix, la durée ou les caractéristiques essentielles du
          Service ne s&apos;applique au Client consommateur ou
          non-professionnel qu&apos;avec son{" "}
          <b className="font-semibold">accord exprès</b> ; à défaut
          d&apos;accord à la date d&apos;effet, la version précédente continue
          de s&apos;appliquer jusqu&apos;au terme de la période payée,
          l&apos;abonnement n&apos;est pas reconduit au-delà, aucune somme
          n&apos;est prélevée pour la période suivante, et les données restent
          consultables et exportables dans les conditions de l&apos;article 9.
        </p>
        <p>
          Les autres changements (évolution technique sans hausse de prix ni
          baisse de la qualité du Service, mise en conformité avec une règle
          nouvelle), ainsi que tout changement pour le Client professionnel,
          s&apos;appliquent à la date annoncée ; le Client qui les refuse peut
          résilier sans frais avant cette date, la résiliation prenant alors
          effet à cette date, et la part du prix payé correspondant à la période
          restant à courir lui est remboursée dans les quatorze jours.
        </p>
        <p>
          Chaque version est archivée dans les conditions de l&apos;article 3.3.
          La version en vigueur est la{" "}
          <b className="font-semibold">version du {CONDITIONS_DATE}</b>.
        </p>
      </Article>

      {/* V1 (plan du 23/10, R05 ; décision du dirigeant du 23/10 : médiateur NON BLOQUANT, vente ouverte). Le médiateur
          est un fait d'éditeur lu en base (composant Fait), comme l'adresse de contact : ses coordonnées s'affichent dès
          que son nom est saisi. Tant qu'il manque, la phrase dit qu'il sera désigné aux mentions légales dès l'adhésion —
          jamais que la vente est fermée. Saisir le médiateur change le texte publié : l'archive refusera alors la même
          version, et une version technique sera publiée à l'adhésion (plan, lot 3).
          Relecture du lot 3 : la parenthèse « Faire une réclamation » du plan n'est pas publiée, car cette nature de
          retour (lot 1B, R05) n'existe pas dans NATURES_RETOUR (lib/retours.ts) ; elle reviendra avec elle. */}
      <Article titre="17. Droit applicable et litiges">
        <p>
          Les présentes conditions sont soumises au{" "}
          <b className="font-semibold">droit français</b>. En cas de litige, les
          parties recherchent une solution amiable ; la réclamation
          s&apos;adresse à{" "}
          <Fait valeur={EDITEUR.email} quoi="adresse de contact" /> ou se fait
          depuis la page « Aide et retours ».
        </p>
        {EDITEUR.mediateurNom ? (
          <p>
            À défaut de solution amiable après une réclamation écrite adressée à
            l&apos;Éditeur, le{" "}
            <b className="font-semibold">Client consommateur ou
            non-professionnel</b> peut recourir gratuitement au médiateur de la
            consommation dont relève l&apos;Éditeur :{" "}
            <span className="[overflow-wrap:anywhere]">
              {EDITEUR.mediateurNom},{" "}
              <Fait valeur={EDITEUR.mediateurAdresse} quoi="adresse du médiateur" />,{" "}
              <Fait valeur={EDITEUR.mediateurSite} quoi="site du médiateur" />
            </span>
            .
          </p>
        ) : (
          <p>
            À défaut de solution amiable après une réclamation écrite adressée à
            l&apos;Éditeur, le{" "}
            <b className="font-semibold">Client consommateur ou
            non-professionnel</b> peut recourir gratuitement au médiateur de la
            consommation, qui sera désigné aux{" "}
            <Link href="/mentions-legales" className="lien-texte">
              mentions légales
            </Link>{" "}
            dès l&apos;adhésion de l&apos;Éditeur.
          </p>
        )}
      </Article>

      <Article titre="Annexe 1 — Traitement de données pour le compte du Client (article 28 du RGPD)">
        <p>
          <b className="font-semibold">Objet, durée, nature et finalité.</b> Pour
          les données de gestion locative (article 11), le Client est
          responsable de traitement et l&apos;Éditeur sous-traitant. Le
          traitement a pour seule finalité la fourniture du Service au Client.
          Il consiste à héberger, enregistrer, organiser, consulter, mettre en
          forme dans des documents, transmettre par courriel ou par circuit de
          signature, et sauvegarder ces données. Il dure tant que le compte du
          Client existe, y compris pendant la consultation en lecture seule qui
          suit la fin d&apos;un abonnement (article 9), puis jusqu&apos;à la
          suppression prévue ci-dessous. Il porte sur les données saisies ou
          déposées par le Client, ses utilisateurs et les personnes qu&apos;il
          invite : identité et coordonnées des locataires, cautions,
          signataires et artisans sollicités ; pièces des dossiers, notamment
          justificatifs d&apos;identité et de ressources ; baux, actes de
          cautionnement, états des lieux et photographies ; loyers,
          encaissements déclarés et dépenses ; incidents, rendez-vous, comptes
          rendus d&apos;intervention, évaluations et messages ; pour la
          signature électronique, nom, adresse électronique et téléphone mobile
          des signataires, document signé et certificat de réalisation.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <b className="font-semibold">Obligations et droits du Client.</b> Le
            Client détermine les finalités du traitement, s&apos;assure de sa
            licéité, informe les personnes concernées et répond à leurs
            demandes. Il peut à tout moment donner des instructions à
            l&apos;Éditeur, obtenir les informations prévues à la présente
            annexe et faire réaliser les audits prévus ci-dessous.
          </li>
          <li>
            <b className="font-semibold">Instructions documentées.</b>{" "}
            L&apos;Éditeur ne traite ces données que sur instruction documentée
            du Client, constituée des présentes conditions et des réglages et
            actions du Client dans le Service, y compris en ce qui concerne les
            transferts hors de l&apos;Union européenne, sauf obligation légale
            de l&apos;Union ou d&apos;un État membre ; dans ce cas, il en informe
            le Client avant le traitement, sauf si la loi l&apos;interdit. Il
            informe immédiatement le Client si une instruction lui paraît
            contraire à la réglementation.
          </li>
          <li>
            <b className="font-semibold">Confidentialité.</b> Les personnes
            autorisées à traiter ces données sont soumises à une obligation de
            confidentialité.
          </li>
          <li>
            <b className="font-semibold">Sécurité.</b> L&apos;Éditeur met en
            œuvre les mesures décrites à l&apos;article 5 et dans la page
            confidentialité (chiffrement, cloisonnement par organisation,
            contrôle des accès, journalisation des consultations sensibles,
            sauvegardes chiffrées).
          </li>
          <li>
            <b className="font-semibold">Sous-traitants ultérieurs.</b> Le
            Client donne une autorisation générale au recours aux prestataires
            de la liste ci-dessous, qui fait partie de la présente version.
            L&apos;Éditeur informe le Client par courriel, au moins un mois à
            l&apos;avance, de tout ajout ou remplacement envisagé ; le Client
            peut s&apos;y opposer par écrit avant cette date. Si l&apos;Éditeur
            maintient le changement, le Client peut résilier sans frais avant sa
            prise d&apos;effet et obtient le remboursement de la part du prix
            payé pour la période restant à courir. L&apos;Éditeur impose à
            chaque prestataire, par contrat, des obligations de protection des
            données équivalentes à la présente annexe, et il demeure pleinement
            responsable envers le Client de leur exécution.
          </li>
        </ul>
        <TableauPrestataires prestataires={prestataires} />
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <b className="font-semibold">Transferts hors de l&apos;Union.</b>{" "}
            Lorsque des données sont transférées ou accessibles hors de
            l&apos;Union européenne (voir la localisation de chaque prestataire
            dans la liste), le transfert est encadré par une décision
            d&apos;adéquation de la Commission européenne, notamment le cadre de
            protection des données UE–États-Unis pour un prestataire certifié,
            ou par les clauses contractuelles types de la Commission. Le Client
            peut en obtenir une copie sur demande.
          </li>
          <li>
            <b className="font-semibold">Droits des personnes.</b>{" "}
            L&apos;Éditeur aide le Client, dans la mesure du possible, à
            répondre aux demandes d&apos;exercice de droits des personnes
            concernées, et lui transmet sans délai toute demande reçue
            directement.
          </li>
          <li>
            <b className="font-semibold">Assistance.</b> L&apos;Éditeur aide
            le Client à garantir la sécurité du traitement et, le cas échéant,
            à réaliser une analyse d&apos;impact et à consulter l&apos;autorité
            de contrôle, compte tenu des informations dont il dispose.
          </li>
          {/* Décision du dirigeant du 23/10 (point 4) : aucune personne joignable en son absence n'est désignée, donc
              aucun engagement de 48 h : « dans les meilleurs délais » seul. */}
          <li>
            <b className="font-semibold">Violation de données.</b>{" "}
            L&apos;Éditeur notifie au Client toute violation de données à
            caractère personnel{" "}
            <b className="font-semibold">dans les meilleurs délais</b> après en
            avoir pris connaissance, avec les informations utiles à la
            notification que le Client doit, le cas échéant, adresser à la
            CNIL.
          </li>
          {/* La durée des sauvegardes Supabase n'a pas été relevée dans la console : pas de « quatre-vingt-dix jours »
              (plan du 23/10, R34). Relecture du lot 3 : tant que l'export complet (R49) n'est pas en production,
              l'article 9 ne restitue que le journal de gestion et les documents ; le reste des données (fiches,
              incidents, messages, rendez-vous) est restitué par une copie transmise sur demande (RGPD, art. 28.3 g). */}
          <li>
            <b className="font-semibold">Fin du traitement.</b> Lorsque le
            Client demande la suppression de son compte, ou à la fin du
            contrat, et au choix du Client, l&apos;Éditeur restitue les données
            puis les supprime, ou les supprime directement, ainsi que les copies
            existantes, sauf obligation légale de conservation. La restitution
            se fait par les exports et téléchargements de l&apos;article 9 et,
            pour les données qu&apos;ils ne couvrent pas, par une copie que
            l&apos;Éditeur transmet sur demande écrite du Client, dans un format
            lisible par machine. Les copies de sauvegarde sont effacées au terme
            de leur cycle de conservation.
          </li>
          <li>
            <b className="font-semibold">Information et audit.</b>{" "}
            L&apos;Éditeur met à la disposition du Client les informations
            nécessaires pour démontrer le respect de la présente annexe, et
            permet la réalisation d&apos;audits, y compris d&apos;inspections,
            par le Client ou un auditeur qu&apos;il mandate, soumis à la
            confidentialité, sur préavis raisonnable.
          </li>
        </ul>
      </Article>

      {/* V1 (plan du 23/10, R18 : art. L. 215-4 du code de la consommation). Texte d'une copie non officielle de la base
          LEGI datée du 25/02/2026 : à recomparer mot pour mot sur Légifrance avant publication (source non ouverte le
          23/10/2026). La date du titre (« version en vigueur au 25 février 2026 ») est celle de cette copie : la
          reposer à la date de la recomparaison. */}
      <Article titre="Annexe 2 — Articles L. 215-1 à L. 215-3 et L. 241-3 du code de la consommation (version en vigueur au 25 février 2026)">
        <p>
          <b className="font-semibold">Article L. 215-1.</b> Pour les contrats
          de prestations de services conclus pour une durée déterminée avec une
          clause de reconduction tacite, le professionnel prestataire de
          services informe le consommateur par écrit, par lettre nominative ou
          courrier électronique dédiés, au plus tôt trois mois et au plus tard
          un mois avant le terme de la période autorisant le rejet de la
          reconduction, de la possibilité de ne pas reconduire le contrat
          qu&apos;il a conclu avec une clause de reconduction tacite. Cette
          information, délivrée dans des termes clairs et compréhensibles,
          mentionne, dans un encadré apparent, la date limite de
          non-reconduction.
        </p>
        <p>
          Lorsque cette information ne lui a pas été adressée conformément aux
          dispositions du premier alinéa, le consommateur peut mettre
          gratuitement un terme au contrat, à tout moment à compter de la date
          de reconduction.
        </p>
        <p>
          Les avances effectuées après la dernière date de reconduction ou,
          s&apos;agissant des contrats à durée indéterminée, après la date de
          transformation du contrat initial à durée déterminée, sont dans ce cas
          remboursées dans un délai de trente jours à compter de la date de
          résiliation, déduction faite des sommes correspondant, jusqu&apos;à
          celle-ci, à l&apos;exécution du contrat.
        </p>
        <p>
          Les dispositions du présent article s&apos;appliquent sans préjudice
          de celles qui soumettent légalement certains contrats à des règles
          particulières en ce qui concerne l&apos;information du consommateur.
        </p>
        <p>
          Par exception au premier alinéa du présent article, pour les contrats
          de fourniture de service de télévision au sens de l&apos;article 2 de
          la loi n° 86-1067 du 30 septembre 1986 relative à la liberté de
          communication et pour les contrats de fourniture de services de
          médias audiovisuels à la demande, le consommateur peut mettre
          gratuitement un terme au contrat, à tout moment à compter de la
          première reconduction, dès lors qu&apos;il change de domicile ou que
          son foyer fiscal évolue.
        </p>
        <p>
          <b className="font-semibold">Article L. 215-1-1.</b> Lorsqu&apos;un
          contrat a été conclu par voie électronique ou a été conclu par un
          autre moyen et que le professionnel, au jour de la résiliation par le
          consommateur, offre au consommateur la possibilité de conclure des
          contrats par voie électronique, la résiliation est rendue possible
          selon cette modalité.
        </p>
        <p>
          A cet effet, le professionnel met à la disposition du consommateur une
          fonctionnalité gratuite permettant d&apos;accomplir, par voie
          électronique, la notification et les démarches nécessaires à la
          résiliation du contrat. Lorsque le consommateur notifie la résiliation
          du contrat, le professionnel lui confirme la réception de la
          notification et l&apos;informe, sur un support durable et dans des
          délais raisonnables, de la date à laquelle le contrat prend fin et des
          effets de la résiliation.
        </p>
        <p>
          Un décret fixe notamment les modalités techniques de nature à garantir
          une identification du consommateur et un accès facile, direct et
          permanent à la fonctionnalité mentionnée au deuxième alinéa, telles
          que ses modalités de présentation et d&apos;utilisation. Il détermine
          les informations devant être fournies par le consommateur.
        </p>
        <p>
          <b className="font-semibold">Article L. 215-2.</b> Les dispositions du
          présent chapitre, à l&apos;exception de l&apos;article L. 215-1-1, ne
          sont pas applicables aux exploitants des services d&apos;eau potable
          et d&apos;assainissement.
        </p>
        <p>
          <b className="font-semibold">Article L. 215-3.</b> Les dispositions du
          présent chapitre sont également applicables aux contrats conclus entre
          des professionnels et des non-professionnels.
        </p>
        <p>
          <b className="font-semibold">Article L. 241-3.</b> Lorsque le
          professionnel n&apos;a pas procédé au remboursement dans les
          conditions prévues à l&apos;article L. 215-1, les sommes dues sont
          productives d&apos;intérêts au taux légal.
        </p>
      </Article>
    </CoquilleLegale>
  );
}
