import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Dépôt GED : 10 Mo de fichier + enrobage multipart (le bucket limite à 10 Mo)
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
