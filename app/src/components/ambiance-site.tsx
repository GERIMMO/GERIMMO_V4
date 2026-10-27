"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ambianceAccueil } from "@/lib/ambiance-accueil";
import { dateParis, instantParis, lendemain } from "@/lib/heure-paris-calcul";

/** Le décor suit le calendrier de Paris, même dans un onglet resté ouvert plusieurs jours. */
export function AmbianceSite() {
  const router = useRouter();
  useEffect(() => {
    const racine = document.documentElement;
    const ambiancePrecedente = racine.getAttribute("data-ambiance-site");
    const imagePrecedente = racine.style.getPropertyValue("--ambiance-image");
    const prioritePrecedente = racine.style.getPropertyPriority("--ambiance-image");
    let minuterie: number | undefined;
    let jourSynchronise: string | undefined;

    function synchroniser() {
      window.clearTimeout(minuterie);
      const maintenant = new Date();
      const jour = dateParis(maintenant);
      // Audit #264, TRV-13 : passé minuit, le décor changeait mais la date de l'accueil et le reste de la page,
      // rendus par le serveur, gardaient la veille. Le jour qui change rafraîchit aussi la page.
      if (jourSynchronise !== undefined && jourSynchronise !== jour) router.refresh();
      jourSynchronise = jour;
      const ambiance = ambianceAccueil(jour);
      const image = `url("${ambiance.image}")`;

      if (racine.getAttribute("data-ambiance-site") !== ambiance.id) {
        racine.setAttribute("data-ambiance-site", ambiance.id);
      }
      if (racine.style.getPropertyValue("--ambiance-image") !== image) {
        racine.style.setProperty("--ambiance-image", image);
      }

      // Un jour parisien dure parfois 23 ou 25 heures : aucun intervalle fixe de 24 h.
      const prochainMinuit = instantParis(lendemain(jour), 0);
      minuterie = window.setTimeout(synchroniser, Math.max(1, prochainMinuit.getTime() - maintenant.getTime()));
    }

    function auRetour() {
      if (document.visibilityState === "visible") synchroniser();
    }

    synchroniser();
    window.addEventListener("focus", synchroniser);
    document.addEventListener("visibilitychange", auRetour);

    return () => {
      window.clearTimeout(minuterie);
      window.removeEventListener("focus", synchroniser);
      document.removeEventListener("visibilitychange", auRetour);
      if (ambiancePrecedente === null) racine.removeAttribute("data-ambiance-site");
      else racine.setAttribute("data-ambiance-site", ambiancePrecedente);
      if (imagePrecedente) racine.style.setProperty("--ambiance-image", imagePrecedente, prioritePrecedente);
      else racine.style.removeProperty("--ambiance-image");
    };
  }, [router]);

  return null;
}
