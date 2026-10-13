"use client";

import { useEffect, useState } from "react";
import { FilePenLine } from "lucide-react";
import { FormulaireBien } from "../formulaire-bien";
import { Button } from "@/components/ui/button";
import { cleBrouillonBien, effacerBrouillonBien, lireBrouillonBien, type BrouillonBien } from "@/lib/brouillon-bien";

export function FormulaireAvecBrouillon({ orgId, compteId, cleCreation, proprietaireAutomatique }: {
  orgId: string; compteId: string; cleCreation: string; proprietaireAutomatique: boolean;
}) {
  const cle = cleBrouillonBien(compteId, orgId);
  const [lecture, setLecture] = useState<{ disponible: BrouillonBien | null; pret: boolean }>({ disponible: null, pret: false });
  const [choix, setChoix] = useState<{ initial?: BrouillonBien } | null>(null);
  useEffect(() => {
    let actif = true;
    queueMicrotask(() => { if (actif) setLecture({ disponible: lireBrouillonBien(cle), pret: true }); });
    return () => { actif = false; };
  }, [cle]);

  if (!lecture.pret) return <p role="status" className="text-sm text-muted-foreground">Préparation du formulaire…</p>;
  const b = lecture.disponible;
  if (b && !choix) return <section className="rounded-2xl border border-primary/20 bg-card p-6 shadow-sm" aria-labelledby="reprise-lot-titre">
    <FilePenLine className="mb-3 text-primary" aria-hidden="true" />
    <h2 id="reprise-lot-titre" className="text-xl font-semibold">Reprendre votre lot</h2>
    <p className="mt-2 font-medium">{b.champs.nom || "Lot en cours de préparation"}</p>
    <p className="text-sm text-muted-foreground">{b.champs.address_line1} {b.champs.city}</p>
    <p className="my-4 text-sm">Votre saisie a été conservée sur cet appareil. Si vous aviez déjà envoyé la création, la reprise retrouvera le même dossier sans le créer une seconde fois.</p>
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setChoix({ initial: b })}>Reprendre le brouillon</Button>
      <Button variant="outline" onClick={() => { effacerBrouillonBien(cle, b.creationId); setChoix({}); }}>Effacer ce brouillon</Button>
    </div>
  </section>;
  return <FormulaireBien orgId={orgId} cleCreation={choix?.initial?.creationId ?? cleCreation}
    guide proprietaireAutomatique={proprietaireAutomatique} cleBrouillon={cle} brouillonInitial={choix?.initial} />;
}
