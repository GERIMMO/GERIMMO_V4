import Link from "next/link";
import { Article, CoquilleLegale, AFournir, Fait } from "@/components/coquille-legale";
import { EDITEUR } from "@/lib/editeur";

export const metadata = { title: "Mentions légales — Gerimmo" };

// Obligation de l'article 6-III de la LCEN : un service en ligne doit dire qui
// l'édite et qui l'héberge. La page n'existait pas avant le 11/09, sur un site
// qui vend un abonnement — le manquement est pénalement sanctionné.
//
// Les faits d'entreprise viennent tous de lib/editeur.ts : tant qu'ils n'y
// sont pas, la page le dit en toutes lettres au lieu de rendre du vide.
export default function PageMentionsLegales() {
  return (
    <CoquilleLegale
      titre="Mentions légales"
      chapo="Qui édite ce service, qui l'héberge, et comment nous joindre."
    >
      <Article titre="Éditeur">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {[
            ["Dénomination", <Fait key="d" valeur={EDITEUR.denomination} quoi="dénomination sociale" />],
            ["Forme juridique", <Fait key="f" valeur={EDITEUR.forme} quoi="forme juridique" />],
            ["Capital social", <Fait key="c" valeur={EDITEUR.capital} quoi="capital social, le cas échéant" />],
            ["Siège social", <Fait key="s" valeur={EDITEUR.siege} quoi="adresse du siège" />],
            ["RCS", <Fait key="r" valeur={EDITEUR.rcs} quoi="ville et numéro d'immatriculation" />],
            ["SIRET", <Fait key="si" valeur={EDITEUR.siret} quoi="numéro SIRET" />],
            ["TVA intracommunautaire", <Fait key="t" valeur={EDITEUR.tvaIntracommunautaire} quoi="numéro de TVA, le cas échéant" />],
            ["Directeur de la publication", <Fait key="dp" valeur={EDITEUR.directeurPublication} quoi="nom et qualité" />],
            ["Courriel", <Fait key="e" valeur={EDITEUR.email} quoi="adresse de contact" />],
            ["Téléphone", <Fait key="tel" valeur={EDITEUR.telephone} quoi="numéro, le cas échéant" />],
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
          Les données sont hébergées <b className="font-semibold">dans
          l&apos;Union européenne</b>. Le service s&apos;appuie sur les
          prestataires suivants :
        </p>
        <div className="tableau-defilant">
          <table className="tableau">
            <thead>
              <tr>
                <th>Rôle</th>
                <th>Prestataire</th>
                <th>Localisation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Base de données, authentification, stockage des fichiers</td>
                <td>Supabase</td>
                <td>Région eu-west-3 (Paris, France)</td>
              </tr>
              <tr>
                <td>Hébergement et diffusion de l&apos;application</td>
                <td>Vercel</td>
                <td>
                  <AFournir quoi="région de déploiement" />
                </td>
              </tr>
              <tr>
                <td>Envoi des courriels du service</td>
                <td>Resend</td>
                <td>
                  <AFournir quoi="localisation" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          Coordonnées complètes de chaque prestataire :{" "}
          <AFournir quoi="raison sociale et adresse de chacun" />.
        </p>
      </Article>

      <Article titre="Contact">
        <p>
          Pour toute question sur le service :{" "}
          <Fait valeur={EDITEUR.email} quoi="adresse de contact" />.
        </p>
        <p>
          Pour vos données personnelles, la marche à suivre est décrite dans la{" "}
          <Link href="/confidentialite" className="lien-discret">
            page confidentialité
          </Link>
          . S&apos;il s&apos;agit des données de votre dossier de gestion
          locative — bail, pièces, loyers, incidents —{" "}
          <b className="font-semibold">
            c&apos;est à votre agence qu&apos;il faut vous adresser
          </b>
          , et non à Gerimmo : elle en est responsable, nous n&apos;en sommes
          que le sous-traitant.
        </p>
      </Article>

      <Article titre="Médiation de la consommation">
        <p>
          Si vous êtes un particulier et qu&apos;un litige nous oppose, vous
          pouvez recourir <b className="font-semibold">gratuitement</b> à un
          médiateur de la consommation, après nous avoir adressé une réclamation
          écrite restée sans réponse satisfaisante.
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
          Conformément à l&apos;article 6-I-5 de la LCEN, tout contenu
          manifestement illicite peut être signalé à{" "}
          <Fait valeur={EDITEUR.email} quoi="adresse de signalement" />, en
          précisant la date du constat, la description des faits,
          l&apos;emplacement précis du contenu et les motifs pour lesquels il
          devrait être retiré.
        </p>
      </Article>
    </CoquilleLegale>
  );
}
