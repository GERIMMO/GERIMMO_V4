import { lireEditeur } from "@/lib/editeur-serveur";
import Link from "next/link";
import { Article, CoquilleLegale, Fait, TableauPrestataires } from "@/components/coquille-legale";
import { courrielDeContact, documentsIncomplets, estEntrepreneurIndividuel, REGIME_TVA, prestatairesAvecFaits, prestatairesIncomplets } from "@/lib/editeur";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Mentions légales — Gerimmo",
  description:
    "Mentions légales du site Gerimmo : éditeur du service, directeur de la publication, hébergement et prestataires techniques, contact.",
  chemin: "/mentions-legales",
});

// Obligation de l'article 6-III de la LCEN : un service en ligne doit dire qui
// l'édite et qui l'héberge. La page n'existait pas avant le 11/09, sur un site
// qui vend un abonnement — le manquement est pénalement sanctionné.
//
// Les faits d'entreprise viennent tous de lib/editeur.ts, complétés par ce qui a
// été saisi dans /admin/parametres (lireEditeur) : tant qu'un fait manque, la
// page le dit en toutes lettres au lieu de rendre du vide.
//
// 19/10 : la réserve propre à cette page — les coordonnées de chaque
// prestataire — n'est plus une constante nulle du code : elles se saisissent
// prestataire par prestataire et s'affichent dans la colonne « Coordonnées ».

