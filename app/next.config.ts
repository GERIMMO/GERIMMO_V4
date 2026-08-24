import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
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
