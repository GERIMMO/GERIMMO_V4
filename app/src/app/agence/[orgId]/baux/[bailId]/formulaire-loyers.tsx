"use client";

import { useActionState } from "react";
import {
  genererAppels,
  ajouterEncaissement,
  supprimerEncaissement,
  emettreQuittances,
  reviserLoyer,
  type EtatLoyers,
} from "@/app/actions/loyers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formaterDate } from "@/lib/ged";

export type LigneEcheance = {
  appel_id: string;
  periode: string;
  date_echeance: string;
  montant_du: number;
  montant_couvert: number;
  statut: string;
};
export type Encaissement = {
  id: string;
  montant: number;
  date_paiement: string;
  mode: string | null;
  note: string | null;
};
export type Quittance = { id: string; appel_id: string; montant: number; date_emission: string };
export type Revision = {
  id: string;
  date_effet: string;
  ancien_loyer: number;
  nouveau_loyer: number;
  irl_reference: number;
  irl_nouveau: number;
};

const STATUT: Record<string, { label: string; classe: string }> = {
  paye: { label: "Payé", classe: "bg-success-soft text-success-soft-foreground" },
  partiel: { label: "Partiel", classe: "bg-warning-soft text-warning-soft-foreground" },
  impaye: { label: "Impayé", classe: "bg-destructive/10 text-destructive" },
  attendu: { label: "À échoir", classe: "bg-secondary text-secondary-foreground" },
};

const eur = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;
const mois = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

export function FormulaireLoyers({
  orgId,
  bailId,
  echeancier,
  encaissements,
  quittances,
  revisionIrl,
  revisions,
}: {
  orgId: string;
  bailId: string;
  echeancier: LigneEcheance[];
  encaissements: Encaissement[];
  quittances: Quittance[];
  revisionIrl: boolean;
  revisions: Revision[];
}) {
  const [etatEnc, formEnc, enCoursEnc] = useActionState<EtatLoyers, FormData>(
    ajouterEncaissement.bind(null, orgId, bailId),
    {}
  );
  const [etatRev, formRev, enCoursRev] = useActionState<EtatLoyers, FormData>(
    reviserLoyer.bind(null, orgId, bailId),
    {}
  );

  const totalDu = echeancier.reduce((s, l) => s + Number(l.montant_du), 0);
  const totalEncaisse = encaissements.reduce((s, e) => s + Number(e.montant), 0);
  const solde = totalDu - totalEncaisse;
  const quittancesParAppel = new Set(quittances.map((q) => q.appel_id));

  return (
    <div className="space-y-5">
      {/* Résumé + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Dû <span className="font-medium">{eur(totalDu)}</span> · Encaissé{" "}
          <span className="font-medium">{eur(totalEncaisse)}</span> · Solde{" "}
          <span className={`font-semibold ${solde > 0 ? "text-destructive" : "text-success-soft-foreground"}`}>
            {eur(solde)}
          </span>
        </p>
        <div className="flex gap-2">
          <form action={async () => { await genererAppels(orgId, bailId); }}>
            <Button type="submit" size="sm" variant="outline">
              Générer l&apos;échéancier
            </Button>
          </form>
          <form action={async () => { await emettreQuittances(orgId, bailId); }}>
            <Button type="submit" size="sm" variant="outline">
              Émettre les quittances
            </Button>
          </form>
        </div>
      </div>

      {/* Échéancier */}
      {echeancier.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun appel — cliquez « Générer l&apos;échéancier ».
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {echeancier.map((l) => {
            const st = STATUT[l.statut] ?? STATUT.attendu;
            return (
              <li key={l.appel_id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="w-32 shrink-0 capitalize">{mois(l.periode)}</span>
                <span className="w-24 shrink-0 text-right">{eur(l.montant_du)}</span>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  couvert {eur(l.montant_couvert)} · échéance {formaterDate(l.date_echeance)}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${st.classe}`}>{st.label}</span>
                {quittancesParAppel.has(l.appel_id) && (
                  <span className="shrink-0 text-xs text-muted-foreground">✓ quittance</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Encaissements */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Encaissements (imputés du plus ancien au plus récent)</p>
        {encaissements.length > 0 && (
          <ul className="divide-y divide-border">
            {encaissements.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-24 shrink-0 font-medium">{eur(e.montant)}</span>
                <span className="text-xs text-muted-foreground">{formaterDate(e.date_paiement)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {e.mode ?? ""} {e.note ?? ""}
                </span>
                <form action={async () => { await supprimerEncaissement(orgId, bailId, e.id); }}>
                  <Button type="submit" variant="ghost" size="sm">✕</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={formEnc} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="enc-montant" className="text-xs">Montant (€)</Label>
            <Input id="enc-montant" name="montant" type="number" step="0.01" min="0.01" className="h-9 w-28" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="enc-date" className="text-xs">Date</Label>
            <Input id="enc-date" name="date_paiement" type="date" className="h-9" />
          </div>
          <Input name="mode" placeholder="Mode (virement…)" className="h-9 w-36" />
          <Button type="submit" size="sm" variant="outline" disabled={enCoursEnc}>
            {enCoursEnc ? "…" : "Encaisser"}
          </Button>
          {etatEnc.erreur && <p className="w-full text-sm text-destructive">{etatEnc.erreur}</p>}
        </form>
      </div>

      {/* Révision IRL */}
      {revisionIrl && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Révision annuelle (IRL)</p>
          {revisions.length > 0 && (
            <ul className="text-xs text-muted-foreground">
              {revisions.map((r) => (
                <li key={r.id}>
                  {formaterDate(r.date_effet)} : {eur(r.ancien_loyer)} → {eur(r.nouveau_loyer)} (IRL{" "}
                  {r.irl_reference} → {r.irl_nouveau})
                </li>
              ))}
            </ul>
          )}
          <form action={formRev} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="irl-ref" className="text-xs">IRL de référence</Label>
              <Input id="irl-ref" name="irl_reference" type="number" step="0.01" className="h-9 w-28" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="irl-nouv" className="text-xs">IRL nouveau</Label>
              <Input id="irl-nouv" name="irl_nouveau" type="number" step="0.01" className="h-9 w-28" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="irl-date" className="text-xs">Date d&apos;effet</Label>
              <Input id="irl-date" name="date_effet" type="date" className="h-9" />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={enCoursRev}>
              {enCoursRev ? "…" : "Réviser le loyer"}
            </Button>
            {etatRev.erreur && <p className="w-full text-sm text-destructive">{etatRev.erreur}</p>}
            {etatRev.succes && <p className="w-full text-sm text-success-soft-foreground">{etatRev.succes}</p>}
          </form>
          <p className="text-xs text-muted-foreground">
            Nouveau loyer = loyer × IRL nouveau / IRL de référence. Interdit si DPE F/G ;
            le dépôt et les provisions ne changent pas.
          </p>
        </div>
      )}
    </div>
  );
}
