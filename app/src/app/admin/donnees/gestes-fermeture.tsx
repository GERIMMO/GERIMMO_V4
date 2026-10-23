"use client";
import { annulerFermetureCompte, gelerFermetureCompte } from "@/app/actions/fermeture-compte";
import { useActionRetour } from "@/lib/use-action-retour";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

const champ = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/** Annuler (motif obligatoire) ou geler / lever le gel d'une fermeture encore programmée. */
export function GestesFermeture({ id, gelee }: { id: string; gelee: boolean }) {
  const annulation = useActionRetour(annulerFermetureCompte);
  const gel = useActionRetour(gelerFermetureCompte);
  return <div className="grid gap-3 text-sm sm:grid-cols-2">
    <form data-saisie-confirmee onSubmit={annulation.soumettre} className="space-y-2" aria-busy={annulation.enCours}>
      <input type="hidden" name="fermeture_id" value={id} />
      <label className="block space-y-1"><span>Motif de l’annulation</span><input name="motif" className={champ} required minLength={5} maxLength={1000} /></label>
      {annulation.etat.erreur && <p role="alert" className="err">{annulation.etat.erreur}</p>}
      {annulation.etat.succes && <p role="status">{annulation.etat.succes}</p>}
      <BoutonEnvoi size="sm" variant="outline" enCours={annulation.enCours} enCoursTexte="Annulation…">Annuler la fermeture</BoutonEnvoi>
    </form>
    <form data-saisie-confirmee onSubmit={gel.soumettre} className="space-y-2" aria-busy={gel.enCours}>
      <input type="hidden" name="fermeture_id" value={id} />
      {gelee ? <input type="hidden" name="motif" value="" />
        : <label className="block space-y-1"><span>Motif du gel (litige, créance)</span><input name="motif" className={champ} required minLength={5} maxLength={1000} /></label>}
      {gel.etat.erreur && <p role="alert" className="err">{gel.etat.erreur}</p>}
      {gel.etat.succes && <p role="status">{gel.etat.succes}</p>}
      <BoutonEnvoi size="sm" variant="outline" enCours={gel.enCours} enCoursTexte="Enregistrement…">{gelee ? "Lever le gel" : "Geler la fermeture"}</BoutonEnvoi>
    </form>
  </div>;
}
