import type { Metadata } from "next";
import Link from "next/link";

// La page « introuvable » de toute l'application (audit du 27/09). Il n'y en
// avait aucune : une URL inconnue, ou l'ancien lien d'une quittance reçue par
// e-mail, tombait sur la page par défaut de Next — en anglais, sans marque,
// sans sortie. Un locataire au téléphone y restait bloqué.
//
// La pastille de la marque, pas son nom : hors de tout espace, on ne sait pas
// de quelle agence vient la personne, et le locataire ne lit jamais
// « Gerimmo » dans les écrans de son agence (25/09, D04).
//
// 29/09 : le titre porte la marque, comme les autres pages. Plus de
// `robots` ici : Next.js pose déjà « noindex » sur toute réponse 404, et la
// page en portait deux. Le visiteur sans compte a aussi ses sorties : la
// vitrine et le journal (« mon espace » le menait à la connexion).
export const metadata: Metadata = {
  title: "Page introuvable — Gerimmo",
};

export default function PageIntrouvable() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center p-6 sm:p-10">
      <div className="vide-guide">
        {/* eslint-disable-next-line @next/next/no-img-element -- pastille SVG statique */}
        <img src="/logo/gerimmo-mark.svg" alt="" width={40} height={40} className="mb-3" />
        {/* Le code reste lisible : c'est ce que l'on dicte au support. */}
        <p className="text-xs text-[var(--texte-secondaire)]">Erreur 404</p>
        <h1 className="titre">Cette page est introuvable</h1>
        <p className="explication">
          Le lien est peut-être ancien, incomplet, ou le document n&apos;est plus
          disponible. Vos données ne sont pas en cause&nbsp;: retrouvez vos documents
          et vos démarches depuis votre espace.
        </p>
        <div className="geste">
          <Link href="/espaces" className="btn-or inline-flex min-h-11 items-center">
            Retour à mon espace
          </Link>
        </div>
        <p className="mt-4 text-sm text-[var(--texte-secondaire)]">
          Pas encore de compte&nbsp;?{" "}
          <Link href="/" className="lien-texte">
            Découvrir Gerimmo
          </Link>{" "}
          ou{" "}
          <Link href="/journal" className="lien-texte">
            lire le journal
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
