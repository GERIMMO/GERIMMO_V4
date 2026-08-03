// Vérification du type RÉEL d'un fichier par ses octets de signature
// (RM-A4.9 : « attestation.pdf » peut être un exécutable renommé — on ne fait
// jamais confiance à l'extension ni au Content-Type déclaré).

export type MimeAccepte = "application/pdf" | "image/jpeg" | "image/png";

export const EXTENSIONS: Record<MimeAccepte, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function detecterMimeReel(octets: Uint8Array): MimeAccepte | null {
  // PDF : "%PDF-"
  if (
    octets.length >= 5 &&
    octets[0] === 0x25 &&
    octets[1] === 0x50 &&
    octets[2] === 0x44 &&
    octets[3] === 0x46 &&
    octets[4] === 0x2d
  ) {
    return "application/pdf";
  }
  // JPEG : FF D8 FF
  if (
    octets.length >= 3 &&
    octets[0] === 0xff &&
    octets[1] === 0xd8 &&
    octets[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // PNG : 89 50 4E 47 0D 0A 1A 0A
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (octets.length >= 8 && png.every((b, i) => octets[i] === b)) {
    return "image/png";
  }
  return null;
}

// Un PDF complet se termine par « %%EOF », dans ses derniers octets. Un fichier
// coupé en cours de transfert garde son en-tête « %PDF- » et passe donc la
// détection de type, mais ne s'ouvrira jamais. On conserve des documents à
// valeur légale : mieux vaut refuser au dépôt que découvrir un bail illisible
// des mois plus tard, quand il faut le produire.
export function pdfComplet(octets: Uint8Array): boolean {
  const FIN = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
  // La marque de fin peut être suivie d'un retour à la ligne ou d'espaces
  const debut = Math.max(0, octets.length - 1024);
  for (let i = octets.length - FIN.length; i >= debut; i--) {
    if (FIN.every((b, j) => octets[i + j] === b)) return true;
  }
  return false;
}

export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024; // 10 Mo (module 12)

export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}
