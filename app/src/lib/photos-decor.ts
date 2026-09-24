// LES PHOTOS DE DÉCOR DU TABLEAU DE BORD — v4.3.
//
// Deux photos fournies par le porteur du projet (19/09) : une façade
// haussmannienne d'angle, un salon clair. Elles vivent dans `src/images/`,
// redimensionnées (1 600 / 960 px de large, JPEG 80) ; `next/image` en tire
// les tailles utiles et le flou de chargement. Chaque emplacement liste ses
// sources dans l'ordre : `PhotoDecor` prend la première qui répond.
//
// 24/09 : un seul bandeau par écran. La vignette du salon, posée sur le
// parcours de démarrage sous le bandeau d'accueil, est retirée — seule la
// façade reste.
import type { StaticImageData } from "next/image";
import facadeParis from "@/images/facade-paris.jpg";

/** Le bandeau d'accueil : la façade, en fin de journée. */
export const PHOTOS_ACCUEIL: StaticImageData[] = [facadeParis];
