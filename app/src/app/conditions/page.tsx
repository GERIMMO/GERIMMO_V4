import Link from "next/link";
import { GRILLE_PARTICULIERS, calculerTarif, formaterCentimes } from "@/lib/tarification";
import { Article, CoquilleLegale, Fait } from "@/components/coquille-legale";
import { CONDITIONS_DATE, EDITEUR, documentsIncomplets, type FaitEditeur } from "@/lib/editeur";

export const metadata = { title: "Conditions générales d'utilisation — Gerimmo" };

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
  | "tva"
  | "preavisTarif"
  | "retractation"
  | "disponibilite"
  | "plafond"
  | "delaiMiseEnDemeure"
  | "preavisModification",
  FaitEditeur
> = {
  tva: null,
  preavisTarif: null,
  retractation: null,
  disponibilite: null,
  plafond: null,
  delaiMiseEnDemeure: null,
  preavisModification: null,
};

export default function PageConditions() {
  return (
    <CoquilleLegale
      titre="Conditions générales d'utilisation"
      chapo={`Version du ${CONDITIONS_DATE}, en vigueur depuis cette date.`}
      chemin="/conditions"
      incomplet={documentsIncomplets() || Object.values(CLAUSES).some((c) => !c)}
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
          <Link href="/confidentialite" className="lien-texte">
            page confidentialité
          </Link>{" "}
          et les{" "}
          <Link href="/mentions-legales" className="lien-texte">
            mentions légales
          </Link>
          , l&apos;accord entre le Client et l&apos;Éditeur.
        </p>
      </Article>

      <Article titre="2. Définitions">
        <p>
          <b className="font-semibold">Éditeur</b> : la société identifiée aux{" "}
          <Link href="/mentions-legales" className="lien-texte">
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
        <p><b className="font-semibold">8.1 — Usage et grille particuliers.</b> Les particuliers et SCI qui gèrent leurs propres biens utilisent la même grille. Toutes les formules incluent les mêmes fonctionnalités de gestion disponibles pour ce profil. Le nombre de biens détermine la capacité nécessaire ; la formule la moins chère couvrant le portefeuille est proposée pour la périodicité choisie.</p>
        <ul className="list-disc space-y-2 pl-5">
          {GRILLE_PARTICULIERS.map((f) => <li key={f.formule}><b>{f.libelle}</b> — {f.capacite === 1 ? "1 bien" : `jusqu’à ${f.capacite} biens`} : {formaterCentimes(f.mensuelCentimes)} TTC par mois, ou {formaterCentimes(f.annuelCentimes)} TTC prélevés en une fois pour douze mois.</li>)}
        </ul>
        <p>Au-delà de 20 biens, Patrimoine ajoute {formaterCentimes(calculerTarif("proprietaire_direct", 21).supplementCentimes)} TTC par bien supplémentaire et par mois, ou {formaterCentimes(calculerTarif("proprietaire_direct", 21, "annuel").supplementCentimes)} TTC par bien supplémentaire et par an. L’annuel correspond à deux mois offerts par rapport à douze mensualités. Aucun premier bien gratuit permanent n’est proposé dans cette nouvelle grille.</p>
        <p><b className="font-semibold">8.2 — Grille agences.</b> Une agence qui gère des biens pour des tiers est facturée mensuellement sur les lots distincts sous mandat actif, même vacants. Le socle est de {formaterCentimes(calculerTarif("agence", 0).montantCentimes)} HT pour un abonnement souscrit, jusqu’à dix lots inclus. Les tranches sont cumulatives : + {formaterCentimes(calculerTarif("agence", 11).montantCentimes - calculerTarif("agence", 10).montantCentimes)} HT par lot du 11ᵉ au 50ᵉ, + {formaterCentimes(calculerTarif("agence", 51).montantCentimes - calculerTarif("agence", 50).montantCentimes)} HT du 51ᵉ au 200ᵉ, puis + {formaterCentimes(calculerTarif("agence", 201).montantCentimes - calculerTarif("agence", 200).montantCentimes)} HT à partir du 201ᵉ. Aucun abonnement ne démarre à la seule création du compte. Le montant HT, les taxes effectivement applicables et le total à payer sont présentés avant confirmation.</p>
        <p><b className="font-semibold">8.3 — Essai et souscription.</b> Particuliers et agences bénéficient de 14 jours d’essai sans carte bancaire. À son terme, une souscription explicite est nécessaire pour conserver les droits de gestion ; à défaut, les données restent consultables et exportables en lecture seule. Aucun débit ne résulte de la seule expiration de l’essai. En cas de souscription anticipée, les jours restants sont conservés et la date du premier prélèvement est affichée avant accord.</p>
        <p><b className="font-semibold">8.4 — Périodes, renouvellement et résiliation.</b> L’offre mensuelle, sans engagement annuel, se renouvelle chaque mois ; la résiliation prend effet à la prochaine échéance. L’offre annuelle des particuliers est payée en une fois pour douze mois et se renouvelle pour douze mois à l’échéance, sauf résiliation avant celle-ci. Le montant annuel réellement prélevé est affiché avant confirmation. La résiliation conserve les droits déjà payés jusqu’à la fin de la période ; elle ne déclenche aucune suppression automatique des données. L’espace de facturation donne accès aux échéances, factures et moyens de paiement.</p>
        <p><b className="font-semibold">8.5 — Comptage et accès inclus.</b> Les particuliers comptent leurs biens activement gérés, occupés ou vacants, hors biens archivés. Un logement et ses annexes loués dans le même bail forment une unité ; un parking loué séparément compte distinctement. Les agences comptent chaque lot sous mandat actif une seule fois ; son archivage ne retire pas un mandat actif du volume facturé. Les locataires, les propriétaires invités par une agence et les collaborateurs de cette agence sont inclus sans supplément. Les biens confiés à une agence et les biens gérés personnellement sont dans des espaces séparés, sans abonnement personnel exigé pour la seule consultation des biens confiés.</p>
        <p><b className="font-semibold">8.6 — Évolution du portefeuille.</b> Avant toute augmentation payante, le nouveau montant, sa date d’effet et le prorata éventuel sont présentés et soumis à confirmation. Les augmentations confirmées ouvrent la capacité correspondante ; les baisses prennent effet à la prochaine échéance, lorsque le portefeuille le permet. Ces règles s’appliquent aussi aux biens au-delà de vingt, aux restaurations et à l’activation des mandats d’agence. Un refus conserve les données et empêche uniquement l’action nécessitant une capacité supplémentaire. Un abonnement annuel n’est pas converti en mensuel en cours de période sans parcours explicite.</p>
        <p><b className="font-semibold">8.7 — Prestations distinctes.</b> Aucun frais d’installation n’est facturé pour un démarrage autonome. Une reprise manuelle de données d’agence peut être proposée sur devis, sans facturation automatique. La gestion immobilière fonctionne partout en France ; le réseau d’artisans dépend de la commune du bien et du métier administrativement ouvert, sans effet sur le prix de l’abonnement. Les travaux et interventions sont facturés séparément sur devis. Les signatures électroniques, SMS, services bancaires ou autres prestations externes payantes ne sont pas compris en illimité ; d’éventuelles options nécessitent des conditions et un prix présentés séparément.</p>
        <p><b className="font-semibold">8.8 — Contrats et avantages existants.</b> Cette grille ne migre pas silencieusement un contrat existant et ne provoque aucun débit rétroactif. Les avantages déjà accordés, notamment prolongations d’essai et avoirs, sont conservés. Les anciens mécanismes promotionnels et de parrainage ne se cumulent pas automatiquement avec les nouvelles offres. Toute migration fait l’objet d’une proposition distincte et d’un accord sur ses conditions.</p>
        <p><b className="font-semibold">8.9 — Régime de TVA de l’éditeur.</b> <Fait valeur={CLAUSES.tva} quoi="régime fiscal applicable à la facturation de Gerimmo" />. Aucun taux ni régime fiscal n’est présumé à partir du statut juridique du client.</p>
        <p><b className="font-semibold">8.10 — Révision des prix.</b> Toute évolution tarifaire est notifiée au Client <Fait valeur={CLAUSES.preavisTarif} quoi="préavis" /> avant sa prise d’effet. Le Client qui la refuse peut résilier sans frais avant cette date.</p>
        <p><b className="font-semibold">8.11 — Rétractation.</b> <Fait valeur={CLAUSES.retractation} quoi="droit de rétractation du client particulier — article à rédiger avec le formulaire type" /></p>
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
          À l’expiration des droits payés ou de l’essai, les données restent
          consultables, téléchargeables et exportables en lecture seule.
          La résiliation de l’abonnement ne déclenche aucune suppression
          automatique. Les demandes d’effacement et les durées de conservation
          propres à certaines données sont décrites dans la politique de
          confidentialité.
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
          <Fait valeur={CLAUSES.plafond} quoi="plafond de responsabilité" />
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
          effet pendant <Fait valeur={CLAUSES.delaiMiseEnDemeure} quoi="délai" />.
        </p>
      </Article>

      <Article titre="16. Modification des conditions">
        <p>
          L&apos;Éditeur peut modifier les présentes conditions. Toute
          modification est notifiée au Client{" "}
          <Fait valeur={CLAUSES.preavisModification} quoi="préavis" /> avant
          sa prise d&apos;effet. Le Client qui la refuse peut résilier sans
          frais avant cette date ; la poursuite de l&apos;utilisation après
          cette date vaut acceptation.
        </p>
        <p>
          L&apos;Éditeur conserve <b className="font-semibold">chaque
          version</b> et la date de son acceptation par le Client. La version
          en vigueur est la{" "}
          <b className="font-semibold">version du {CONDITIONS_DATE}</b>.
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
          <Link href="/mentions-legales" className="lien-texte">
            mentions légales
          </Link>
          , avant toute saisine du juge.
        </p>
      </Article>
    </CoquilleLegale>
  );
}
