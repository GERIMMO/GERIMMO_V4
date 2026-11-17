"use client";
import { useEffect } from "react";
import { signalerPresence } from "@/app/actions/autonomie";

export function PresenceSupervision() {
  useEffect(() => {
    let actif = true;
    let minuteur: ReturnType<typeof setTimeout>;

    function arreterReprise() {
      clearTimeout(minuteur);
      window.removeEventListener("online", reprendre);
    }

    function reprendre() {
      if (!actif || !navigator.onLine) return;
      arreterReprise();
      void transmettre(false);
    }

    async function transmettre(repriseAutorisee: boolean) {
      // La réponse peut se perdre après l'enregistrement. La même RPC met à jour
      // l'horodatage du superviseur connecté et revérifie son habilitation.
      const etat = await signalerPresence().catch(() => "indisponible");
      if (actif && repriseAutorisee && etat === "indisponible") {
        window.addEventListener("online", reprendre);
        minuteur = setTimeout(reprendre, 10_000);
      }
    }

    void transmettre(true);
    return () => {
      actif = false;
      arreterReprise();
    };
  }, []);
  return null;
}
