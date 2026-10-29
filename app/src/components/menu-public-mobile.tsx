"use client";

import Link from "next/link";
import { useRef } from "react";
import { Menu } from "lucide-react";

export function MenuPublicMobile({ liens }: { liens: readonly (readonly [string, string])[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={menu} className="public-menu-mobile" onKeyDown={event => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    }}>
      <summary aria-label="Menu du site"><Menu size={22} aria-hidden /><span>Menu</span></summary>
      <nav aria-label="Navigation mobile" onClick={event => {
        if ((event.target as HTMLElement).closest("a") && menu.current) menu.current.open = false;
      }}>
        {liens.map(([href, titre]) => <Link key={href} href={href}>{titre}</Link>)}
        <Link href="/#espaces">Les espaces Gerimmo</Link>
        <Link href="/connexion">Se connecter</Link>
        <Link href="/inscription">Créer mon compte</Link>
      </nav>
    </details>
  );
}
