import { lireEditeur } from "@/lib/editeur-serveur";
import Link from "next/link";
import { AFournir, Article, CoquilleLegale, Fait, TableauPrestataires } from "@/components/coquille-legale";
import { courrielDeContact, confidentialiteIncomplete, prestatairesAvecFaits, prestatairesIncomplets } from "@/lib/editeur";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Confidentialité — Gerimmo",
  description:
    "Quelles données Gerimmo traite, sur quelle base légale, où elles sont hébergées, combien de temps elles sont conservées et comment exercer vos droits.",
  chemin: "/confidentialite",
});

// Description des traitements et durées réellement configurés, revue le 20/10/2026.
export default async function PageConfidentialite() {
  const {editeur:EDITEUR,indisponible}=await lireEditeur();
  // 29/09 : les droits ne s'exercent plus par le formulaire de devis de
  // l'accueil (une demande commerciale) : « Aide et retours » pour qui a un
  // compte, l'adresse de contact de l'éditeur pour tous, dès qu'elle est
  // fournie (lib/editeur.ts).
  const contact = courrielDeContact(EDITEUR);
  // 19/10 : la liste du code complétée par la saisie (localisation de la BAN).
  // La page n'affiche pas les coordonnées : sa réserve ne porte que sur les
  // localisations.
  const prestataires = prestatairesAvecFaits(EDITEUR);
  return (
    <CoquilleLegale
      titre="Confidentialité"
      chapo="Ce que nous faisons de vos données, et ce que nous n'en faisons pas."
      chemin="/confidentialite"
      incomplet={indisponible || confidentialiteIncomplete(EDITEUR) || prestatairesIncomplets(prestataires)}
      courriel={contact}
    >
      <p className="text-xs text-muted-foreground">Dernière mise à jour : 20 octobre 2026.</p>
      <Article titre="Votre interlocuteur">
        <p>
          Gerimmo est un service édité par <Fait valeur={EDITEUR.denomination} quoi="nom de l’éditeur" />,
          {" "}<Fait valeur={EDITEUR.forme} quoi="forme juridique" />,
          établi au <Fait valeur={EDITEUR.siege} quoi="adresse de l’éditeur" />.
        </p>
        <p>
          Pour toute question relative aux données personnelles :{" "}
          {contact ? <a href={`mailto:${contact}`} className="lien-texte">{contact}</a> : <AFournir quoi="adresse de contact de l'éditeur" />}.
          {EDITEUR.telephone && <> Téléphone : {EDITEUR.telephone}.</>}
        </p>
      </Article>
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
          Pour exercer vos droits sur ces données, adressez-vous à votre agence ou
          à votre propriétaire. De même, l’artisan détermine les usages de ses
          dossiers clients, interventions, devis et factures ; Gerimmo les traite
          pour son compte.
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

      <Article titre="Pourquoi, et sur quelle base légale">
        <p>
          Chaque traitement dont Gerimmo est responsable repose sur une base
          prévue par le règlement général sur la protection des données
          (article 6) :
        </p>
        <div className="tableau-defilant tableau-fiches">
          <table className="tableau">
            <thead>
              <tr>
                <th>Traitement</th>
                <th>Base légale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Création et gestion du compte, authentification, fourniture du service, support (« Aide et retours »)</td>
                <td data-libelle="Base légale">Exécution du contrat (conditions générales)</td>
              </tr>
              <tr>
                <td>Abonnement, encaissement et facturation</td>
                <td data-libelle="Base légale">Exécution du contrat ; conservation des factures : obligation légale</td>
              </tr>
              <tr>
                <td>Preuve de l&apos;acceptation des conditions générales (version et date)</td>
                <td data-libelle="Base légale">Intérêt légitime : pouvoir établir le contenu du contrat</td>
              </tr>
              <tr>
                <td>Sécurité du service : journaux techniques, journal d&apos;audit, consultations des pièces sensibles, second facteur</td>
                <td data-libelle="Base légale">Intérêt légitime : protéger le service et vos données</td>
              </tr>
              <tr>
                <td>Réponse aux demandes de contact envoyées depuis le site</td>
                <td data-libelle="Base légale">Intérêt légitime : répondre à la demande que vous avez faite</td>
              </tr>
              <tr>
                <td>Annuaire des artisans et suivi des interventions pour les propriétaires et gestionnaires</td>
                <td data-libelle="Base légale">Exécution du contrat conclu avec l&apos;artisan</td>
              </tr>
              <tr>
                <td>Journal public et sa diffusion sur la page Facebook de Gerimmo</td>
                <td data-libelle="Base légale">Intérêt légitime : informer le public ; des données techniques de consultation sont traitées pour la sécurité et la diffusion</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Le site n’installe pas de traceur publicitaire ni de mesure d’audience
          soumis au consentement. L’ajout d’un tel traceur nécessiterait votre
          accord préalable, retirable à tout moment.
        </p>
        <p>
          Pour les données de gestion locative, la base légale est déterminée
          par votre agence ou votre propriétaire bailleur, responsable de
          traitement (en général l&apos;exécution du bail ou du mandat, et les
          obligations légales qui s&apos;y attachent).
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
          intervenez pour des propriétaires ou gestionnaires : raison sociale, SIRET, métiers et zones
          d&apos;intervention, justificatifs déposés, comptes rendus
          d&apos;intervention, évaluations laissées par les clients. Une note
          contestée est réexaminée par une personne, jamais par un calcul seul.
        </p>
        <p>
          <b className="font-semibold">La facturation.</b> Les abonnements sont
          encaissés par Stripe : Gerimmo ne voit ni ne conserve votre numéro de
          carte. Il traite les identifiants de paiement, montants, factures,
          remboursements, frais et états nécessaires au suivi de votre abonnement.
        </p>
        <p>
          <b className="font-semibold">Le formulaire de contact.</b>{" "}
          Les coordonnées et le message que vous communiquez servent à traiter
          votre demande et à y répondre. Les demandes sont conservées au plus
          24 mois après leur dépôt.
        </p>
        <p>
          <b className="font-semibold">Ce que Gerimmo ne fait pas.</b> Il ne lit
          aucun compte bancaire, ne revend aucune donnée, n&apos;affiche aucune
          publicité et n&apos;installe aucun traceur de mesure d&apos;audience.
          Les cookies nécessaires à l’authentification permettent de tenir
          votre session ouverte. La consultation du site génère aussi des
          données techniques, notamment l’adresse IP et des journaux d’erreurs.
        </p>
      </Article>

      <Article titre="Collecte, destinataires et assistance automatisée">
        <p>
          Les données proviennent de vos saisies, des documents déposés et des
          personnes qui gèrent votre dossier (propriétaire, locataire, garant,
          artisan ou gestionnaire). Les champs signalés obligatoires sont
          nécessaires à l’action demandée ; sans eux, elle ne peut pas aboutir.
          Les autres champs peuvent être laissés vides.
        </p>
        <p>
          Les informations sont accessibles aux personnes habilitées dans
          chaque dossier, selon leur rôle, ainsi qu’aux prestataires nécessaires
          au service. Une invitation à signer transmet à Zoho Sign le document,
          le nom, l’e-mail et le téléphone du signataire ; Zoho assure la
          vérification par SMS et produit les preuves de signature.
        </p>
        <p>
          Les propositions de devis assistées par intelligence artificielle
          restent des brouillons que l’artisan examine, modifie et valide.
          Les traitements décrits ici ne prennent pas seuls de décision
          d’attribution d’un logement ou d’engagement contractuel.
        </p>
        <p>
          Les interactions sur la page Facebook de Gerimmo relèvent aussi de
          la politique de Meta, notamment pour les statistiques de page.
          Stripe traite certaines données pour ses propres obligations de
          paiement et de lutte contre la fraude. Leurs informations officielles
          figurent dans le tableau ci-dessous.
        </p>
      </Article>

      <Article titre="Brouillons conservés sur votre appareil">
        <p>
          Pour éviter de perdre une saisie, certains formulaires conservent
          une copie locale de leurs champs et fichiers dans votre navigateur
          (localStorage ou IndexedDB). Les brouillons de lot, fiche personne,
          incident et devis expirent après sept jours : ils sont effacés au
          prochain contrôle par l’application ou à la déconnexion effective.
          Ce stockage local ne constitue pas un enregistrement du dossier sur
          les serveurs.
        </p>
        <p>
          Les relevés d’état des lieux hors ligne non encore synchronisés sont
          conservés et signalés pour éviter leur perte ; les copies synchronisées
          peuvent être effacées à la déconnexion. La mémorisation d’une quittance
          dans l’outil public dépend de votre choix. Sur un appareil partagé,
          déconnectez-vous et vérifiez qu’aucune saisie non synchronisée ne reste
          avant de laisser l’appareil à une autre personne.
        </p>
      </Article>

      <Article titre="Où vos données sont hébergées, et qui y accède">
        <p>
          La base de données, le stockage principal des fichiers et les fonctions
          serveur de l’application sont configurés dans des{" "}
          <b className="font-semibold">régions de l&apos;Union européenne</b>{" "}
          (Paris). La diffusion du site, l’assistance et certaines opérations des
          prestataires peuvent intervenir dans d’autres pays. Plusieurs prestataires sont des
          sociétés établies hors de l&apos;Union, notamment aux États-Unis, ou
          rattachées à des sociétés qui le sont. Les sauvegardes quotidiennes
          sont produites et chiffrées par un service d&apos;automatisation
          situé aux États-Unis (GitHub Actions), sur les machines duquel les
          données transitent le temps du chiffrement ; la copie chiffrée est
          ensuite stockée à Paris. La colonne « Localisation » le dit pour
          chaque prestataire, et la colonne « Rôle » précise ce qui lui est
          transmis, et seulement cela.
        </p>
        <p>
          <b className="font-semibold">Garanties des transferts.</b> Lorsque
          des données sont transférées ou accessibles hors de l&apos;Union,
          le transfert est encadré par les clauses contractuelles types de la
          Commission européenne et/ou par la certification du prestataire au
          Data Privacy Framework UE–États-Unis, selon le prestataire et le
          transfert concerné. Les politiques et accords des prestataires sont
          accessibles par leurs liens officiels ci-dessous. Vous pouvez nous
          demander des précisions ou une copie des garanties applicables à
          l’adresse de contact indiquée en tête de page.
        </p>
        {/* La même liste que les mentions légales (lib/editeur.ts). */}
        <TableauPrestataires prestataires={prestataires} />
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
          Le tableau décrit les durées paramétrées dans le service. Au terme,
          les traitements de conservation prévoient une suppression ou une
          anonymisation selon la catégorie. Ces durées ne constituent pas une
          obligation légale de conserver toutes les pièces jusque-là : le
          responsable du dossier doit limiter la conservation à ce qui est
          nécessaire et traiter les demandes de suppression justifiées.
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
              <tr>
                <td>Factures d&apos;abonnement émises par Gerimmo</td>
                <td>10 ans (obligation légale)</td>
                <td>Émission</td>
              </tr>
              <tr>
                <td>Preuve de l&apos;acceptation des conditions générales</td>
                <td>Durée du contrat, puis 5 ans</td>
                <td>Fin du contrat</td>
              </tr>
              <tr>
                <td>Compte et données de l&apos;organisation cliente</td>
                <td>Tant que le compte existe (article 9 des conditions générales)</td>
                <td>Ouverture du compte</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          La conservation comptable obligatoire des factures est de dix ans.
          Les autres durées dépendent de la finalité et du dossier ; une durée
          de cinq ans ne correspond pas à une prescription uniforme de tous les
          baux. Un besoin de preuve ou un contentieux peut justifier un archivage
          limité des seuls éléments nécessaires. Les sauvegardes techniques
          chiffrées sont conservées 90 jours avant rotation ; une suppression
          du dossier courant ne les efface pas immédiatement.
        </p>
        <p>
          <b className="font-semibold">Votre compte.</b> Comme le prévoit
          l&apos;article 9 des{" "}
          <Link href="/conditions" className="lien-texte">
            conditions générales
          </Link>
          , le compte et ses données sont conservés tant que le compte existe.
          À la fin de l&apos;essai ou de l&apos;abonnement, ils restent
          consultables et exportables en lecture seule : rien n&apos;est
          supprimé automatiquement du fait de cette fin, en dehors des durées
          propres aux pièces listées ci-dessus. Vous pouvez demander la
          suppression de votre compte à tout moment, après avoir exporté ce
          que vous souhaitez garder.
        </p>
      </Article>

      <Article titre="Comment vos données sont protégées">
        <ul className="list-disc space-y-1 pl-5">
          <li>Chiffrement en transit et au repos, base, fichiers et sauvegardes compris.</li>
          <li>
            Cloisonnement par organisation appliqué dans la base de données
            elle-même, afin de limiter chaque compte aux données autorisées.
          </li>
          <li>
            Mot de passe de douze caractères au moins, vérifié contre les fuites
            de données connues ; second facteur disponible pour tous, obligatoire
            pour la supervision.
          </li>
          <li>
            Les documents privés sont soumis à un contrôle des droits et leur
            téléchargement utilise des liens à durée limitée. Les éléments
            destinés à être publics, tels que les logos ou illustrations du
            Journal, suivent un accès public. La consultation des pièces
            sensibles est tracée.
          </li>
        </ul>
        <p>
          En cas de violation de données susceptible de vous concerner, Gerimmo
          en informe l’organisation responsable sans délai indu. Lorsque
          Gerimmo est responsable du traitement, il notifie la CNIL dans les
          72 heures après en avoir pris connaissance si la violation présente
          un risque ; il informe les personnes en cas de risque élevé, dans les
          conditions prévues par le RGPD.
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
          (<b className="font-semibold">portabilité</b>), selon les conditions
          prévues par le RGPD pour chacun de ces droits. Vous pouvez également
          définir des directives relatives au sort de vos données après votre décès.
        </p>
        <p>
          L&apos;effacement connaît des limites que la loi impose : un bail en
          cours, un impayé non soldé, un contentieux ou une écriture comptable
          peuvent justifier de conserver certains éléments nécessaires, avec
          un accès limité. Chaque demande est examinée selon sa situation ;
          elle n’entraîne pas automatiquement la suppression de toutes les pièces.
        </p>
        <p>
          <b className="font-semibold">À qui écrire.</b> Pour votre dossier de
          gestion locative, à votre agence ou à votre propriétaire bailleur,
          depuis la messagerie de votre espace. Pour votre compte, la
          facturation, l&apos;annuaire des artisans ou une demande envoyée
          depuis le site, à Gerimmo : si vous avez un compte, depuis la page{" "}
          <Link href="/assistance" className="lien-texte">
            « Aide et retours »
          </Link>{" "}
          de votre espace, en précisant « données personnelles » ; dans tous
          les cas, à l&apos;adresse{" "}
          {contact ? (
            <a href={`mailto:${contact}?subject=${encodeURIComponent("Données personnelles")}`} className="lien-texte">
              {contact}
            </a>
          ) : (
            <AFournir quoi="adresse de contact de l'éditeur" />
          )}
          . Une réponse est apportée dans un délai d’un mois. En cas de demande
          complexe ou nombreuse, ce délai peut être prolongé de deux mois ; les
          raisons vous sont communiquées durant le premier mois. Un justificatif
          d’identité n’est demandé qu’en cas de doute raisonnable, dans la mesure
          nécessaire pour confirmer votre identité.
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez
          saisir la Commission nationale de l&apos;informatique et des libertés
          (CNIL), notamment par son service de{" "}
          <a href="https://www.cnil.fr/fr/plaintes" className="lien-texte" rel="noreferrer">
            réclamation en ligne
          </a>
          .
        </p>
      </Article>
    </CoquilleLegale>
  );
}
