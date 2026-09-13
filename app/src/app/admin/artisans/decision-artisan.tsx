"use client";

import { useActionState, useContext } from "react";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { traiterInscriptionArtisan } from "@/app/actions/supervision-artisans";
import { SignalerDecisionArtisan } from "./retour-decisions";

export function DecisionArtisan({ artisanId, operation, siretVerifie = false }: {
  artisanId: string;
  operation: "verifier_siret" | "validation" | "refus" | "remise_en_attente";
  siretVerifie?: boolean;
}) {
  const signaler = useContext(SignalerDecisionArtisan);
  const [etat, action] = useActionState(async (precedent: { erreur?: string; succes?: string }, fd: FormData) => {
    const resultat = await traiterInscriptionArtisan(artisanId, precedent, fd);
    if (resultat.succes) signaler(resultat.succes);
    return resultat;
  }, {});
  const libelles = { verifier_siret: "Enregistrer le SIRET comme vérifié", validation: "Valider l’inscription", refus: "Refuser avec ce motif", remise_en_attente: "Réexaminer l’inscription" };
  return (
    <form action={action} onReset={(event) => event.preventDefault()} className="space-y-3">
      <input type="hidden" name="operation" value={operation} />
      {operation === "verifier_siret" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="verification_effectuee" value="oui" required className="mt-1 size-4 accent-[var(--encre)]" />J’ai vérifié l’existence et l’identité de l’entreprise correspondant à ce SIRET.</label>}
      {operation === "validation" && <>
        {!siretVerifie && <p className="text-sm text-[var(--texte-secondaire)]">La validation sera disponible après vérification du SIRET.</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="pieces_relues" value="oui" required disabled={!siretVerifie} className="mt-1 size-4 accent-[var(--encre)]" />J’ai relu les justificatifs et contrôlé leur conformité pour cette inscription.</label>
      </>}
      {operation === "refus" && <label className="block space-y-1 text-sm"><span>Motif communiqué à l’artisan</span><textarea name="motif" required maxLength={1500} rows={3} className="w-full rounded border border-[var(--filet)] bg-[var(--ivoire)] p-2" /></label>}
      <BoutonEnvoi variant={operation === "refus" || operation === "remise_en_attente" ? "outline" : "default"} disabled={operation === "validation" && !siretVerifie}>{libelles[operation]}</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="text-sm text-[var(--destructive)]">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}
    </form>
  );
}
