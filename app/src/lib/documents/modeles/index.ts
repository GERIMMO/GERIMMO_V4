// Registre des modèles de documents générables (sprint « Documents-0 »).
// Chaque modèle sait assembler son HTML depuis la base ; le type GED pilote
// droits et conservation (aucun nouveau type : on range dans l'existant).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentAssemble } from "../gabarit";
import { assemblerQuittance } from "./quittance";
import { assemblerAvisEcheance } from "./avis-echeance";
import { assemblerRecuDepot } from "./recu-depot";
import { assemblerRevisionIrl } from "./revision-irl";
import { assemblerProrata } from "./prorata";
import { assemblerRappelAssurance } from "./rappel-assurance";
import { assemblerNotice } from "./notice";
import { assemblerBailNu } from "./bail-nu";
import { assemblerEdl } from "./edl";

export type LienDocument = { entite: "bail" | "personne" | "lot"; entiteId: string };

export type Assemblage =
  | {
      document: DocumentAssemble;
      titreGed: string;
      nomFichier: string;
      liens: LienDocument[];
    }
  | { erreur: string };

export type Modele = {
  typeGed: string;
  assembler(supabase: SupabaseClient, orgId: string, cibleId: string): Promise<Assemblage>;
};

export const MODELES = {
  // 18 + 19 — cible : id de la quittance (est_quittance décide du visage)
  quittance: { typeGed: "quittance", assembler: assemblerQuittance },
  // 17 — cible : id de l'appel de loyer
  avis_echeance: { typeGed: "courrier", assembler: assemblerAvisEcheance },
  // 20 — cible : id de l'encaissement de dépôt
  recu_depot: { typeGed: "quittance", assembler: assemblerRecuDepot },
  // 23 — cible : id de la révision
  revision_irl: { typeGed: "courrier", assembler: assemblerRevisionIrl },
  // 21 — cible : id de l'appel proraté
  prorata: { typeGed: "courrier", assembler: assemblerProrata },
  // 13 — cible : id de l'attestation qui expire
  rappel_assurance: { typeGed: "courrier", assembler: assemblerRappelAssurance },
  // 05 — cible : id du bail
  notice: { typeGed: "courrier", assembler: assemblerNotice },
  // 01 — cible : id du bail (brouillon, locataire renseigné)
  bail_nu: { typeGed: "bail", assembler: assemblerBailNu },
  // 14/15 — cible : id de l'état des lieux (le type décide du visage)
  edl: { typeGed: "etat_des_lieux", assembler: assemblerEdl },
} satisfies Record<string, Modele>;

export type CodeModele = keyof typeof MODELES;
