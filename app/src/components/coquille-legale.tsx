import Link from "next/link";
import type { ReactNode } from "react";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import {
  FORMULAIRE_ACCUEIL,
  PRESTATAIRES,
  courrielDeContact,
  type FaitEditeur,
} from "@/lib/editeur";

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
 * Où nous écrire, dit tel quel (24/09) : l'adresse de contact dès qu'elle est
 * fournie, sinon le formulaire de l'accueil sous son vrai nom. Se lit après
 * « écrivez-nous » : « … à l'adresse x » ou « … depuis le formulaire… ».
 * `objet` : ce qu'il faut préciser, par exemple « données personnelles ».
 */
export function OuNousEcrire({ objet }: { objet?: string }) {
  const courriel = courrielDeContact();
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
        formulaire de l&apos;accueil, rubrique Agences
      </Link>
      , en précisant l&apos;objet de votre question{objet && <> (« {objet} »)</>}
    </>
  );
}

/**
 * Les prestataires du service, en un seul tableau (24/09) : mentions légales
 * et confidentialité en tenaient chacune une version, qui divergeaient.
 */
export function TableauPrestataires() {
  return (
    <div className="tableau-defilant">
      <table className="tableau">
        <thead>
          <tr>
            <th>Prestataire</th>
            <th>Rôle</th>
            <th>Localisation</th>
          </tr>
        </thead>
        <tbody>
          {PRESTATAIRES.map((p) => (
            <tr key={p.nom}>
              <td>{p.nom}</td>
              <td>{p.role}</td>
              <td>
                <Fait valeur={p.localisation} quoi="localisation" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CoquilleLegale({
  titre,
  chapo,
  chemin,
  incomplet,
  children,
}: {
  titre: string;
  chapo?: ReactNode;
  /** Le chemin de la page : son lien est marqué dans le pied. */
  chemin: "/mentions-legales" | "/conditions" | "/confidentialite";
  /**
   * Vrai s'il reste une réserve sur la page — fait d'éditeur manquant OU
   * réserve propre à la page. Chaque page le calcule (24/09) : l'encadré
   * listait les seuls faits d'éditeur, sans rapport avec ce que la page
   * affichait, et aurait disparu des conditions alors que leurs propres
   * clauses restaient à rédiger.
   */
  incomplet: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--creme)]">
      <EnTetePublic />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 sm:px-7 sm:py-10">
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
              Pour toute question sur ce document, écrivez-nous <OuNousEcrire />.
            </p>
          </div>
        )}

        {children}
      </main>

      <PiedPublic courant={chemin} />
    </div>
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
