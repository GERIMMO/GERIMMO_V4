import Link from "next/link";
import type { ReactNode } from "react";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { faitsManquants, type FaitEditeur } from "@/lib/editeur";

// Coquille des pages légales : mentions légales, conditions générales,
// confidentialité. Les trois avaient chacune leur en-tête avant le 11/09 —
// c'est le défaut que le relevé de design nomme « le même problème résolu
// différemment d'un écran à l'autre ». Elles la partagent désormais.

/**
 * Un fait d'éditeur pas encore fourni.
 *
 * Il s'affiche en toutes lettres, souligné de pointillés : c'est l'idiome que
 * le générateur de documents emploie déjà pour une donnée manquante
 * (lib/documents/gabarit.ts — « le libellé reste en réserve »). Le silence
 * serait pire : une mention légale à laquelle il manque le SIRET doit le dire,
 * pas l'omettre.
 */
export function AFournir({ quoi }: { quoi: string }) {
  return (
    <span
      className="text-[var(--libelle)] [text-decoration-line:underline] [text-decoration-style:dotted] [text-underline-offset:3px]"
      title="Information à fournir avant publication"
    >
      {quoi}
    </span>
  );
}

/** Un fait d'éditeur, ou sa réserve s'il manque. */
export function Fait({ valeur, quoi }: { valeur: FaitEditeur; quoi: string }) {
  return valeur ? <>{valeur}</> : <AFournir quoi={quoi} />;
}

export function CoquilleLegale({
  titre,
  chapo,
  children,
}: {
  titre: string;
  chapo?: ReactNode;
  children: ReactNode;
}) {
  const manquants = faitsManquants();
  return (
    <div className="min-h-full bg-[var(--creme)]">
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3.5 sm:px-7">
          <Link href="/" aria-label="Retour à l'accueil">
            <MarqueGerimmo surEncre />
          </Link>
          <Link
            href="/"
            className="text-[13px] text-[var(--sur-encre)]/80 hover:text-[var(--sur-encre)]"
          >
            ← Retour
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
        <div>
          <h1>{titre}</h1>
          {chapo && <p className="mt-1 text-sm text-muted-foreground">{chapo}</p>}
        </div>

        {/* Tant que l'identité de l'éditeur n'est pas fournie, le document ne
            remplit pas son office : on le dit au lecteur plutôt que de le lui
            laisser croire. L'encadré disparaît de lui-même une fois
            lib/editeur.ts rempli. */}
        {manquants.length > 0 && (
          <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
            <p className="text-sm">
              <b className="font-semibold">Document en cours de finalisation.</b>{" "}
              Il lui manque {manquants.length === 1 ? "une information" : `${manquants.length} informations`} :{" "}
              {manquants.join(", ")}. Les passages concernés apparaissent{" "}
              <AFournir quoi="ainsi" /> ci-dessous. En attendant, écrivez-nous
              depuis le{" "}
              <Link href="/#agences" className="lien-discret">
                formulaire de contact
              </Link>{" "}
              pour toute question sur ce document.
            </p>
          </div>
        )}

        {children}

        <nav className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
          <Link href="/mentions-legales" className="hover:text-[var(--encre)]">
            Mentions légales
          </Link>
          <Link href="/conditions" className="hover:text-[var(--encre)]">
            Conditions générales
          </Link>
          <Link href="/confidentialite" className="hover:text-[var(--encre)]">
            Confidentialité
          </Link>
        </nav>
      </main>
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
