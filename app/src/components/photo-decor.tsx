"use client";

import Image, { type StaticImageData } from "next/image";
import { useState } from "react";

/**
 * UNE PHOTO DE DÉCOR — v4.3 (« de vraies images, pas du vectoriel », 19/09).
 *
 * Décorative, donc `alt=""`. Avec repli : si une source ne répond pas (fichier
 * absent, hôte injoignable), on passe à la suivante, puis on ne montre rien.
 * Ce qui l'entoure reste lisible seul, par construction — la photo enrichit,
 * elle ne porte aucune information.
 */
export function PhotoDecor({
  sources,
  sizes,
  priority,
  className,
}: {
  sources: (string | StaticImageData)[];
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [rang, setRang] = useState(0);
  if (rang >= sources.length) return null;
  return (
    <Image
      src={sources[rang]}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      placeholder={typeof sources[rang] === "string" ? "empty" : "blur"}
      className={className}
      onError={() => setRang((n) => n + 1)}
    />
  );
}
