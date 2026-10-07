import Image from "next/image";

// L'IMAGE D'UN ARTICLE DU JOURNAL (06/10/2026).
//
// L'illustration créée pour Facebook (JPEG 1536×1024, bucket public
// `marketing-visuels`) ne servait qu'à Facebook : ni en tête de l'article, ni
// sur les cartes du journal, ni dans l'aperçu de partage. Elle s'affiche
// désormais aux trois endroits, et un article sans image (ancien, ou saisi à
// la main) reçoit l'illustration de repli de la charte : jamais une zone vide.
// L'hôte Supabase est déclaré dans `next.config.ts` (images.remotePatterns).

export const IMAGE_REPLI_JOURNAL = "/illustrations/journal-repli.svg";

/** L'image d'un article, ou celle de repli ; `repli` dit laquelle. */
export function imageArticle(url: string | null | undefined): { src: string; repli: boolean } {
  const propre = url?.trim();
  return propre && /^https:\/\//i.test(propre) ? { src: propre, repli: false } : { src: IMAGE_REPLI_JOURNAL, repli: true };
}

export function ImageJournal({
  url,
  titre,
  priorite = false,
  tailles = "(min-width: 1024px) 768px, 100vw",
  className = "",
}: {
  url: string | null | undefined;
  titre: string;
  /** En tête d'article : chargée tout de suite ; en vignette : différée. */
  priorite?: boolean;
  tailles?: string;
  className?: string;
}) {
  const image = imageArticle(url);
  return (
    <span className={`block overflow-hidden rounded-2xl border border-[var(--filet)] bg-[var(--creme)] ${className}`}>
      <Image
        src={image.src}
        alt={image.repli ? "" : titre}
        width={1536}
        height={1024}
        sizes={tailles}
        priority={priorite}
        loading={priorite ? "eager" : "lazy"}
        unoptimized={image.repli}
        className="aspect-[3/2] h-auto w-full object-cover"
      />
    </span>
  );
}
