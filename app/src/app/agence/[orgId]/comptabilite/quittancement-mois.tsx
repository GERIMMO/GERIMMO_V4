"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  encaisserReste,
  emettreQuittanceBail,
  envoyerQuittancesMois,
} from "@/app/actions/quittancement";
import type { EtatLoyers } from "@/app/actions/loyers";
import { Button } from "@/components/ui/button";
import { eur } from "@/lib/ged";
import { COULEURS_STATUT_APPEL_LOYER, STATUTS_APPEL_LOYER } from "@/lib/baux";

// Carte « Quittancement du mois » (maquette v3) : le mois d'un coup d'œil,
// l'encaissement en un clic, l'envoi groupé des quittances.

export type LigneQuittancement = {
  bail_id: string;
  appel_id: string;
  lot_id: string;
  lot_nom: string;
  locataire: string | null;
  montant_du: number;
  montant_couvert: number;
  statut: string;
  quittance_id: string | null;
  est_quittance: boolean | null;
  email_envoye_at: string | null;
};

function BoutonEncaisser({
  orgId,
  ligne,
}: {
  orgId: string;
  ligne: LigneQuittancement;
}) {
  const [etat, action, enCours] = useActionState<EtatLoyers, FormData>(
    async () => encaisserReste(orgId, ligne.bail_id, ligne.appel_id),
    {}
  );
  const reste = Number(ligne.montant_du) - Number(ligne.montant_couvert);
  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : `Encaisser ${eur(reste)}`}
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

function BoutonEmettre({ orgId, bailId }: { orgId: string; bailId: string }) {
  const [etat, action, enCours] = useActionState<EtatLoyers, FormData>(
    async () => emettreQuittanceBail(orgId, bailId),
    {}
  );
  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>
        {enCours ? "…" : "Émettre la quittance"}
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

export function QuittancementMois({
  orgId,
  mois,
  moisLabel,
  lignes,
}: {
  orgId: string;
  // « YYYY-MM » du mois affiché (celui de l'envoi groupé)
  mois: string;
  moisLabel: string;
  lignes: LigneQuittancement[];
}) {
  const [etatEnvoi, actionEnvoi, envoiEnCours] = useActionState<EtatLoyers, FormData>(
    async () => envoyerQuittancesMois(orgId, mois),
    {}
  );
  const payees = lignes.filter((l) => l.statut === "paye").length;
  const aEnvoyer = lignes.filter((l) => l.quittance_id && !l.email_envoye_at).length;

  return (
    <div className="space-y-3">
      <div className="entete-carte !mb-0">
        <h3 className="text-base font-medium">Quittancement de {moisLabel}</h3>
        <span className="flex items-center gap-3">
          {aEnvoyer > 0 && (
            <form action={actionEnvoi}>
              <Button type="submit" size="sm" variant="outline" disabled={envoiEnCours}>
                {envoiEnCours ? "Envoi…" : `Envoyer les quittances (${aEnvoyer})`}
              </Button>
            </form>
          )}
          <span className="mono-discret">
            {payees} / {lignes.length} encaissée{payees > 1 ? "s" : ""}
          </span>
        </span>
      </div>
      {(etatEnvoi.succes || etatEnvoi.erreur) && (
        <p className={`text-sm ${etatEnvoi.erreur ? "text-destructive" : "text-success-soft-foreground"}`}>
          {etatEnvoi.succes ?? etatEnvoi.erreur}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="libelle-champ py-2 pr-3 font-normal">Locataire</th>
              <th className="libelle-champ py-2 pr-3 font-normal">Lot</th>
              <th className="libelle-champ py-2 pr-3 text-right font-normal">Montant</th>
              <th className="libelle-champ py-2 text-right font-normal" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.appel_id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">
                  <Link href={`/agence/${orgId}/baux/${l.bail_id}`} className="font-medium hover:underline">
                    {l.locataire ?? "—"}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{l.lot_nom}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {eur(l.montant_du)}
                  {l.statut === "partiel" && (
                    <span className="block text-xs text-muted-foreground">
                      réglé {eur(l.montant_couvert)}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    <span
                      className={COULEURS_STATUT_APPEL_LOYER[l.statut] ?? "puce puce-grise"}
                    >
                      {STATUTS_APPEL_LOYER[l.statut] ?? l.statut}
                    </span>
                    {l.statut === "paye" ? (
                      l.quittance_id ? (
                        <>
                          <Link
                            href={`/quittance/${l.quittance_id}`}
                            target="_blank"
                            className="text-xs text-[var(--bleu)] underline-offset-2 hover:underline"
                          >
                            {l.est_quittance ? "quittance" : "reçu"}
                          </Link>
                          {l.email_envoye_at && (
                            <span className="text-xs text-muted-foreground">✉ envoyée</span>
                          )}
                        </>
                      ) : (
                        <BoutonEmettre orgId={orgId} bailId={l.bail_id} />
                      )
                    ) : (
                      <>
                        <BoutonEncaisser orgId={orgId} ligne={l} />
                        {l.statut === "impaye" && (
                          <Link
                            href={`/agence/${orgId}/baux/${l.bail_id}`}
                            className="text-xs text-destructive underline-offset-2 hover:underline"
                          >
                            Relancer ›
                          </Link>
                        )}
                      </>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        L&apos;encaissement déclenche tout : quittance émise (un paiement partiel
        produit un reçu, promu en quittance au solde), écriture de recette et
        honoraires au taux du mandat. Le premier loyer d&apos;un bail est quittancé
        au prorata de la date d&apos;entrée. L&apos;encaissement en un clic vaut
        virement du jour — corrigeable depuis la fiche du bail.
      </p>
    </div>
  );
}
