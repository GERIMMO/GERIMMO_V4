import { lireEditeur } from "@/lib/editeur-serveur";
import Link from "next/link";
import { Article, CoordonneesMediateur, CoquilleLegale, Fait } from "@/components/coquille-legale";
import { courrielDeContact, documentsIncomplets, REGIME_TVA, prestatairesAvecFaits, prestatairesIncomplets, sirenEtSiret, typeVendeur } from "@/lib/editeur";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Mentions légales — Gerimmo",
  description: "Identité et coordonnées de l’éditeur de Gerimmo, responsable de publication, hébergement et médiation.",
  chemin: "/mentions-legales",
});

// Les informations d'identification restent celles saisies dans les paramètres.
// Les autres prestataires et les traitements sont détaillés dans la confidentialité.
// Référence : Service Public, F37351, vérifiée le 13/10/2026 ; relue le 24/11/2026 (décision Q7 : le vendeur est un
// entrepreneur individuel — nom et prénom accompagnés de « EI », adresse de l'entreprise, immatriculation ; pas de
// capital). Le SIREN et le SIRET saisis s'affichent (ils ne l'étaient nulle part). Le médiateur de la consommation
// n'est pas désigné : la page le dit, sans promettre un recours qui n'existe pas encore.
export default async function PageMentionsLegales() {
  const { editeur: EDITEUR, indisponible } = await lireEditeur();
  const hebergeurs = prestatairesAvecFaits(EDITEUR).filter((p) => p.cle === "vercel" || p.cle === "supabase");
  // Relecture de la fusion du 25/11/2026 (C-02) : seul le type de vendeur CHOISI dit s'il y a un capital. Tant qu'il ne
  // l'est pas, aucune ligne de capital (elle affichait « capital social (à venir) », même pour un entrepreneur individuel),
  // et la page porte l'encadré « Document en cours de finalisation ». La forme juridique saisie n'est pas lue.
  const type = typeVendeur(EDITEUR);
  const numeros = sirenEtSiret(EDITEUR.siret);
  return (
    <CoquilleLegale
      titre="Mentions légales"
      chapo="Les informations essentielles sur l’éditeur de Gerimmo."
      chemin="/mentions-legales"
      incomplet={indisponible || documentsIncomplets(EDITEUR) || type === null || prestatairesIncomplets(hebergeurs, true)}
      courriel={courrielDeContact(EDITEUR)}
    >
      <Article titre="Éditeur">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {[
            ["Éditeur", <span key="identite"><Fait valeur={EDITEUR.denomination} quoi="identité de l’éditeur" /> — <Fait valeur={EDITEUR.forme} quoi="forme juridique" /></span>],
            ...(type === "personne_morale" ? [["Capital social", <Fait key="c" valeur={EDITEUR.capital} quoi="capital social" />]] : []),
            ["Adresse", <Fait key="s" valeur={EDITEUR.siege} quoi="adresse de l’entreprise" />],
            ["Immatriculation", <Fait key="r" valeur={EDITEUR.rcs} quoi="immatriculation au RNE ou au RCS" />],
            ...(numeros
              ? [["SIREN", numeros.siren], ["SIRET", numeros.siret]]
              : [["SIRET", <Fait key="siret" valeur={EDITEUR.siret} quoi="SIRET" />]]),
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
        {/* L'article 17 des conditions renvoie ici, que le médiateur soit désigné ou non (version du 24/11/2026) :
            cette rubrique doit toujours dire l'un ou l'autre, jamais se taire. */}
        {EDITEUR.mediateurNom ? (
          <CoordonneesMediateur editeur={EDITEUR} />
        ) : (
          <>
            <p>Médiateur de la consommation : aucun organisme n’est désigné à ce jour. Ses coordonnées seront publiées sur cette page dès sa désignation.</p>
            <p>En attendant, toute réclamation s’adresse par écrit à l’éditeur, à l’adresse de contact ci-dessus ou depuis la page « Aide et retours » de l’application.</p>
          </>
        )}
        {EDITEUR.mediateurNom && <p>Après une réclamation écrite, le consommateur peut recourir gratuitement à un médiateur compétent.</p>}
      </Article>

      <nav aria-label="Informations juridiques complémentaires" className="flex flex-wrap gap-x-6">
        <Link href="/conditions" className="public-lien">Conditions générales</Link>
        <Link href="/confidentialite" className="public-lien">Données personnelles et confidentialité</Link>
      </nav>
    </CoquilleLegale>
  );
}
