import Link from "next/link";
import type { ReactNode } from "react";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { FORMULAIRE_ACCUEIL, type FaitEditeur, type Prestataire } from "@/lib/editeur";
import {
  ATTRIBUT_IDENTITE_EMPREINTE,
  ATTRIBUT_IDENTITE_LUE,
  ATTRIBUT_TEXTE,
  ATTRIBUT_VERSION,
  empreinteIdentite,
  type DocumentConditions,
} from "@/lib/conditions-versions";

// Coquille des pages légales : mentions légales, conditions générales,
// confidentialité. Les trois avaient chacune leur en-tête avant le 11/09 —
// c'est le défaut que le relevé de design nomme « le même problème résolu
// différemment d'un écran à l'autre ». Elles la partagent désormais.
//
// 24/09 : elles prennent aussi l'en-tête et le pied du reste du site public.
// Leur bandeau propre n'offrait que le logo et un « ← Retour » qui menait
// toujours à l'accueil ; leur pied, trois liens de 12 px sans zone de toucher.

/**
 * Un fait d'éditeur pas encore fourni.
 *
 * Il s'affiche en toutes lettres : le silence serait pire — une mention
 * légale à laquelle il manque le SIRET doit le dire, pas l'omettre.
 *
 * 24/09 : ni pointillés ni info-bulle. Souligné, le manque ressemblait à un
 * lien, souvent à côté d'un vrai, et ne réagissait pas ; son explication
 * n'existait qu'au survol, hors d'atteinte du doigt. Il passe en italique,
 * avec la mention « (à venir) » en clair.
 */
export function AFournir({ quoi }: { quoi: string }) {
  return <span className="italic text-[var(--libelle)]">{quoi} (à venir)</span>;
}

/** Un fait d'éditeur, ou sa réserve s'il manque. */
export function Fait({ valeur, quoi }: { valeur: FaitEditeur; quoi: string }) {
  return valeur ? <>{valeur}</> : <AFournir quoi={quoi} />;
}

/**
 * Le médiateur de la consommation, rendu à l'identique par l'article 17 des
 * conditions et par les mentions légales (relecture du 23/10). Ses
 * coordonnées ne s'affichent que si son nom est saisi : une adresse ou un site
 * sans nom ne désigne aucun organisme, et les conditions les montraient alors
 * que les mentions disaient « aucun organisme n'est désigné ». Sans nom, rien :
 * chaque page dit l'adhésion à venir dans sa propre phrase.
 */
export function CoordonneesMediateur({ editeur }: { editeur: Record<string, FaitEditeur> }) {
  if (!editeur.mediateurNom) return null;
  return (
    <p className="whitespace-pre-line [overflow-wrap:anywhere]">
      {editeur.mediateurNom}{"\n"}
      <Fait valeur={editeur.mediateurAdresse} quoi="adresse du médiateur" />{"\n"}
      <Fait valeur={editeur.mediateurSite} quoi="site du médiateur" />
    </p>
  );
}

/**
 * Où nous écrire, dit tel quel (24/09) : l'adresse de contact dès qu'elle est
 * fournie, sinon le formulaire de l'accueil sous son vrai nom. Se lit après
 * « écrivez-nous » : « … à l'adresse x » ou « … depuis le formulaire… ».
 * `objet` : ce qu'il faut préciser, par exemple « données personnelles ».
 *
 * 19/10 : `courriel` vient de la page, qui le lit en base (lireEditeur). Le
 * composant appelait lui-même `courrielDeContact` sans argument : il lisait la
 * constante du code, nulle à jamais, et renvoyait au formulaire même une fois
 * l'adresse saisie dans les paramètres.
 */
export function OuNousEcrire({ courriel, objet }: { courriel: string | null; objet?: string }) {
  if (courriel) {
    const sujet = objet ? `?subject=${encodeURIComponent(objet)}` : "";
    return (
      <>
        à l&apos;adresse{" "}
        <a href={`mailto:${courriel}${sujet}`} className="lien-texte">
          {courriel}
        </a>
        {objet && <> (objet : « {objet} »)</>}
      </>
    );
  }
  return (
    <>
      depuis le{" "}
      <Link href={FORMULAIRE_ACCUEIL} className="lien-texte">
        formulaire de contact de l&apos;accueil
      </Link>
      , en précisant l&apos;objet de votre question{objet && <> (« {objet} »)</>}
    </>
  );
}

/**
 * Les prestataires du service, en un seul tableau (24/09) : mentions légales
 * et confidentialité en tenaient chacune une version, qui divergeaient.
 *
 * 19/10 : la page passe la liste fusionnée avec les faits saisis
 * (`prestatairesAvecFaits`) ; le composant ne lit plus la constante du code.
 * `coordonnees` ajoute la colonne « Coordonnées » (mentions légales).
 */
