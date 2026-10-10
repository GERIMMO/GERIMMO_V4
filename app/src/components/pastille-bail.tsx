"use client";
import { useContext, type ComponentProps } from "react";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { champBailManquant } from "@/lib/reperes-bail";
import { Label } from "@/components/ui/label";
import styles from "./pastille-bail.module.css";

type Repere = { champ?: string | string[]; renseigne?: boolean; manquant?: boolean };
export function PastilleBail({ champ = "", renseigne = false, manquant }: Repere) {
  const controle = useContext(CompletudeBail);
  if (!controle || controle.erreur || renseigne || !(manquant ?? champBailManquant(controle.manquants, champ))) return null;
  return <span className={styles.pastille} role="img" aria-label="Information obligatoire à compléter" title="Information obligatoire à compléter" />;
}
/** Les mêmes formulaires, utilisés hors du bail, ne reçoivent aucun repère. */
export function LabelBail({ champ, renseigne, manquant, children, ...props }: ComponentProps<typeof Label> & Repere) {
  return <Label {...props}>{children}<PastilleBail champ={champ} renseigne={renseigne} manquant={manquant}/></Label>;
}
export function ProfilBailACompleter({ orgId }: { orgId: string }) {
  const controle = useContext(CompletudeBail);
  if (!controle || !champBailManquant(controle.manquants, "profil")) return null;
  return <a className="inline-flex items-center gap-2 text-sm underline" href={`/agence/${orgId}/profil`}><PastilleBail champ="profil"/>Compléter les informations du profil pour le bail</a>;
}
