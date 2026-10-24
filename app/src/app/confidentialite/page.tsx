import type { ReactNode } from "react";
import { lireDureesPubliques } from "@/lib/conservation-publique";
import { DureesActuelles, ReferenceConservation } from "@/components/conservation-publique";
import { lireEditeur } from "@/lib/editeur-serveur";
import Link from "next/link";
import { AFournir, Article, CoquilleLegale, Fait, TableauPrestataires } from "@/components/coquille-legale";
import { CONDITIONS_DATE, courrielDeContact, confidentialiteIncomplete, prestatairesAvecFaits, prestatairesIncomplets } from "@/lib/editeur";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Confidentialité — Gerimmo",
  description:
    "Quelles données Gerimmo traite, sur quelle base légale, où elles sont hébergées, combien de temps elles sont conservées et comment exercer vos droits.",
  chemin: "/confidentialite",
});

/** Un tableau des durées de conservation : Données | Durée | À partir de. */
function TableauDurees({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <>
      <h3 className="pt-2 font-semibold">{titre}</h3>
      <div className="tableau-defilant">
        <table className="tableau">
          <thead>
            <tr>
              <th>Données</th>
              <th>Durée</th>
              <th>À partir de</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  );
}

// Version publiée avec la V1 des conditions (plan de conformité du 23/10/2026, lot 4 ; décisions du dirigeant du 23/10 :
// offre aux seuls propriétaires gérant leurs biens, éditeur non commerçant, signature du cautionnement et de l'état des
// lieux dans Gerimmo, aucun DPO désigné, violation notifiée « dans les meilleurs délais »). Les sources juridiques
// (Légifrance, CNIL) n'ont pas pu être ouvertes le 23/10/2026 : rien de cette page n'a été relu par un juriste.
//
// Le tableau « Combien de temps » a son miroir machine dans tests/fixtures/durees-conservation.ts : une ligne ajoutée ou
// une durée changée ici doit l'être aussi là-bas (tests/durees-conservation.test.ts, qui compare aussi la base).
export default async function PageConfidentialite() {
  const conservation = await lireDureesPubliques();
  const dureeCourante = (categorie: string, reference: string) => {
    const r = conservation.regles.find(r => r.data_type === categorie);
    return r && r.duree_mois !== r.duree_initiale_mois ? `${r.duree_mois} mois` : reference;
  };
  const conservationModifiee = conservation.indisponible || conservation.regles.some(r => r.duree_mois !== r.duree_initiale_mois);
  const {editeur:EDITEUR,indisponible}=await lireEditeur();
  // 29/09 : les droits ne s'exercent plus par le formulaire de devis de
  // l'accueil (une demande commerciale) : « Aide et retours » pour qui a un
  // compte, l'adresse de contact de l'éditeur pour tous, dès qu'elle est
  // fournie (lib/editeur.ts).
  const contact = courrielDeContact(EDITEUR);
  // 19/10 : la liste du code complétée par la saisie (localisation de la BAN).
  // La page n'affiche pas les coordonnées : sa réserve ne porte que sur les
  // localisations.
  // 23/10 (plan du 23/10, lot 4) : l'ancienne intégration Yousign, inactive (aucun circuit en production), sort de la
  // liste publique ; elle reste dans PRESTATAIRES, dont dépendent les clés de saisie de /admin/parametres.
  const prestataires = prestatairesAvecFaits(EDITEUR).filter((p) => p.cle !== "yousign");
  const adresseContact = contact ? <a href={`mailto:${contact}`} className="lien-texte">{contact}</a> : <AFournir quoi="adresse de contact de l'éditeur" />;
  return (
    <CoquilleLegale
      titre="Confidentialité"
      chapo="Ce que nous faisons de vos données, et ce que nous n'en faisons pas."
      chemin="/confidentialite"
      incomplet={indisponible || confidentialiteIncomplete(EDITEUR) || prestatairesIncomplets(prestataires)}
      courriel={contact}
    >
      {/* La page paraît avec la V1 des conditions : même date (lib/editeur.ts). À la prochaine version des conditions qui
          ne touche pas cette page, écrire ici sa propre date en toutes lettres. */}
      <p className="text-xs text-muted-foreground">Dernière mise à jour : {CONDITIONS_DATE}.</p>
      <Article titre="Votre interlocuteur">
        <p>
          Gerimmo est un service édité par <Fait valeur={EDITEUR.denomination} quoi="nom de l’éditeur" />,
          {" "}<Fait valeur={EDITEUR.forme} quoi="forme juridique" />,
          établi au <Fait valeur={EDITEUR.siege} quoi="adresse de l’éditeur" /> (« l&apos;Éditeur »).
        </p>
        <p>
          Pour toute question relative aux données personnelles : {adresseContact}.
          {EDITEUR.telephone && <> Téléphone : {EDITEUR.telephone}.</>}
        </p>
        <p>
          <b className="font-semibold">Délégué à la protection des données.</b>{" "}
          L&apos;Éditeur n&apos;a pas désigné de délégué à la protection des données ; son dirigeant est le
          référent pour ces questions. Pour toute question sur vos données, écrivez à {adresseContact} ou utilisez
          la page{" "}
          <Link href="/compte/donnees" className="lien-texte">
            « Mes données personnelles »
          </Link>{" "}
          de votre compte.
        </p>
      </Article>
      <Article titre="Qui est responsable de quoi">
        <p>
          Gerimmo est un logiciel de gestion locative destiné aux propriétaires
          bailleurs qui gèrent eux-mêmes leurs biens. Deux situations se
          présentent, et elles n&apos;engagent pas les mêmes personnes.
        </p>
        <p>
          <b className="font-semibold">Les données de votre dossier de gestion
          locative</b> — bail, pièces, loyers, quittances, incidents, messages —
          sont traitées <b className="font-semibold">pour le compte du
          propriétaire bailleur</b> qui gère le bien, client de Gerimmo et
          responsable de ce traitement. Gerimmo n&apos;en est que le
          sous-traitant (annexe 1 des{" "}
          <Link href="/conditions" className="lien-texte">conditions générales</Link>) :
          il les héberge et les met en forme, il n&apos;en décide pas l&apos;usage.
          Si vous êtes locataire, caution ou signataire d&apos;un document, adressez-vous
          à votre propriétaire pour exercer vos droits sur ces données. De même,
          l’artisan détermine les usages des dossiers de ses clients externes, de
          ses chantiers, devis, factures et règlements ; Gerimmo les traite pour
          son compte (annexe des conditions de l&apos;espace artisan).
        </p>
        <p>
          <b className="font-semibold">Les données de plateforme</b> — votre
          compte de connexion et son authentification, que vous soyez
          propriétaire, locataire, caution ou artisan ; la facturation des
          abonnements et la preuve de votre contrat ; l&apos;annuaire des artisans,
          leurs évaluations et leurs exclusions ; les demandes de contact et le
          suivi commercial ; la liste d&apos;attente des agences ; les retours et
          les demandes envoyés depuis le site — sont traitées{" "}
          <b className="font-semibold">par Gerimmo, en tant que responsable de
          traitement</b>. Pour celles-là, écrivez-nous directement.
        </p>
        <p>
          <b className="font-semibold">Artisans.</b> Pour l&apos;inscription, la
          validation, la note, les indicateurs de fiabilité et l&apos;exclusion des
          artisans, l&apos;Éditeur est responsable de traitement. Base légale :
          exécution des conditions de l&apos;espace artisan. La note est calculée
          automatiquement à partir des évaluations ; l&apos;artisan peut contester
          une évaluation et obtenir son réexamen par un membre de l&apos;équipe.
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
                <td>Création et gestion du compte des propriétaires et des artisans, authentification, fourniture du service, support (« Aide et retours »)</td>
                <td data-libelle="Base légale">Exécution du contrat (conditions générales, ou conditions de l&apos;espace artisan)</td>
              </tr>
              <tr>
                <td>Compte de connexion des locataires, cautions et autres personnes invitées par un propriétaire, qui ne contractent pas avec Gerimmo</td>
                <td data-libelle="Base légale">Intérêt légitime : leur ouvrir l&apos;accès que le propriétaire leur donne, et le sécuriser</td>
              </tr>
              <tr>
                <td>Abonnement, encaissement et facturation</td>
                <td data-libelle="Base légale">Exécution du contrat ; conservation des factures : obligation légale (livre des procédures fiscales, art. L. 102 B)</td>
              </tr>
              <tr>
                <td>Preuve de votre contrat : texte et version des conditions acceptées, dates d&apos;acceptation et d&apos;abonnement</td>
                <td data-libelle="Base légale">Obligation légale de conserver les contrats conclus par voie électronique d&apos;au moins 120 € (art. L. 213-1 du code de la consommation) ; intérêt légitime dans les autres cas</td>
              </tr>
              <tr>
                <td>Rétractation, résiliation et réclamations : accusés de réception, suivi et renvoi au médiateur de la consommation</td>
                <td data-libelle="Base légale">Obligation légale (code de la consommation) ; exécution du contrat</td>
              </tr>
              <tr>
                <td>Demandes d&apos;exercice de vos droits, y compris la fermeture de votre compte</td>
                <td data-libelle="Base légale">Obligation légale (règlement général sur la protection des données, articles 12 à 22)</td>
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
                <td>Suivi commercial des professionnels qui nous interrogent sur nos offres, et des particuliers qui l&apos;ont accepté</td>
                <td data-libelle="Base légale">Intérêt légitime (professionnels) ; consentement (particuliers)</td>
              </tr>
              <tr>
                <td>Respect de votre opposition à la prospection (empreinte de l&apos;adresse seule)</td>
                <td data-libelle="Base légale">Intérêt légitime : ne plus vous écrire, durablement</td>
              </tr>
              <tr>
                <td>Liste d&apos;attente des agences : vous prévenir de l&apos;ouverture de l&apos;offre aux agences, à votre demande</td>
                <td data-libelle="Base légale">Intérêt légitime : donner suite à la demande que vous avez faite</td>
              </tr>
              {/* Relecture du 23/10 : la liste d'attente des propriétaires (table `liste_attente`, registre P10, sort encore
                  ouvert : décision 11 du plan) avait une durée sans base ni description. Même base que la liste des
                  agences, par analogie (plan, lot 4) : qualification à relire par un juriste. */}
              <tr>
                <td>Liste d&apos;attente des propriétaires : vous prévenir de l&apos;ouverture du service, à votre demande</td>
                <td data-libelle="Base légale">Intérêt légitime : donner suite à la demande que vous avez faite</td>
              </tr>
              <tr>
                <td>Inscription, validation, note, indicateurs de fiabilité et exclusion des artisans ; annuaire et suivi des interventions pour les propriétaires</td>
                <td data-libelle="Base légale">Exécution des conditions de l&apos;espace artisan</td>
              </tr>
              <tr>
                <td>Journal public et sa diffusion sur la page Facebook de Gerimmo</td>
                <td data-libelle="Base légale">Intérêt légitime : informer le public ; des données techniques de consultation sont traitées pour la sécurité et la diffusion</td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Plan du 23/10, constat R63 : les témoins nommés un à un. `gerimmo_inscription` n'est plus déposé (seulement
            effacé chez les anciens visiteurs) : il n'est pas cité. Durées vérifiées le 23/10 dans le code :
            @supabase/ssr (maxAge de 400 jours), lib/session-policy.ts et proxy.ts (cookie de session, sans maxAge),
            lib/jeton-confirmation.ts (15 minutes). */}
        <p>
          <b className="font-semibold">Témoins (cookies).</b> Le site ne dépose
          que des témoins nécessaires à son fonctionnement, exemptés de
          consentement : sb-…-auth-token (Supabase), qui garde votre session
          ouverte ; il peut rester jusqu&apos;à 400 jours dans votre navigateur,
          mais la session expire après une période d&apos;inactivité et une durée
          maximale fixées selon votre rôle ; gerimmo-derniere-activite, qui mesure
          l&apos;inactivité pour vous déconnecter, effacé à la fermeture du
          navigateur ; gerimmo_confirmation, qui sécurise la confirmation de votre
          adresse, 15 minutes. Aucun témoin publicitaire ni de mesure
          d&apos;audience n&apos;est déposé.
        </p>
        <p>
          Pour les données de gestion locative, la base légale est déterminée
          par le propriétaire bailleur, responsable de traitement (en général
          l&apos;exécution du bail et les obligations légales qui s&apos;y
          attachent).
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
          vous êtes locataire, caution ou propriétaire : identité et coordonnées,
          pièces du dossier (identité, revenus, imposition, attestations
          d&apos;assurance), bail et états des lieux, loyers appelés et réglés,
          quittances, incidents déclarés et leurs photos, échanges avec le
          propriétaire.
        </p>
        <p>
          <b className="font-semibold">Votre fiche d&apos;artisan</b>, si vous
          intervenez pour des propriétaires : raison sociale, SIRET, métiers et zones
          d&apos;intervention, justificatifs déposés, comptes rendus
          d&apos;intervention, évaluations laissées par les clients, note et
          indicateurs de fiabilité. Une note contestée est réexaminée par une
          personne, jamais par un calcul seul.
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
          votre demande et à y répondre. Les demandes sont conservées {dureeCourante("contact:devis", "24 mois")}
          après leur dernier traitement, ou après leur dépôt si elles
          n&apos;ont pas encore été traitées, puis supprimées.
        </p>
        <p>
          <b className="font-semibold">Le suivi commercial.</b> Si vous êtes un
          professionnel et que vous nous interrogez sur nos offres, par le
          formulaire de contact, lors d&apos;un échange direct ou après la
          recommandation d&apos;un tiers, nous pouvons garder vos coordonnées et
          l&apos;historique de nos échanges pour y donner suite.
          Un particulier n&apos;est suivi ainsi que s&apos;il l&apos;a accepté :
          nous n&apos;adressons aucun courriel commercial à un particulier sans
          son consentement. Chacun de nos messages permet de s&apos;y opposer :
          répondez « Stop », et nous supprimons vos coordonnées dans le mois, en
          ne gardant qu&apos;une empreinte de votre adresse pour ne plus vous
          écrire. Sans opposition, ces données sont supprimées {dureeCourante("contact:prospect", "trois ans")} après
          votre dernier contact.
        </p>
        <p>
          <b className="font-semibold">La liste d&apos;attente des agences.</b>{" "}
          Les informations transmises depuis la page « Agences de gestion »
          (nom de l&apos;agence, nom du contact, adresse électronique,
          téléphone si vous l&apos;indiquez, code postal de l&apos;agence,
          tranche du nombre de lots gérés, message si vous en laissez un), la
          page du site d&apos;où vient l&apos;inscription et sa date,
          l&apos;état de notre suivi (en attente, contactée, devenue cliente,
          retirée à votre demande), puis la date à laquelle nous vous avons
          prévenu, servent uniquement à vous prévenir de l&apos;ouverture de
          l&apos;offre aux agences et à donner suite à vos réponses. Elles ne
          servent à aucune autre sollicitation. Vous pouvez vous y opposer à
          tout moment ; elles sont supprimées {dureeCourante("contact:attente_agences", "trois ans")} après votre inscription,
          dans le mois de votre demande de retrait, ou trois mois après la
          souscription si votre agence devient cliente.
        </p>
        <p>
          <b className="font-semibold">La liste d&apos;attente des propriétaires.</b>{" "}
          L&apos;adresse électronique laissée pour être prévenu de l&apos;ouverture
          du service, le nombre de vos biens si vous l&apos;avez indiqué, la page
          d&apos;où vient l&apos;inscription et sa date servent uniquement à vous
          prévenir de cette ouverture. Vous pouvez vous y opposer à tout moment ;
          elles sont supprimées {dureeCourante("contact:attente", "trois ans")} après votre inscription.
        </p>
        <p>
          <b className="font-semibold">Ce que Gerimmo ne fait pas.</b> Il ne lit
          aucun compte bancaire, ne revend aucune donnée, n&apos;affiche aucune
          publicité et n&apos;installe aucun traceur de mesure d&apos;audience.
          La consultation du site génère des données techniques, notamment
          l’adresse IP et des journaux d’erreurs.
        </p>
      </Article>

      <Article titre="Collecte, destinataires et assistance automatisée">
        <p>
          Les données proviennent de vos saisies, des documents déposés et des
          personnes qui interviennent dans votre dossier (propriétaire, locataire,
          caution, artisan). Les champs signalés obligatoires sont
          nécessaires à l’action demandée ; sans eux, elle ne peut pas aboutir.
          Les autres champs peuvent être laissés vides.
        </p>
        <p>
          Les informations sont accessibles aux personnes habilitées dans
          chaque dossier, selon leur rôle, ainsi qu’aux prestataires nécessaires
          au service, listés ci-dessous. Une invitation à signer, envoyée à la
          demande du propriétaire, transmet à Zoho Sign le document, le nom,
          l’adresse électronique et le numéro de mobile du signataire ; pour un
          acte de cautionnement, ce numéro est celui que la caution a saisi
          elle-même depuis le lien qu&apos;elle a reçu. Zoho envoie le code à usage
          unique par SMS et produit le certificat de réalisation, commun à tous
          les signataires.
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
        {/* Plan du 23/10 (décision 12, section 5) : la certification d'OpenAI et de GitHub au cadre UE–États-Unis n'a pas
            été vérifiée. La page ne s'en prévaut donc pas ; pour eux, seules les clauses contractuelles types sont
            citées (relecture du 23/10 : sans aveu public de non-vérification). La phrase suppose leurs accords de
            traitement des données acceptés et conservés (décision 12 du plan). */}
        <p>
          <b className="font-semibold">Garanties des transferts.</b> Lorsque
          des données sont transférées ou accessibles hors de l&apos;Union
          européenne (prestataires signalés dans le tableau), le transfert est
          encadré par une décision d&apos;adéquation de la Commission européenne,
          notamment le cadre de protection des données UE–États-Unis (Data Privacy
          Framework) pour un prestataire certifié, ou par les clauses
          contractuelles types de la Commission européenne. Pour OpenAI et
          GitHub, le transfert repose sur les clauses contractuelles types de la
          Commission européenne, intégrées à leurs accords de traitement des
          données. Les politiques et accords des prestataires sont accessibles
          par leurs liens officiels ci-dessous. Vous pouvez nous demander des
          précisions ou une copie des garanties applicables à l’adresse de
          contact indiquée en tête de page.
        </p>
        <p>
          <b className="font-semibold">Base Adresse Nationale.</b> Ce service
          public n&apos;est pas un prestataire de Gerimmo : votre navigateur
          l&apos;appelle directement pour compléter l&apos;adresse d&apos;un bien,
          et il reçoit le texte tapé et l&apos;adresse IP de votre connexion. Il
          figure dans le tableau pour que vous le sachiez.
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
        <DureesActuelles {...conservation} />
        <ReferenceConservation modifiee={conservationModifiee}>
        <p>
          Les tableaux décrivent les durées paramétrées dans le service. Au terme,
          les traitements de conservation prévoient une suppression des fichiers et un
          allègement des fiches selon la catégorie. Une fiche qui reste rattachable à un dossier n’est pas considérée comme anonyme. Ces durées ne constituent pas une
          obligation légale de conserver toutes les pièces jusque-là : le
          responsable du dossier doit limiter la conservation à ce qui est
          nécessaire et traiter les demandes de suppression justifiées. Le
          propriétaire est prévenu dans son espace trente jours avant la
          suppression des pièces rattachées à un bail, et quinze jours avant
          celle des pièces d&apos;une personne rattachée à aucun bail.
        </p>
        <TableauDurees titre="Comptes">
          <tr>
            <td>Compte et données de l’organisation cliente</td>
            <td>Tant que le compte est utilisé ; suppression vingt-quatre mois après la plus tardive de ces deux dates, après deux avertissements par courriel (deux mois puis quinze jours avant)</td>
            <td>La plus tardive des deux : dernière connexion d’un utilisateur du compte, fin du dernier abonnement payé</td>
          </tr>
          <tr>
            <td>Compte de connexion d’un locataire, d’une caution ou d’un artisan</td>
            <td>24 mois après la dernière connexion, après deux avertissements ; les informations du dossier d’un propriétaire restent sous sa responsabilité</td>
            <td>Dernière connexion</td>
          </tr>
          <tr>
            <td>Comptes créés pour une invitation et jamais activés</td>
            <td>3 mois, puis suppression</td>
            <td>Fin de validité, refus ou annulation de la dernière invitation</td>
          </tr>
          <tr>
            <td>Inscriptions jamais confirmées</td>
            <td>1 mois, puis suppression</td>
            <td>Création de l’inscription</td>
          </tr>
          <tr>
            <td>Invitations (locataires, artisans)</td>
            <td>3 mois, puis suppression</td>
            <td>Fin de validité, refus ou annulation</td>
          </tr>
        </TableauDurees>
        <TableauDurees titre="Dossiers de location">
          <tr>
            <td>Pièces du dossier locataire (identité, revenus, imposition)</td>
            <td>Pendant le bail, puis 3 ans, puis suppression ; un litige signalé suspend le délai</td>
            <td>Fin du dernier bail et clôture de ses comptes</td>
          </tr>
          <tr>
            <td>Baux et états des lieux</td>
            <td>Pendant le bail, puis 3 ans, puis retrait du fichier et allègement de la fiche ; un litige signalé suspend le délai</td>
            <td>Fin du bail et clôture des comptes</td>
          </tr>
          <tr>
            <td>Attestations d’assurance, courriers, règlements de copropriété et autres documents d’un bail</td>
            <td>Pendant le bail, puis 3 ans, puis suppression</td>
            <td>Fin du bail et clôture des comptes</td>
          </tr>
          <tr>
            <td>Autres documents non rattachés à un bail</td>
            <td>5 ans, puis suppression</td>
            <td>Dépôt</td>
          </tr>
          <tr>
            <td>Quittances</td>
            <td>Pendant le bail, puis 3 ans, puis retrait du fichier et allègement de la fiche ; vous êtes prévenu 30 jours avant</td>
            <td>Fin du bail et clôture des comptes (10 ans après l’émission si aucun bail n’est rattaché)</td>
          </tr>
          <tr>
            <td>Mandats de gestion</td>
            <td>5 ans, puis retrait du fichier et allègement de la fiche</td>
            <td>Fin du mandat</td>
          </tr>
          <tr>
            <td>Diagnostics du bien</td>
            <td>5 ans, puis suppression</td>
            <td>Fin de gestion du bien</td>
          </tr>
          <tr>
            <td>Rapports de gestion et factures d’honoraires (agences)</td>
            <td>10 ans, puis retrait du fichier</td>
            <td>Émission</td>
          </tr>
          <tr>
            <td>Pièces d’une personne sans bail (candidature non retenue, dossier abandonné)</td>
            <td>3 mois, puis suppression ; vous êtes prévenu 15 jours avant</td>
            <td>Dernier dépôt de pièce</td>
          </tr>
          <tr>
            <td>Fiche de la personne (identité, coordonnées) et historique des paiements</td>
            <td>Pendant le bail, puis 3 ans, puis retrait des informations nominatives</td>
            <td>Fin du dernier bail et clôture des comptes</td>
          </tr>
          <tr>
            <td>Messages de la location</td>
            <td>Pendant le bail, puis 2 ans, puis suppression</td>
            <td>Fin du dernier bail et clôture des comptes</td>
          </tr>
          <tr>
            <td>Incidents</td>
            <td>2 ans, puis retrait des informations nominatives</td>
            <td>Clôture de l’incident</td>
          </tr>
          <tr>
            <td>Photos d’incident</td>
            <td>2 ans, puis suppression</td>
            <td>Clôture de l’incident</td>
          </tr>
          <tr>
            <td>Documents signés électroniquement, annexes et certificats</td>
            <td>Durée de l’acte signé : pendant le bail, puis 3 ans ; un litige signalé suspend le délai</td>
            <td>Fin du bail et clôture des comptes</td>
          </tr>
          <tr>
            <td>Devis et factures d’artisans</td>
            <td>Tant que le compte existe ; durée propre en cours de définition</td>
            <td>Dépôt</td>
          </tr>
          <tr>
            <td>Demandes de congé envoyées depuis l’espace locataire, une fois traitées</td>
            <td>2 ans, puis suppression</td>
            <td>Traitement de la demande</td>
          </tr>
          <tr>
            <td>Alertes traitées</td>
            <td>1 an, puis suppression</td>
            <td>Fermeture de l’alerte</td>
          </tr>
        </TableauDurees>
        <TableauDurees titre="Artisans">
          <tr>
            <td>Évaluations des artisans</td>
            <td>3 ans, puis suppression</td>
            <td>Dépôt de l’évaluation</td>
          </tr>
          <tr>
            <td>Contestation d’une évaluation d’artisan</td>
            <td>3 ans, puis suppression</td>
            <td>Clôture de la contestation</td>
          </tr>
          <tr>
            <td>Motif d’exclusion d’un artisan</td>
            <td>3 ans pour une exclusion propre à un espace client, 5 ans pour une exclusion du réseau, puis suppression du motif et fin de la mesure</td>
            <td>Décision d’exclusion</td>
          </tr>
        </TableauDurees>
        <TableauDurees titre="Aide, demandes et journaux">
          <tr>
            <td>Signalements de problème (Aide et retours)</td>
            <td>6 mois, puis suppression</td>
            <td>Date du signalement</td>
          </tr>
          <tr>
            <td>Questions et idées envoyées depuis « Aide et retours »</td>
            <td>24 mois, puis suppression</td>
            <td>Dernier échange</td>
          </tr>
          <tr>
            <td>Demandes sur vos données personnelles et nos réponses, y compris la trace d’une fermeture de compte</td>
            <td>3 ans, puis suppression</td>
            <td>Clôture de la demande</td>
          </tr>
          <tr>
            <td>Liste des effacements à rejouer après la restauration d’une sauvegarde</td>
            <td>4 mois, puis suppression</td>
            <td>Exécution de la fermeture</td>
          </tr>
          <tr>
            <td>Registres des automatismes et gestes de la supervision (consignes, arrêts)</td>
            <td>6 mois, puis suppression</td>
            <td>Création de l’entrée</td>
          </tr>
          <tr>
            <td>Journal technique (connexions, erreurs)</td>
            <td>6 mois</td>
            <td>Événement</td>
          </tr>
          <tr>
            <td>Journal des consultations de pièces</td>
            <td>1 an</td>
            <td>Consultation</td>
          </tr>
          <tr>
            <td>Demandes de lien de connexion et tentatives de confirmation</td>
            <td>1 jour, puis suppression</td>
            <td>Demande</td>
          </tr>
          <tr>
            <td>Journal d’audit (actions sensibles)</td>
            <td>1 an ; 3 ans pour les accès et effacements ; 10 ans pour les preuves du contrat</td>
            <td>Action</td>
          </tr>
        </TableauDurees>
        <TableauDurees titre="Contacts, listes d’attente et prospection">
          <tr>
            <td>Demandes de devis reçues depuis le site</td>
            <td>24 mois, puis suppression</td>
            <td>Dernier traitement ou dépôt si la demande n’a pas encore été traitée</td>
          </tr>
          <tr>
            <td>Liste d’attente des agences</td>
            <td>Au plus trois ans, puis suppression ; dans le mois de votre demande de retrait ; trois mois après la souscription si votre agence devient cliente</td>
            <td>Inscription</td>
          </tr>
          <tr>
            <td>Liste d’attente des propriétaires</td>
            <td>3 ans, puis suppression</td>
            <td>Inscription</td>
          </tr>
          <tr>
            <td>Opposition à la prospection (empreinte de l’adresse seule)</td>
            <td>3 ans, puis suppression</td>
            <td>Opposition</td>
          </tr>
          <tr>
            <td>Suivi commercial (professionnels, et particuliers qui l’ont accepté)</td>
            <td>3 ans, puis suppression, ou dès votre opposition</td>
            <td>Votre dernier contact</td>
          </tr>
        </TableauDurees>
        <TableauDurees titre="Contrat, paiement et facturation">
          <tr>
            <td>Preuve de votre contrat (texte et version des conditions acceptées, dates d’acceptation et d’abonnement)</td>
            <td>10 ans, puis suppression ; supprimée avec le compte si aucun abonnement payant n’a été souscrit</td>
            <td>Fin du dernier abonnement payé</td>
          </tr>
          <tr>
            <td>Preuve d’une rétractation</td>
            <td>10 ans, puis suppression, même après la fermeture du compte</td>
            <td>Date de la rétractation</td>
          </tr>
          <tr>
            <td>Factures d’abonnement émises par Gerimmo</td>
            <td>Au moins 6 ans (obligation fiscale : livre des procédures fiscales, art. L. 102 B), chez notre prestataire de paiement, selon sa propre politique de conservation ; la copie jointe à la preuve du contrat d’un compte fermé est supprimée six ans après la fin de l’exercice de la facture, puis suppression</td>
            <td>Émission ; pour la copie jointe à la preuve du contrat, fin de l’exercice de la facture (à défaut, fin du dernier abonnement payé)</td>
          </tr>
          <tr>
            <td>Coordonnées bancaires (IBAN) du bailleur imprimées sur ses baux</td>
            <td>Tant que le compte est utilisé, supprimées avec lui</td>
            <td>Saisie</td>
          </tr>
          <tr>
            <td>Événements de paiement (références du prestataire)</td>
            <td>6 mois, puis suppression</td>
            <td>Traitement de l’événement</td>
          </tr>
        </TableauDurees>
        <p>
          Les factures d&apos;abonnement émises par Gerimmo sont conservées au
          moins six ans, durée prévue pour les pièces justificatives par le livre
          des procédures fiscales (art. L. 102 B). Les autres durées dépendent de la
          finalité et du dossier. Un besoin de preuve ou un contentieux peut
          justifier un archivage limité des seuls éléments nécessaires : un
          litige signalé depuis la fiche du bail suspend la suppression des
          pièces de ce bail, pour douze mois au plus, renouvelables. Les
          sauvegardes techniques chiffrées sont conservées 90 jours avant
          rotation ; une suppression du dossier courant ne les efface pas
          immédiatement.
        </p>
        <p>
          <b className="font-semibold">Votre compte.</b> Comme le prévoit
          l&apos;article 9 des{" "}
          <Link href="/conditions" className="lien-texte">
            conditions générales
          </Link>
          , le compte et ses données sont conservés tant que le compte est utilisé.
          À la fin de l&apos;essai ou de l&apos;abonnement, ils restent
          consultables et exportables en lecture seule : rien n&apos;est
          supprimé du seul fait de l&apos;arrêt, en dehors des durées propres aux
          pièces listées ci-dessus ; après vingt-quatre mois sans connexion ni
          abonnement, le compte est fermé après deux avertissements. Vous pouvez
          demander la suppression de votre compte à tout moment, après avoir exporté ce que vous souhaitez garder
          (le titulaire d&apos;un espace en obtient l&apos;archive complète depuis la page « Mes données
          personnelles »).
        </p>
        {/* Plan du 23/10, lot 4 (constat R15), adapté à la décision « non commerçant » du 23/10 : factures six ans.
            « demander la fermeture » : le bouton en libre-service vient au lot 5 ; d'ici là, la demande faite depuis
            « Mes données personnelles » est exécutée par la supervision. Pour un compte qui n'a jamais payé, la preuve
            part avec lui : la phrase sur la preuve vise les seuls abonnés payants.
            Relecture du 23/10 : les dossiers ne partent que si le compte est le seul membre de l'espace (lot 1E : sinon,
            retrait de la seule adhésion) ; la liste « Nous conservons seulement » reprend tout ce qui survit à la
            fermeture dans le tableau (rétractation, effacements à rejouer, empreinte d'opposition) ; la copie des
            factures jointe à l'archive suit les six ans (archives_comptes, migration du socle).
            Intégration des textes du 24/10 (code livré, PR #246) : la copie des factures de l'archive est retirée six ans
            après la fin de l'exercice de la facture, à défaut après la fin du dernier abonnement payé
            (echeance_facture_archivee, règle archive:facture) ; la déclaration de rétractation survit à la fermeture,
            détachée de l'espace (retractations_abonnement.organization_id en « set null », règle contrat:retractation) ;
            le client Stripe est supprimé au terme de ses factures (clients_stripe_au_terme). */}
        <p>
          <b className="font-semibold">Fermeture de votre compte.</b> Vous pouvez
          demander la fermeture de votre compte depuis la page{" "}
          <Link href="/compte/donnees" className="lien-texte">
            « Mes données personnelles »
          </Link>
          , après avoir téléchargé vos données si vous le souhaitez. Si un
          abonnement payé est en cours, vous choisissez : la fermeture à la fin
          de la période déjà payée, ou une fermeture quatorze jours après votre
          confirmation, avec le remboursement de la part non utilisée de cette
          période. Sans abonnement en cours, la fermeture intervient quatorze
          jours après votre confirmation. Vous pouvez l&apos;annuler jusque-là.
          Nous effaçons alors votre compte et vos accès ; si vous êtes le seul
          membre de votre espace, nous effaçons aussi ses dossiers, fichiers
          compris, et nous demandons la suppression des copies conservées par
          notre prestataire de signature ; sinon, seule votre adhésion à cet
          espace est retirée. Nous conservons seulement, avec un accès
          restreint : si vous avez souscrit un abonnement payant, la preuve de
          votre contrat (texte et version des conditions acceptées, dates,
          identifiant de facturation et adresse électronique), dix ans après la
          fin de votre dernier abonnement payé, avec la copie de vos factures,
          six ans après la fin de leur exercice ; la preuve d&apos;une
          éventuelle rétractation, dix ans après la rétractation, même une fois
          le compte fermé ; les factures d&apos;abonnement, au moins six ans,
          chez notre prestataire de paiement, où votre fiche de client est
          supprimée au terme de la conservation de vos factures ; la trace de votre demande et
          de son traitement, trois ans ; la liste des effacements à rejouer après
          la restauration d&apos;une sauvegarde, quatre mois ; si vous vous êtes
          opposé à la prospection, l&apos;empreinte de votre adresse, trois ans ;
          les journaux de sécurité, jusqu&apos;au terme de leur durée indiquée
          ci-dessus. Les sauvegardes chiffrées disparaissent sous 90 jours ; en
          cas de restauration, la fermeture est appliquée de nouveau. Si vous
          êtes locataire, caution ou artisan dans le dossier d&apos;un
          propriétaire, la fermeture supprime votre accès ; les informations de
          ce dossier restent sous la responsabilité de ce propriétaire, à qui
          nous transmettons votre demande.
        </p>
        </ReferenceConservation>
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
        {/* Décision du 23/10 (point 9) : aucune personne joignable en l'absence du dirigeant n'est désignée, donc aucun
            engagement de 48 heures ; « dans les meilleurs délais » seul. */}
        <p>
          En cas de violation de données susceptible de vous concerner, Gerimmo
          en informe le propriétaire responsable du dossier dans les meilleurs
          délais, avec les informations utiles à la notification qu&apos;il doit,
          le cas échéant, adresser à la CNIL. Lorsque Gerimmo est responsable du
          traitement, il notifie la CNIL dans les 72 heures après en avoir pris
          connaissance si la violation présente un risque ; il informe les
          personnes en cas de risque élevé, dans les conditions prévues par le
          RGPD.
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
          Vous pouvez vous opposer à tout moment, sans motif, à la prospection
          commerciale : répondez « Stop » à l&apos;un de nos messages ou
          écrivez-nous. Si vous avez accepté un suivi commercial en tant que
          particulier, vous pouvez retirer ce consentement de la même façon.
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
          gestion locative, à votre propriétaire bailleur, depuis la messagerie
          de votre espace. Pour votre compte, la facturation, l&apos;annuaire des
          artisans, le suivi commercial ou une demande envoyée depuis le site, à
          Gerimmo : si vous avez un compte, depuis la page{" "}
          <Link href="/compte/donnees" className="lien-texte">
            « Mes données personnelles »
          </Link>{" "}
          de votre compte, où votre demande et nos réponses restent privées ; dans tous
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
