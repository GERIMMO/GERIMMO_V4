import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Perf 30/08 : cache client des pages dynamiques pendant 30 s — un retour
    // sur un onglet déjà visité ne repasse pas par le serveur ; les actions
    // (revalidatePath) invalident tout de suite ce qui a changé.
    staleTimes: { dynamic: 30, static: 180 },
    serverActions: {
      // 10 Mo par fichier (limite du bucket), et une déclaration d'incident
      // porte jusqu'à 5 photos (recette 24/08 : deux photos de téléphone
      // crevaient l'ancienne limite de 11 Mo → « erreur » sèche avant même
      // notre code) + enrobage multipart.
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
