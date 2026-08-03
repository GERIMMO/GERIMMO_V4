"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  genererAppels,
  ajouterEncaissement,
  supprimerEncaissement,
  emettreQuittances,
  envoyerQuittance,
  reviserLoyer,
  ajouterRelance,
  supprimerRelance,
  regulariserCharges,
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
export type Quittance = {
  id: string;
  appel_id: string;
  montant: number;
  date_emission: string;
  email_envoye_at: string | null;
  // Paiement intégral → quittance ; paiement partiel → simple reçu (RM-3.4.2)
  est_quittance: boolean;
};
export type Revision = {
  id: string;
  date_effet: string;
  ancien_loyer: number;
  nouveau_loyer: number;
  irl_reference: number;
  irl_nouveau: number;
};
export type RelanceLigne = {
  id: string;
  niveau: string;
  date_envoi: string;
  date_premiere_presentation: string | null;
  numero_recommande: string | null;
};
export type RegulLigne = {
  id: string;
  annee: number;
  provisions: number;
  charges_reelles: number;
  ecart: number;
};

const NIVEAU_RELANCE: Record<string, string> = {
  relance_1: "Relance 1",
  relance_2: "Relance 2",
  mise_en_demeure: "Mise en demeure",
};

function BoutonEnvoiQuittance({ orgId, bailId, quittanceId }: { orgId: string; bailId: string; quittanceId: string }) {
  const [etat, action, enCours] = useActionState<EtatLoyers, FormData>(
    async () => envoyerQuittance(orgId, bailId, quittanceId),
    {}
  );
  return (
    <form action={action} className="flex items-center gap-1">
      <Button type="submit" variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={enCours}>
        {enCours ? "…" : "Envoyer"}
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

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
  relances,
  regularisations,
  chargesForfait,
}: {
  orgId: string;
  bailId: string;
  echeancier: LigneEcheance[];
  encaissements: Encaissement[];
  quittances: Quittance[];
  revisionIrl: boolean;
  revisions: Revision[];
  relances: RelanceLigne[];
  regularisations: RegulLigne[];
  chargesForfait: boolean;
}) {
  const [etatEnc, formEnc, enCoursEnc] = useActionState<EtatLoyers, FormData>(
    ajouterEncaissement.bind(null, orgId, bailId),
    {}
  );
  const [etatRev, formRev, enCoursRev] = useActionState<EtatLoyers, FormData>(
    reviserLoyer.bind(null, orgId, bailId),
    {}
  );
  const [etatRel, formRel, enCoursRel] = useActionState<EtatLoyers, FormData>(
    ajouterRelance.bind(null, orgId, bailId),
    {}
  );
  const [etatReg, formReg, enCoursReg] = useActionState<EtatLoyers, FormData>(
    regulariserCharges.bind(null, orgId, bailId),
    {}
  );
  const impaye = echeancier.some((l) => l.statut === "impaye");
  const anneeDefaut = new Date().getUTCFullYear() - 1;

  const totalDu = echeancier.reduce((s, l) => s + Number(l.montant_du), 0);
  const totalEncaisse = encaissements.reduce((s, e) => s + Number(e.montant), 0);
  const solde = totalDu - totalEncaisse;
  const quittanceParAppel = new Map(quittances.map((q) => [q.appel_id, q]));

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
          <BoutonEcheancier orgId={orgId} bailId={bailId} />
          <BoutonQuittances orgId={orgId} bailId={bailId} />
        </div>
      </div>
      {/* Retour des deux actions du haut — une erreur avalée ici a déjà caché
          un vrai blocage (« Le bail n'a pas de date de début ») pendant la recette */}

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
                <span className={`badge-statut shrink-0 ${st.classe}`}>{st.label}</span>
                {(() => {
                  const q = quittanceParAppel.get(l.appel_id);
                  if (!q) return null;
                  return (
                    <span className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/quittance/${q.id}`}
                        target="_blank"
                        className={`text-xs underline-offset-2 hover:underline ${
                          q.est_quittance ? "text-success-soft-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {q.est_quittance ? "quittance" : "reçu (partiel)"}
                      </Link>
                      {q.email_envoye_at ? (
                        <span className="text-xs text-muted-foreground">✉ envoyée</span>
                      ) : (
                        <BoutonEnvoiQuittance orgId={orgId} bailId={bailId} quittanceId={q.id} />
                      )}
                    </span>
                  );
                })()}
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
                  <Button type="submit" variant="ghost" size="sm">Retirer</Button>
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

      {/* Impayés & relances */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">
          Relances{impaye && <span className="ml-2 text-xs text-destructive">impayé en cours</span>}
        </p>
        {relances.length > 0 && (
          <ul className="divide-y divide-border">
            {relances.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-32 shrink-0">{NIVEAU_RELANCE[r.niveau] ?? r.niveau}</span>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  envoyée {formaterDate(r.date_envoi)}
                  {r.date_premiere_presentation && ` · 1re prés. ${formaterDate(r.date_premiere_presentation)}`}
                  {r.numero_recommande && ` · R${r.numero_recommande}`}
                </span>
                <form action={async () => { await supprimerRelance(orgId, bailId, r.id); }}>
                  <Button type="submit" variant="ghost" size="sm">Retirer</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={formRel} className="flex flex-wrap items-end gap-2">
          <select name="niveau" defaultValue="relance_1" className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="relance_1">Relance 1</option>
            <option value="relance_2">Relance 2</option>
            <option value="mise_en_demeure">Mise en demeure (recommandé)</option>
          </select>
          <div className="space-y-1">
            <Label htmlFor="rel-date" className="text-xs">Envoyée le</Label>
            <Input id="rel-date" name="date_envoi" type="date" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rel-pres" className="text-xs">1re présentation</Label>
            <Input id="rel-pres" name="date_premiere_presentation" type="date" className="h-9" />
          </div>
          <Input name="numero_recommande" placeholder="N° recommandé" className="h-9 w-32" />
          <Button type="submit" size="sm" variant="outline" disabled={enCoursRel}>
            {enCoursRel ? "…" : "Enregistrer la relance"}
          </Button>
          {etatRel.erreur && <p className="w-full text-sm text-destructive">{etatRel.erreur}</p>}
        </form>
        <p className="text-xs text-muted-foreground">
          La mise en demeure part en lettre recommandée avec accusé de réception, hors de la plateforme ; saisissez la date de première présentation
          (le délai court de là).
        </p>
      </div>

      {/* Régularisation des charges — impossible au forfait (RM-3.9.8) */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Régularisation annuelle des charges</p>
        {chargesForfait && (
          <p className="text-sm text-muted-foreground">
            Charges au forfait : aucune régularisation n&apos;est possible, le forfait est
            définitif (loi 89-462, art. 23-1).
          </p>
        )}
        {regularisations.length > 0 && (
          <ul className="text-xs text-muted-foreground">
            {regularisations.map((r) => (
              <li key={r.id}>
                {r.annee} : provisions {eur(r.provisions)} vs réel {eur(r.charges_reelles)} ={" "}
                <span className={r.ecart >= 0 ? "text-success-soft-foreground" : "text-destructive"}>
                  {r.ecart >= 0 ? `trop-perçu ${eur(r.ecart)}` : `complément ${eur(-r.ecart)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!chargesForfait && (
        <form action={formReg} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="reg-annee" className="text-xs">Année</Label>
            <Input id="reg-annee" name="annee" type="number" defaultValue={anneeDefaut} className="h-9 w-24" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reg-reel" className="text-xs">Charges réelles (€)</Label>
            <Input id="reg-reel" name="charges_reelles" type="number" step="0.01" min="0" className="h-9 w-32" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reg-just" className="text-xs">Justificatif</Label>
            <Input id="reg-just" name="justificatif" type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-9" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={enCoursReg}>
            {enCoursReg ? "…" : "Régulariser"}
          </Button>
          {etatReg.erreur && <p className="w-full text-sm text-destructive">{etatReg.erreur}</p>}
          {etatReg.succes && <p className="w-full text-sm text-success-soft-foreground">{etatReg.succes}</p>}
        </form>
        )}
        {!chargesForfait && (
          <p className="text-xs text-muted-foreground">
            Provisions calculées depuis les appels de l&apos;année (prorata inclus) ; justificatif
            obligatoire, joint au décompte du locataire.
          </p>
        )}
      </div>
    </div>
  );
}


function BoutonEcheancier({ orgId, bailId }: { orgId: string; bailId: string }) {
  const [etat, action, enCours] = useActionState<EtatLoyers, FormData>(
    async () => genererAppels(orgId, bailId),
    {}
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Générer l'échéancier"}
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-xs text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}

function BoutonQuittances({ orgId, bailId }: { orgId: string; bailId: string }) {
  const [etat, action, enCours] = useActionState<EtatLoyers, FormData>(
    async () => emettreQuittances(orgId, bailId),
    {}
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Émettre les quittances"}
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-xs text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}
