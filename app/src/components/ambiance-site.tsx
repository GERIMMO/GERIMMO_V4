"use client";

import { useEffect } from "react";
import { ambianceAccueil } from "@/lib/ambiance-accueil";
import { dateParis, instantParis, lendemain } from "@/lib/heure-paris-calcul";

/** Le décor suit le calendrier de Paris, même dans un onglet resté ouvert plusieurs jours. */
export function AmbianceSite() {
  useEffect(() => {
    const racine = document.documentElement;
    const ambiancePrecedente = racine.getAttribute("data-ambiance-site");
    const imagePrecedente = racine.style.getPropertyValue("--ambiance-image");
    const prioritePrecedente = racine.style.getPropertyPriority("--ambiance-image");
    let minuterie: number | undefined;

    function synchroniser() {
      window.clearTimeout(minuterie);
      const maintenant = new Date();
      const jour = dateParis(maintenant);
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
  }, []);

  return null;
}
