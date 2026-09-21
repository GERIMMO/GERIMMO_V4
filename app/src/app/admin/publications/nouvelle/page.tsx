import Link from "next/link";
import { FormulaireNouvelArticle } from "./formulaire";

export const metadata = { title: "Nouvel article — Gerimmo" };

export default function PageNouvelArticle() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-7">
      <Link href="/admin/publications" className="lien-discret text-sm">← Journal</Link>
      <div className="entete-page mt-3">
        <h1>Créer un article</h1>
      </div>
      <p className="mesure-lecture mt-3 text-sm leading-relaxed text-[var(--texte-secondaire)]">
        Gerimmo rédige à partir des faits que vous validez, prépare le texte Facebook et laisse le tout en brouillon. Rien n’est publié avant votre relecture.
      </p>
      <FormulaireNouvelArticle />
    </main>
  );
}

