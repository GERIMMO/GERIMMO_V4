"use client";

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { seDeconnecter } from "@/app/actions/auth";
import { tenterDeconnexion } from "@/lib/deconnexion";

/**
 * Le bouton « Se déconnecter » du menu du compte et des pages qui ont leur propre en-tête (/compte, /securite, /espaces).
 *
 * Audit du 14/10 (VFL-02) : hors ligne, l'échec réseau de `action={seDeconnecter}` remontait à la limite d'erreur et la page
 * était remplacée par l'écran d'erreur générique. L'envoi est maintenant intercepté ici : l'échec est dit à côté du bouton,
 * la page et la saisie restent. La déconnexion réussie ne change pas : l'action redirige vers /connexion?raison=deconnecte,
 * où les copies locales sont purgées.
 *
 * `action={seDeconnecter}` reste sur le formulaire : un clic avant l'hydratation part encore en envoi natif. Une fois la page
 * active, `onSubmit` prend la main (`preventDefault` retire l'action native) et rejoue la même action dans une transition,
 * comme le fait `<form action>` : une redirection levée par l'action atteint la limite de Next exactement comme avant.
 */
export function FormulaireDeconnexion({ className, role, children }: {
  className: string;
  role?: "menuitem";
  children: ReactNode;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  // Le message « hors ligne » ne doit pas survivre au retour de la connexion.
  useEffect(() => {
    const retour = () => setMessage(null);
    window.addEventListener("online", retour);
    return () => window.removeEventListener("online", retour);
  }, []);
  const surEnvoi = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (enCours) return;
    setMessage(null);
    demarrer(async () => { setMessage(await tenterDeconnexion(seDeconnecter, () => navigator.onLine)); });
  };
  return (
    <div className="deconnexion">
      <form data-saisie-libre action={seDeconnecter} onSubmit={surEnvoi}>
        <button type="submit" role={role} className={className}>{children}</button>
      </form>
      {message && <p role="alert" className="deconnexion-echec">{message}</p>}
    </div>
  );
}
