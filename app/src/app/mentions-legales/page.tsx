import { lireEditeur } from "@/lib/editeur-serveur";

// Page publique relue toutes les heures (audit final, PUB-05) : ses lectures se font sans cookie.
export const revalidate = 3600;
import Link from "next/link";
import { Article, CoordonneesMediateur, CoquilleLegale, Fait } from "@/components/coquille-legale";
import { courrielDeContact, documentsIncomplets, estEntrepreneurIndividuel, REGIME_TVA, prestatairesAvecFaits, prestatairesIncomplets } from "@/lib/editeur";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Mentions légales — Gerimmo",
  description: "Identité et coordonnées de l’éditeur de Gerimmo, responsable de publication, hébergement et médiation.",
  chemin: "/mentions-legales",
});

// Les informations d'identification restent celles saisies dans les paramètres.
// Les autres prestataires et les traitements sont détaillés dans la confidentialité.
// Référence : Service Public, F37351, vérifiée le 13/10/2026.
export default async function PageMentionsLegales() {
  const { editeur: EDITEUR, indisponible } = await lireEditeur();
  const hebergeurs = prestatairesAvecFaits(EDITEUR).filter((p) => p.cle === "vercel" || p.cle === "supabase");
  const individuel = estEntrepreneurIndividuel(EDITEUR);
  return (
    <CoquilleLegale
      titre="Mentions légales"
      chapo="Les informations essentielles sur l’éditeur de Gerimmo."
      chemin="/mentions-legales"
      incomplet={indisponible || documentsIncomplets(EDITEUR) || prestatairesIncomplets(hebergeurs, true)}
      courriel={courrielDeContact(EDITEUR)}
    >
      <Article titre="Éditeur">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {[
            ["Éditeur", <span key="identite"><Fait valeur={EDITEUR.denomination} quoi="identité de l’éditeur" /> — <Fait valeur={EDITEUR.forme} quoi="forme juridique" /></span>],
            ...(individuel ? [] : [["Capital social", <Fait key="c" valeur={EDITEUR.capital} quoi="capital social" />]]),
            ["Adresse", <Fait key="s" valeur={EDITEUR.siege} quoi="adresse de l’entreprise" />],
            ["Immatriculation", <Fait key="r" valeur={EDITEUR.rcs} quoi="immatriculation au RNE ou au RCS" />],
            ...(REGIME_TVA?.nature === "franchise" ? [["TVA", "TVA non applicable, article 293 B du CGI"]] : []),
            ...(EDITEUR.tvaIntracommunautaire || REGIME_TVA?.nature !== "franchise" ? [["TVA intracommunautaire", <Fait key="t" valeur={EDITEUR.tvaIntracommunautaire} quoi="numéro de TVA" />]] : []),
            ["Publication", <span key="dp">Directeur : <Fait valeur={EDITEUR.directeurPublication} quoi="directeur de la publication" /></span>],
            ["E-mail", <Fait key="e" valeur={EDITEUR.email} quoi="adresse de contact" />],
            ["Téléphone", <Fait key="tel" valeur={EDITEUR.telephone} quoi="téléphone de contact professionnel" />],
          ].map(([libelle, valeur]) => (
            <div key={String(libelle)} className="contents">
              <dt className="mono-discret">{libelle}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">{valeur}</dd>
            </div>
          ))}
        </dl>
      </Article>

      <Article titre="Hébergement">
        <dl className="space-y-4">
          {hebergeurs.map((p) => (
            <div key={p.cle}>
              <dt className="font-semibold">{p.nom}{p.cle === "supabase" ? " — données et fichiers" : " — site et application"}</dt>
              <dd className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">
                <Fait valeur={p.coordonnees ?? null} quoi="dénomination, adresse et téléphone" />
              </dd>
            </div>
          ))}
        </dl>
      </Article>

      <Article titre="Médiation de la consommation">
        {/* Même rendu que l'article 17 des conditions (relecture du 23/10). */}
        {EDITEUR.mediateurNom ? (
          <CoordonneesMediateur editeur={EDITEUR} />
        ) : (
          <p>Adhésion à venir : aucun organisme n’est désigné à ce jour.</p>
        )}
        <p>Après une réclamation écrite, le consommateur peut recourir gratuitement à un médiateur compétent.</p>
      </Article>

      {/* Liens isolés : cible de 44 px (audit final, PUB-07 ; WCAG 2.5.8). */}
      <nav aria-label="Informations juridiques complémentaires" className="flex flex-wrap gap-x-6 text-sm">
        <Link href="/conditions" className="lien-texte inline-flex min-h-11 items-center">Conditions générales</Link>
        <Link href="/confidentialite" className="lien-texte inline-flex min-h-11 items-center">Données personnelles et confidentialité</Link>
      </nav>
    </CoquilleLegale>
  );
}
