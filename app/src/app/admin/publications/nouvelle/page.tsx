import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { FormulaireNouvelArticle } from "./formulaire";

// Le même nom que le titre de l'écran et que le bouton qui y mène.
export const metadata = { title: "Créer un article" };

export default function PageNouvelArticle() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-7">
      <Link href="/admin/publications" className="lien-retour">← Articles du site</Link>
      <div className="entete-page">
        <div>
          <TitreEcran rubrique="journal">Créer un article</TitreEcran>
          <p className="mesure-lecture mt-2 leading-relaxed text-[var(--texte-secondaire)]">
            Gerimmo rédige à partir des faits que vous validez, prépare le texte Facebook et laisse le tout en brouillon. Rien n’est publié avant votre relecture.
          </p>
        </div>
      </div>
      <div className="max-w-3xl"><FormulaireNouvelArticle /></div>
    </main>
  );
}