export default async function PageMentionsLegales() {
  const {editeur:EDITEUR,indisponible}=await lireEditeur();
  const prestataires = prestatairesAvecFaits(EDITEUR);
  const individuel = estEntrepreneurIndividuel(EDITEUR);
  return (
    <CoquilleLegale
      titre="Mentions légales"
      chapo="Qui édite ce service, qui l'héberge, et comment nous joindre."
      chemin="/mentions-legales"
      incomplet={indisponible || documentsIncomplets(EDITEUR) || prestatairesIncomplets(prestataires, true)}
      courriel={courrielDeContact(EDITEUR)}
    >
      <p className="text-xs text-muted-foreground">Informations mises à jour le 20 octobre 2026.</p>
      <Article titre="Éditeur">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {[
            ["Dénomination", <Fait key="d" valeur={EDITEUR.denomination} quoi="dénomination sociale" />],
            ["Forme juridique", <Fait key="f" valeur={EDITEUR.forme} quoi="forme juridique" />],
            ...(individuel ? [] : [["Capital social", <Fait key="c" valeur={EDITEUR.capital} quoi="capital social" />]]),
            ["Siège social", <Fait key="s" valeur={EDITEUR.siege} quoi="adresse du siège" />],
            ["Immatriculation", <Fait key="r" valeur={EDITEUR.rcs} quoi="immatriculation au RNE ou au RCS" />],
            ["SIRET", <Fait key="si" valeur={EDITEUR.siret} quoi="numéro SIRET" />],
            ...(REGIME_TVA?.nature === "franchise" ? [["TVA", "TVA non applicable, article 293 B du CGI"]] : []),
            ...(EDITEUR.tvaIntracommunautaire || REGIME_TVA?.nature !== "franchise" ? [["TVA intracommunautaire", <Fait key="t" valeur={EDITEUR.tvaIntracommunautaire} quoi="numéro de TVA" />]] : []),
            ["Directeur de la publication", <Fait key="dp" valeur={EDITEUR.directeurPublication} quoi="nom et qualité" />],
            ["Courriel", <Fait key="e" valeur={EDITEUR.email} quoi="adresse de contact" />],
            ["Téléphone", <Fait key="tel" valeur={EDITEUR.telephone} quoi="téléphone de contact professionnel" />],
          ].map(([libelle, valeur]) => (
            <div key={String(libelle)} className="contents">
              <dt className="mono-discret sm:text-right">{libelle}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
      </Article>

      <Article titre="Activité">
        <p>
          Gerimmo édite un <b className="font-semibold">logiciel de gérance
          immobilière</b> que des agences et des propriétaires bailleurs
          utilisent pour leur propre gestion.
        </p>
        <p>
          Gerimmo <b className="font-semibold">n&apos;exerce aucune activité
          d&apos;entremise immobilière</b> : l&apos;éditeur ne détient aucun
          mandat de gestion ou de transaction, n&apos;encaisse aucun loyer, ne
          détient aucun fonds pour le compte d&apos;autrui et ne se connecte à
          aucun compte bancaire. Il ne relève donc pas de la loi n° 70-9 du
          2 janvier 1970 dite loi Hoguet, et ne détient ni carte
          professionnelle ni garantie financière.
        </p>
      </Article>

      <Article titre="Hébergement">
        <p>
          {/* Audit 27/09 : la phrase précédait un tableau qui contient des
              prestataires américains. Même formulation que la page
              confidentialité (29/09 : serveurs principaux en région UE,
              prestataires parfois établis hors de l'Union). */}
          La base de données, le stockage principal des fichiers et les fonctions
          serveur de l’application sont configurés dans des{" "}
          <b className="font-semibold">régions de l&apos;Union européenne</b>{" "}
          (Paris). La diffusion du site et certaines opérations techniques peuvent
          intervenir ailleurs. Plusieurs prestataires sont des sociétés établies hors de
          l&apos;Union, notamment aux États-Unis : la colonne « Localisation »
          le dit pour chacun, et la page confidentialité décrit les garanties
          des transferts. Le service s&apos;appuie sur les prestataires
          suivants :
        </p>
        {/* La même liste que la page confidentialité (lib/editeur.ts), avec
            les coordonnées de chacun (dénomination, adresse, téléphone) telles
            que saisies dans les paramètres. */}
        <TableauPrestataires prestataires={prestataires} coordonnees />
      </Article>

      <Article titre="Contact">
        <p>
          Pour toute question sur le service :{" "}
          <Fait valeur={EDITEUR.email} quoi="adresse de contact" />.
        </p>
        <p>
          Pour vos données personnelles, la marche à suivre est décrite dans la{" "}
          <Link href="/confidentialite" className="lien-texte">
            page confidentialité
          </Link>
          . S&apos;il s&apos;agit des données de votre dossier de gestion
          locative — bail, pièces, loyers, incidents —{" "}
          <b className="font-semibold">
            adressez-vous à votre propriétaire bailleur ou à votre agence
          </b>
           : ils déterminent l’usage de ces données ; Gerimmo les traite pour leur compte.
        </p>
      </Article>

      <Article titre="Médiation de la consommation">
        {!EDITEUR.mediateurNom && (
          <p className="font-medium text-[var(--destructive)]">
            Adhésion à un médiateur de la consommation à venir. Les coordonnées
            seront publiées après cette adhésion ; aucun organisme n’est désigné à ce jour.
          </p>
        )}
        <p>
          Si vous êtes un particulier et qu&apos;un litige nous oppose, le droit
          de la consommation prévoit le recours <b className="font-semibold">gratuit
          pour le consommateur</b> à un médiateur compétent, après une réclamation
          écrite restée sans réponse satisfaisante. L’adhésion de Gerimmo doit être
          finalisée avant la conclusion de contrats avec des consommateurs.
        </p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="mono-discret sm:text-right">Médiateur</dt>
          <dd>
            <Fait valeur={EDITEUR.mediateurNom} quoi="nom du médiateur" />
          </dd>
          <dt className="mono-discret sm:text-right">Adresse</dt>
          <dd>
            <Fait valeur={EDITEUR.mediateurAdresse} quoi="adresse postale" />
          </dd>
          <dt className="mono-discret sm:text-right">Site</dt>
          <dd>
            <Fait valeur={EDITEUR.mediateurSite} quoi="site internet" />
          </dd>
        </dl>
      </Article>

      <Article titre="Propriété intellectuelle">
        <p>
          Le site, l&apos;application, leur architecture, leurs textes, leur
          charte graphique et leurs bases de données sont protégés. Toute
          reproduction ou réutilisation non autorisée est interdite.
        </p>
        <p>
          <b className="font-semibold">Marque blanche.</b> Le service permet à
          une agence d&apos;apposer ses propres couleurs et son logo sur son
          espace. Ces éléments <b className="font-semibold">restent la
          propriété de l&apos;agence</b> ; Gerimmo n&apos;en acquiert aucun
          droit au-delà de ce qui est nécessaire pour les afficher.
        </p>
      </Article>

      <Article titre="Signaler un contenu illicite">
        <p>
          Tout contenu manifestement illicite peut être signalé à{" "}
          <Fait valeur={EDITEUR.email} quoi="adresse de signalement" />, en
          précisant la date du constat, la description des faits,
          l&apos;emplacement précis du contenu et les motifs pour lesquels il
          devrait être retiré.
        </p>
      </Article>
    </CoquilleLegale>
  );
}
