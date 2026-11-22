import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { FormulaireArticleVierge, FormulaireNouvelArticle } from "./formulaire";
import { createClient } from "@/lib/supabase/server";
import { etatIA } from "@/lib/etat-ia";

// Le même nom que le titre de l'écran et que le bouton qui y mène.
export const metadata = { title: "Créer un article" };

export default async function PageNouvelArticle() {
  // Interrupteur IA (22/11/2026) : la rédaction assistée n'est proposée que si l'IA peut répondre ; le brouillon
  // vierge, lui, est toujours offert.
  // Le mode pilote ne retient pas la rédaction assistée : l'état se lit hors verrou pilote, comme l'action.
  const etatDeLIA = await etatIA(await createClient(), process.env, { verrouPilote: false });
  const assistee = etatDeLIA === "active";
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-7">
      <Link href="/admin/publications" className="lien-retour">← Articles du site</Link>
      <div className="entete-page">
        <div>
          <TitreEcran rubrique="journal">Créer un article</TitreEcran>
          <p className="mesure-lecture mt-2 leading-relaxed text-[var(--texte-secondaire)]">
            {assistee
              ? "Gerimmo rédige à partir des faits que vous validez, prépare le texte Facebook et laisse le tout en brouillon. Vous pouvez aussi partir d’un brouillon vierge. Rien n’est publié avant votre relecture."
              : etatDeLIA === "desactivee"
                ? "L’IA est désactivée dans les paramètres : vous partez d’un brouillon vierge, à écrire dans l’éditeur. Rien n’est publié avant votre validation."
                : "La rédaction assistée n’est pas reliée sur ce serveur : vous partez d’un brouillon vierge, à écrire dans l’éditeur. Rien n’est publié avant votre validation."}
          </p>
        </div>
      </div>
      {assistee && <div className="max-w-3xl"><FormulaireNouvelArticle /></div>}
      <div className="max-w-3xl">
        {assistee && <h2 className="mt-8 text-lg font-semibold">Ou écrire l’article vous-même</h2>}
        <FormulaireArticleVierge />
      </div>
    </main>
  );
}

