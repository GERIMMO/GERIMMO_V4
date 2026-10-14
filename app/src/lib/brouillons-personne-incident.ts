import { z } from "zod";
import { sansMessageSessionExpiree } from "./session-expiree";
const fichier = z.custom<File>(v => typeof File !== "undefined" && v instanceof File && v.size <= 10 * 1024 * 1024);
const court = z.string().max(2000);
const resultat = z.object({ succes: court.optional(), erreur: court.optional(), avertissement: court.optional(), incertain: z.boolean().optional() });
const schemaPersonne = z.object({
  role: z.enum(["locataire", "garant", "proprietaire_mandant"]).nullable(), morale: z.boolean(), etape: z.number().int().min(0).max(4), lotId: z.string().max(100),
  // Décision D31 : la clé de la demande de création suit la copie, pour qu'un renvoi après une réponse perdue retrouve la fiche.
  creationId: z.string().uuid().optional(),
  valeurs: z.object({ nom: court, prenom: court, date_naissance: court, commune_naissance: court, email: court, telephone: court, address_line1: court, postal_code: court, city: court }),
  pieces: z.array(z.object({ id: z.string().uuid(), type: z.enum(["piece_identite", "justificatif", "attestation_assurance"]), titre: court, mode: z.enum(["depot", "demande"]), fichier: fichier.optional(), expireLe: court.optional() })).max(30),
  bilan: z.object({ personneCreee: z.object({ id: z.string().uuid() }).optional(), ficheExistante: z.object({ id: z.string().uuid() }).optional(), creationIncertaine: z.boolean().optional(), pieces: z.record(z.string(), resultat).optional(), terminee: z.boolean().optional(), erreur: court.optional(), succes: court.optional(), avertissement: court.optional() }),
});
const schemaIncident = z.object({
  commande: z.string().uuid(), categorie: court, piece: court, description: z.string().max(20000), anciennete: court, urgence: z.enum(["normale", "urgente"]), photos: z.array(fichier).max(5),
  envoye: z.boolean(), bilan: z.object({ succes: court.optional(), erreur: court.optional(), avertissement: court.optional() }),
});
export type BrouillonPersonne = z.infer<typeof schemaPersonne>;
export type BrouillonIncident = z.infer<typeof schemaIncident>;
// Reprendre une copie, c'est être de nouveau connecté : le message « session expirée » qu'elle porte est périmé (VER-PR178-04).
export function validerBrouillonPersonne(donnees: unknown): BrouillonPersonne | null { const r = schemaPersonne.safeParse(donnees); return r.success ? { ...r.data, bilan: sansMessageSessionExpiree(r.data.bilan) } : null; }
export function validerBrouillonIncident(donnees: unknown): BrouillonIncident | null { const r = schemaIncident.safeParse(donnees); return r.success ? { ...r.data, bilan: sansMessageSessionExpiree(r.data.bilan) } : null; }
export function declarationDuBrouillon(b: BrouillonIncident): FormData {
  const f = new FormData();
  for (const nom of ["commande", "categorie", "piece", "description", "anciennete", "urgence"] as const) f.set(nom, b[nom]);
  for (const photo of b.photos) f.append("photos", photo);
  return f;
}
