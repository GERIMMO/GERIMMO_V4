import Link from "next/link";
import { MarqueGerimmo } from "@/components/marque-gerimmo";

export const metadata = { title: "Confidentialité — Gerimmo" };

// Information de confidentialité du site vitrine (formulaire de devis).
// La politique de confidentialité complète de la plateforme (traitements,
// sous-traitants, droits) vit dans le référentiel et sera publiée avec les
// CGU — les mentions d'éditeur (raison sociale, SIREN) restent à fournir.
export default function PageConfidentialite() {
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
        <h1>Confidentialité</h1>
        <div className="loc-carte space-y-3 text-sm leading-relaxed">
          <p>
            <b className="font-semibold">Formulaire de demande de devis.</b>{" "}
            Les informations transmises (nom, email, agence, téléphone, taille
            du portefeuille, message) servent uniquement à vous recontacter au
            sujet de votre demande. Elles ne sont ni transmises à des tiers, ni
            utilisées à d&apos;autres fins, et sont supprimées au plus tard
            24 mois après leur dépôt.
          </p>
          <p>
            <b className="font-semibold">Comptes et données de gestion.</b>{" "}
            Les données des comptes Gerimmo (bailleurs, locataires, agences)
            sont cloisonnées par organisation, hébergées dans l&apos;Union
            européenne, et régies par des durées de conservation propres à
            chaque type de pièce — détaillées dans l&apos;application. Gerimmo ne
            lit aucun compte bancaire et ne revend aucune donnée.
          </p>
          <p>
            <b className="font-semibold">Vos droits.</b> Vous pouvez demander
            l&apos;accès, la rectification ou la suppression de vos données en
            écrivant depuis le{" "}
            <Link href="/#agences" className="lien-discret">
              formulaire de contact
            </Link>{" "}
            (mentionnez « données personnelles » dans votre message) ou, pour
            un compte existant, depuis la messagerie de votre espace.
          </p>
        </div>
      </main>
    </div>
  );
}
