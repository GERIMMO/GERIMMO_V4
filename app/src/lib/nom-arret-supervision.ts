import { MISSIONS, estMission } from "@/lib/missions";

/** Le nom, en français, de ce qu'un arrêt d'urgence suspend. */
export function nomArret(cle: string): string {
  if (estMission(cle)) return MISSIONS[cle].nom;
  return ({ global: "Tous les traitements contrôlés", consignes: "Lectures de consignes", orchestrateur: "Suivi des dossiers", sauvegarde: "Sauvegarde" } as Record<string, string>)[cle] ?? "Traitement contrôlé";
}
