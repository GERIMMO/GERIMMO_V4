"use client";
import type { ReactNode } from "react";

/** Un raccourci révèle aussi les blocs repliés, sans modifier leurs formulaires. */
export function LienSectionIncident({ cible, children }: { cible: string; children: ReactNode }) {
  return <a href={`#${cible}`} onClick={() => {
    let element: HTMLElement | null = document.getElementById(cible);
    while (element) {
      if (element instanceof HTMLDetailsElement) element.open = true;
      element = element.parentElement;
    }
  }}>{children}</a>;
}
