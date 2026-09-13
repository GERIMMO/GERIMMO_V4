import Link from "next/link";
import { Sprout } from "lucide-react";

/** Slot éditorial : le contenu peut être ajouté sans toucher aux données du bail. */
export function ConseilsLocataire({
  orgId,
  article,
}: {
  orgId: string;
  article?: { titre: string; resume: string; href: string; animation?: string };
}) {
  return (
    <section
      className="loc-carte loc-conseils"
      aria-label="Conseils pour votre logement"
    >
      <div className="loc-conseils-icone" aria-hidden>
        <Sprout className="size-6" />
      </div>
      <div>
        <p className="eyebrow mb-2">Bien chez soi</p>
        <h3>{article?.titre ?? "Vos questions du quotidien"}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {article?.resume ??
            "Entretien, démarches, vie dans le logement : retrouvez vos repères."}
        </p>
        {article?.animation && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm">
              Voir l&apos;animation
            </summary>
            <video
              className="mt-3 w-full rounded-xl"
              src={article.animation}
              controls
              playsInline
              preload="none"
              aria-label={article.titre}
            />
          </details>
        )}
      </div>
      <Link
        href={article?.href ?? `/locataire/${orgId}/faq`}
        className="lien-discret"
      >
        {article ? "Lire le conseil" : "Questions fréquentes"} →
      </Link>
    </section>
  );
}
