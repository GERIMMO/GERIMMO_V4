"use client";

import { useSyncExternalStore } from "react";
import type { AmbianceAccueilId } from "@/lib/ambiance-accueil";
import { PhotoDecor } from "@/components/photo-decor";

function abonner(signaler: () => void) {
  const observateur = new MutationObserver(signaler);
  observateur.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ambiance-site"],
  });
  return () => observateur.disconnect();
}

function lireAmbiance() {
  // Attribut écrit exclusivement par AmbianceSite depuis le calendrier commun.
  return document.documentElement.getAttribute("data-ambiance-site") as AmbianceAccueilId | null;
}

/** Conserve la photo SSR à l’hydratation, puis suit l’unique horloge du site. */
export function PhotoAmbiance({ idInitial, className, sizes, priority }: {
  idInitial: AmbianceAccueilId;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  const id = useSyncExternalStore(abonner, lireAmbiance, () => idInitial) ?? idInitial;

  return <PhotoDecor
    key={id}
    sources={[
      `/illustrations/accueil-evenements/${id}.webp`,
      "/illustrations/interieur-gerimmo-2026.jpg",
    ]}
    className={className}
    sizes={sizes}
    priority={priority}
  />;
}
