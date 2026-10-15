"use client";

import { useEffect, useState } from "react";
import { FilePenLine } from "lucide-react";
import { cleDevisLocal, lireDevisLocal, effacerDevisLocal, type BrouillonDevisLocal } from "@/lib/brouillon-devis-local";
import type { PreparationDevis } from "@/lib/parcours-devis-artisan";
import { FormulaireDevis } from "./formulaire-devis";
import { CLASSE_BOUTON_PRINCIPAL, CLASSE_BOUTON_SOBRE } from "../../ui";

export function FormulaireAvecReprise({ compteId, ...props }: {
  compteId: string; sollicitationId: string; echeanceParDefaut: string; initiale?: PreparationDevis | null; erreurPreparation?: string;
  /** D18 (livraison 2) : défini quand le client a demandé une révision ; le formulaire prépare cette version. */
  versionSuivante?: number;
}) {
  const cle = cleDevisLocal(compteId, props.sollicitationId);
  const [lecture, setLecture] = useState<{ pret: boolean; copie: BrouillonDevisLocal | null }>({ pret: false, copie: null });
  const [choix, setChoix] = useState<{ copie?: BrouillonDevisLocal } | null>(null);
  useEffect(() => {
    let actif = true;
    queueMicrotask(() => { if (actif) setLecture({ pret: true, copie: lireDevisLocal(cle) }); });
    return () => { actif = false; };
  }, [cle]);
  if (!lecture.pret) return <p role="status">Préparation du devis…</p>;
  const b = lecture.copie;
  if (b && !choix) {
    const conflit = b.revision !== (props.initiale?.revision ?? 0) || Boolean(props.erreurPreparation);
    return <section className="artisan-carte space-y-4" aria-labelledby="reprise-devis">
      <FilePenLine className="text-[var(--encre)]" aria-hidden />
      <h2 id="reprise-devis" className="text-2xl">Reprendre votre devis</h2>
      <p>Une saisie est conservée sur cet appareil depuis le {new Date(b.enregistreLe).toLocaleString("fr-FR")}.</p>
      <p className="text-sm text-muted-foreground">Elle n’a pas été confirmée sur Gerimmo. La reprise ne valide pas le devis et ne l’envoie pas.</p>
      {conflit ? <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950">La version Gerimmo a changé ou n’a pas pu être vérifiée. Consultez votre copie ci-dessous avant de reprendre la version enregistrée ; elle ne sera pas remplacée automatiquement.</p> : <p className="whitespace-pre-wrap break-words">{b.contenu.diagnostic || "Devis en cours de rédaction"}</p>}
      <details className="rounded-lg border border-[var(--filet)] p-4">
        <summary className="cursor-pointer font-medium">Consulter ma saisie conservée</summary>
        <dl className="mt-3 space-y-3 text-sm">
          {[["Diagnostic", b.contenu.diagnostic], ["Délai", b.contenu.delai], ["Durée", b.contenu.duree], ["Validité", b.contenu.valide_jusqu_au], ["Contraintes", b.contenu.contraintes], ["Observations", b.contenu.observations], ...(props.versionSuivante ? [["Ce qui change", b.contenu.note_revision ?? ""]] : [])].map(([titre, valeur]) => <div key={titre}><dt className="font-semibold">{titre}</dt><dd className="whitespace-pre-wrap break-words">{valeur || "Non renseigné"}</dd></div>)}
        </dl>
        <ul className="mt-4 space-y-2 text-sm">{b.contenu.lignes.map((l, i) => <li key={i} className="break-words">{l.libelle || "Prestation à compléter"} · Quantité : {l.quantite || "à compléter"} · Prix HT : {l.prix || "à compléter"} € · TVA : {l.tva ? `${Number(l.tva)/100} %` : "à choisir"}</li>)}</ul>
      </details>
      <div className="flex flex-wrap gap-3">
        {!conflit && <button className={`${CLASSE_BOUTON_PRINCIPAL} sm:w-auto`} onClick={() => setChoix({ copie: b })}>Reprendre ma saisie</button>}
        <button className={`${CLASSE_BOUTON_SOBRE} sm:w-auto`} onClick={() => { effacerDevisLocal(cle, b); setChoix({}); }}>{conflit ? "Effacer ma copie et garder la version Gerimmo" : "Effacer cette copie"}</button>
      </div>
    </section>;
  }
  return <FormulaireDevis {...props} cleLocale={cle} copieInitiale={choix?.copie} />;
}
