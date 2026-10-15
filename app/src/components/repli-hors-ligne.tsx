"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TEXTES_HORS_LIGNE, doitRetenirLeClic, messageDuRepli } from "@/lib/repli-hors-ligne";

/**
 * Repli hors ligne (décision D26 B, audit du 13/10/2026, DES-A-06) — voir lib/repli-hors-ligne.ts pour le raisonnement.
 *
 * Rien ne s'affiche tant que le réseau est là. Hors ligne, le clic sur un lien qui quitterait la page est retenu AVANT que
 * Next.js ne tente la navigation (sans quoi il retombe sur la page d'erreur du navigateur, en anglais) : une carte
 * « Connexion perdue » s'ouvre en haut de l'écran, avec « Réessayer » et « Fermer ». « Réessayer » ouvre la page demandée
 * si le réseau est revenu, sinon le dit. Aucun service worker, aucune page mise en cache.
 *
 * La retenue se pose sur `window` en phase de capture : elle passe avant la garde « Quitter cette page ? » des
 * formulaires (posée sur `document`), qui ne doit pas demander de confirmer un départ qui n'a pas lieu.
 */
type Etat = { cible: string; connexionRevenue: boolean; echecReessai: boolean };

export function RepliHorsLigne() {
  const routeur = useRouter();
  const [etat, setEtat] = useState<Etat | null>(null);
  const reessayer = useRef<HTMLButtonElement>(null);
  const ouvert = etat !== null;

  // Retenir le clic. Posé une fois : `navigator.onLine` est lu au moment du clic, pas mémorisé.
  useEffect(() => {
    const retenir = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const lien = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!lien) return;
      const clic = { href: lien.href, target: lien.target, download: lien.hasAttribute("download") };
      if (!doitRetenirLeClic(event, clic, location.href, navigator.onLine)) return;
      event.preventDefault();
      event.stopPropagation();
      setEtat({ cible: lien.href, connexionRevenue: false, echecReessai: false });
    };
    window.addEventListener("click", retenir, true);
    return () => window.removeEventListener("click", retenir, true);
  }, []);

  // Carte ouverte : suivre le réseau, fermer avec Échap, et donner le focus au bouton (le clic sur le lien est annulé :
  // un utilisateur au clavier ne doit pas rester sur un lien qui ne répond plus).
  useEffect(() => {
    if (!ouvert) return;
    const revenu = () => setEtat((e) => e && { ...e, connexionRevenue: true, echecReessai: false });
    const perdu = () => setEtat((e) => e && { ...e, connexionRevenue: false });
    const touche = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEtat(null);
    };
    window.addEventListener("online", revenu);
    window.addEventListener("offline", perdu);
    window.addEventListener("keydown", touche);
    reessayer.current?.focus();
    return () => {
      window.removeEventListener("online", revenu);
      window.removeEventListener("offline", perdu);
      window.removeEventListener("keydown", touche);
    };
  }, [ouvert]);

  if (!etat) return null;

  function essayerDeNouveau() {
    if (!etat) return;
    if (!navigator.onLine) {
      setEtat({ ...etat, connexionRevenue: false, echecReessai: true });
      return;
    }
    const cible = new URL(etat.cible);
    setEtat(null);
    // Même site : navigation de l'application ; ailleurs (paiement, par exemple) : chargement complet.
    if (cible.origin === location.origin) routeur.push(`${cible.pathname}${cible.search}${cible.hash}`);
    else location.assign(cible.href);
  }

  return (
    <section
      role="alert"
      aria-labelledby="repli-hors-ligne-titre"
      className="fixed inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-[70] mx-auto max-w-md rounded-xl border border-[var(--filet)] border-l-4 border-l-[var(--or)] bg-[var(--ivoire)] p-4 text-[var(--encre)] shadow-[0_12px_32px_#14304f26] print:hidden"
    >
      <p id="repli-hors-ligne-titre" className="font-heading text-base font-semibold">
        {TEXTES_HORS_LIGNE.titre}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--texte-secondaire)]">{messageDuRepli(etat)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button ref={reessayer} type="button" onClick={essayerDeNouveau} className="btn-or min-h-11">
          {TEXTES_HORS_LIGNE.reessayer}
        </button>
        <button type="button" onClick={() => setEtat(null)} className="btn-secondaire min-h-11">
          {TEXTES_HORS_LIGNE.fermer}
        </button>
      </div>
    </section>
  );
}