export function TableauPrestataires({
  prestataires,
  coordonnees = false,
}: {
  prestataires: readonly Prestataire[];
  coordonnees?: boolean;
}) {
  return (
    <div className="tableau-defilant tableau-fiches">
      <table className="tableau">
        <thead>
          <tr>
            <th>Prestataire</th>
            <th>Rôle</th>
            <th>Localisation</th>
            {coordonnees && <th>Coordonnées</th>}
          </tr>
        </thead>
        <tbody>
          {prestataires.map((p) => (
            <tr key={p.cle}>
              <td>
                {p.nom}
                {p.documentation && (
                  <a className="lien-texte mt-1 block text-xs" href={p.documentation} rel="noreferrer">
                    Informations officielles
                  </a>
                )}
              </td>
              <td data-libelle="Rôle">{p.role}</td>
              <td data-libelle="Localisation">
                <Fait valeur={p.localisation} quoi="localisation" />
              </td>
              {coordonnees && (
                <td data-libelle="Coordonnées" className="whitespace-pre-line [overflow-wrap:anywhere]">
                  <Fait valeur={p.coordonnees ?? null} quoi="dénomination, adresse et téléphone" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Les pages légales ; « /conditions/artisans » (24/10, plan de conformité R10) n'a pas de lien propre dans le pied. */
export type CheminLegal = "/mentions-legales" | "/conditions" | "/conditions/artisans" | "/confidentialite";

/**
 * Le cadre des pages légales : en-tête et pied du site public, colonne de lecture. Partagé par la coquille et par les
 * pages des versions archivées des conditions (24/10), qui affichent un texte rangé tel quel.
 */
export function CadreLegal({
  chemin,
  children,
}: {
  /** Le chemin de la page : son lien est marqué dans le pied. */
  chemin: CheminLegal;
  children: ReactNode;
}) {
  return (
    <div className="site-public flex min-h-full flex-1 flex-col bg-[var(--creme)]">
      <EnTetePublic />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 sm:px-7 sm:py-10">{children}</main>

      <PiedPublic courant={chemin} />
    </div>
  );
}

export function CoquilleLegale({
  titre,
  chapo,
  chemin,
  incomplet,
  courriel,
  texteContractuel,
  apres,
  children,
}: {
  titre: string;
  chapo?: ReactNode;
  /** Le chemin de la page : son lien est marqué dans le pied. */
  chemin: CheminLegal;
  /** L'adresse de contact saisie par l'éditeur, ou `null` : l'encadré renvoie alors au formulaire de l'accueil. */
  courriel: string | null;
  /**
   * Vrai s'il reste une réserve sur la page — fait d'éditeur manquant OU
   * réserve propre à la page. Chaque page le calcule (24/09) : l'encadré
   * listait les seuls faits d'éditeur, sans rapport avec ce que la page
   * affichait, et aurait disparu des conditions alors que leurs propres
   * clauses restaient à rédiger.
   */
  incomplet: boolean;
  /**
   * Un document contractuel (24/10) : le titre, le chapeau, l'encadré et les articles sont rangés dans un élément
   * marqué du document et de sa version. C'est ce texte, et lui seul, que l'archive des versions range et que la
   * garde du code empreinte (lib/conditions-versions.ts).
   */
  texteContractuel?: {
    document: DocumentConditions;
    version: string;
    /**
     * L'identité de l'éditeur que la page affiche, ou `null` si sa lecture a échoué (relecture adverse du 24/10, I1) :
     * l'élément marqué le dit, hors du texte, pour que l'archive refuse une page dégradée ou rendue avec une autre
     * identité que celle de la base.
     */
    identite: Record<string, FaitEditeur> | null;
  };
  /** Ce qui suit le texte sans en faire partie : liens de navigation, hors de l'empreinte. */
  apres?: ReactNode;
  children: ReactNode;
}) {
  const contenu = (
    <>
      <div>
        <h1>{titre}</h1>
        {chapo && <p className="mt-1 text-sm text-muted-foreground">{chapo}</p>}
      </div>

      {/* Tant qu'il reste une réserve, le document ne remplit pas son
          office : on le dit au lecteur plutôt que de le lui laisser croire.
          Sans compte ni liste (24/09) : la liste des faits d'éditeur
          envoyait chercher le SIRET sur une page qui n'en parle pas. */}
      {incomplet && (
        <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
          <p className="text-sm">
            <b className="font-semibold">Document en cours de finalisation.</b>{" "}
            Certaines informations de ce document restent à préciser ; les
            passages concernés portent ci-dessous la mention « à venir ».
            Pour toute question sur ce document, écrivez-nous <OuNousEcrire courriel={courriel} />.
          </p>
        </div>
      )}

      {children}
    </>
  );
  return (
    <CadreLegal chemin={chemin}>
      {texteContractuel ? (
        <div
          {...{
            [ATTRIBUT_TEXTE]: texteContractuel.document,
            [ATTRIBUT_VERSION]: texteContractuel.version,
            [ATTRIBUT_IDENTITE_LUE]: texteContractuel.identite ? "1" : "0",
            ...(texteContractuel.identite ? { [ATTRIBUT_IDENTITE_EMPREINTE]: empreinteIdentite(texteContractuel.identite) } : {}),
          }}
          className="space-y-4"
        >
          {contenu}
        </div>
      ) : (
        contenu
      )}
      {apres}
    </CadreLegal>
  );
}

/** Un article numéroté des conditions, ou une section des mentions légales. */
export function Article({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="loc-carte space-y-3 text-sm leading-relaxed">
      <h2 className="text-[length:var(--pas-section)]">{titre}</h2>
      {children}
    </section>
  );
}
