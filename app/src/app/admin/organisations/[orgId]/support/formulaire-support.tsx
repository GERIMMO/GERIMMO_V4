"use client";

import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { executerEncaissementSupport, preparerEncaissementSupport, type EtatSupportEncaissement } from "@/app/actions/support-encaissement";
import { eur } from "@/lib/ged";

export function FormulaireSupport({ orgId, bailId, appelId, reste, anterieure }: {
  orgId: string; bailId: string; appelId: string; reste: number; anterieure: number;
}) {
  const [preparation, preparer] = useActionState<EtatSupportEncaissement, FormData>(preparerEncaissementSupport.bind(null, orgId), {});
  const [execution, executer] = useActionState<EtatSupportEncaissement, FormData>(executerEncaissementSupport.bind(null, orgId), {});
  if (execution.succes) return <p role="status">{execution.succes}</p>;
  return <div className="space-y-3">
    {preparation.gesteId ? <form data-saisie-confirmee action={executer} className="space-y-3">
      <input type="hidden" name="gesteId" value={preparation.gesteId} />
      <p>Geste préparé pour votre compte, valable cinq minutes à compter de sa préparation. Le solde sera vérifié de nouveau avant l’écriture.</p>
      <label className="flex items-start gap-2"><input type="checkbox" name="confirmation" value="oui" required className="mt-1 size-5" /> Enregistrer maintenant le virement reçu de {eur(reste)}.</label>
      <BoutonEnvoi enCoursTexte="Enregistrement…">Exécuter ce geste de support</BoutonEnvoi>
      {execution.erreur && <p role="alert" className="err">{execution.erreur}</p>}
    </form> : <form data-saisie-confirmee action={preparer} className="space-y-3">
      <input type="hidden" name="bailId" value={bailId} /><input type="hidden" name="appelId" value={appelId} />
      <input type="hidden" name="reste" value={reste} /><input type="hidden" name="anterieure" value={anterieure} />
      <label className="block">Motif du support<textarea name="motif" minLength={10} maxLength={500} required rows={2} className="mt-1 block w-full rounded-lg border p-2" /></label>
      <label className="flex items-start gap-2"><input type="checkbox" name="confirmation" value="oui" required className="mt-1 size-5" /> Je confirme que le virement de {eur(reste)} a déjà été reçu. Ce geste enregistre le règlement dans le dossier.</label>
      {anterieure > 0 && <p>Une dette antérieure de {eur(anterieure)} existe : le règlement couvre les sommes les plus anciennes en premier.</p>}
      <BoutonEnvoi enCoursTexte="Préparation…">Préparer ce seul encaissement</BoutonEnvoi>
      {preparation.erreur && <p role="alert" className="err">{preparation.erreur}</p>}
    </form>}
  </div>;
}
