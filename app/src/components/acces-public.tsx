"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";

// L'ACCÈS AU COMPTE DANS LA VITRINE (audit final du 27/10/2026, PUB-10).
//
// Les pages publiques sont statiques (ISR) : leur en-tête proposait « Se connecter » et « Créer mon compte » à une
// personne déjà connectée. Après l'hydratation, la présence d'un cookie de session Supabase (non httpOnly :
// lib/supabase/cookies.ts) remplace ces gestes par un seul « Mon espace » vers /espaces. Le rendu du serveur reste
// celui du visiteur ; une session expirée mène, par le proxy, à la connexion — comme « Se connecter ».
const COOKIE_SESSION = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/;

export function sessionPresente(cookies: string): boolean {
  return COOKIE_SESSION.test(cookies);
}

const sAbonner = () => () => {};
function useConnecte(): boolean {
  return useSyncExternalStore(sAbonner, () => sessionPresente(document.cookie), () => false);
}

/** L'en-tête : « Se connecter » + « Créer mon compte », ou « Mon espace ». */
export function AccesEnTete() {
  if (useConnecte()) {
    return (
      <Link href="/espaces" className="btn-or public-inscription">
        Mon espace <ArrowUpRight size={16} aria-hidden />
      </Link>
    );
  }
  return (
    <>
      <Link href="/connexion" className="public-connexion">Se connecter</Link>
      <Link href="/inscription" className="btn-or public-inscription">Créer mon compte <ArrowUpRight size={16} aria-hidden /></Link>
    </>
  );
}

/** Le pied et le menu mobile : les liens du compte, selon la session. */
export function LiensCompte({ inscription = true, courant }: { inscription?: boolean; courant?: string }) {
  if (useConnecte()) return <Link href="/espaces">Mon espace</Link>;
  return (
    <>
      {inscription && <Link href="/inscription" aria-current={courant === "/inscription" ? "page" : undefined}>Créer mon compte</Link>}
      <Link href="/connexion" aria-current={courant === "/connexion" ? "page" : undefined}>Se connecter</Link>
    </>
  );
}
