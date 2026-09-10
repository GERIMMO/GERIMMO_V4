// Compression des photos à la prise (RM-19.1.3 / module 19) : sur téléphone,
// une photo sort à 8-15 Mo — inutilisable sur un réseau de cage d'escalier.
// On la ramène côté client à ~1600 px / JPEG 0,8 AVANT l'envoi ; l'original
// ne quitte jamais l'appareil.

const COTE_MAX = 1600;
const QUALITE = 0.8;

export async function compresserImage(fichier: File): Promise<File> {
  // On ne touche qu'aux images matricielle ; tout le reste passe tel quel.
  if (!/^image\/(jpeg|png)$/.test(fichier.type)) return fichier;
  try {
    const bitmap = await createImageBitmap(fichier);
    const ratio = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
    // Déjà petite et déjà JPEG : rien à gagner.
    if (ratio === 1 && fichier.type === "image/jpeg" && fichier.size < 900_000) {
      bitmap.close();
      return fichier;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return fichier;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resoudre) =>
      canvas.toBlob(resoudre, "image/jpeg", QUALITE)
    );
    if (!blob || blob.size >= fichier.size) return fichier;
    return new File([blob], fichier.name.replace(/\.(png|jpeg|jpg)$/i, ".jpg"), {
      type: "image/jpeg",
      lastModified: fichier.lastModified,
    });
  } catch {
    // Une compression qui échoue n'empêche jamais l'envoi de la photo.
    return fichier;
  }
}

// Remplace les fichiers d'un <input type="file"> par leurs versions
// compressées — à brancher sur l'événement change.
export async function compresserChampFichiers(champ: HTMLInputElement): Promise<void> {
  const fichiers = Array.from(champ.files ?? []);
  if (!fichiers.length) return;
  const compresses = await Promise.all(fichiers.map(compresserImage));
  if (compresses.every((f, i) => f === fichiers[i])) return;
  const transfert = new DataTransfer();
  for (const f of compresses) transfert.items.add(f);
  champ.files = transfert.files;
}
