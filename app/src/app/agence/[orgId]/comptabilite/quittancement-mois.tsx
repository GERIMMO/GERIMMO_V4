"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  encaisserReste,
  emettreQuittanceBail,
  envoyerQuittancesMois,
} from "@/app/actions/quittancement";
import type { EtatLoyers } from "@/app/actions/loyers";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { eur, moisEnFrancais } from "@/lib/ged";
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
  // Dette du bail ANTÉRIEURE à ce terme (RM-3.3.2) : l'argent y ira d'abord.
  // Nulle quand ce terme est bien le plus ancien encore dû.
  dette_anterieure_periode: string | null;
  dette_anterieure_reste: number | null;
};

// Statut et actions d'une ligne (encaisser, relancer, quittance) — partagés
// entre le tableau (≥ sm) et les cartes empilées du mobile.
//
// Les deux actions tiennent leur état ICI, pas dans les boutons : un
// encaissement réussi fait basculer la ligne en « payé » et retire le bouton
// de l'arbre. Son compte rendu disparaîtrait avec lui — soit exactement le
// défaut qu'on répare. Porté par la ligne, il survit au basculement.
function ActionsLigne({ orgId, ligne: l }: { orgId: string; ligne: LigneQuittancement }) {
  const [etatEnc, actionEnc] = useActionState<EtatLoyers, FormData>(
    async () => encaisserReste(orgId, l.bail_id, l.appel_id),
    {}
  );
  const [etatEmi, actionEmi] = useActionState<EtatLoyers, FormData>(
    async () => emettreQuittanceBail(orgId, l.bail_id),
    {}
  );
  const reste = Number(l.montant_du) - Number(l.montant_couvert);
  // Le bouton verse le reste de CE terme, mais la base l'impute au plus ancien
  // impayé (RM-3.3.2). Quand c'est ailleurs, le libellé le dit : promettre ce
  // terme puis ne pas le solder, c'est ce qui faisait recliquer l'agent.
  const detteAnterieure = Number(l.dette_anterieure_reste ?? 0);
  const termeServiDAbord = detteAnterieure > 0 ? l.dette_anterieure_periode : null;
  const compteRendu = etatEnc.succes ?? etatEmi.succes;
  const erreur = etatEnc.erreur ?? etatEmi.erreur;

  return (
    <>
      <span className={COULEURS_STATUT_APPEL_LOYER[l.statut] ?? "puce puce-grise"}>
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
          <form action={actionEmi} className="inline-flex flex-wrap items-center gap-1.5">
            <BoutonEnvoi size="sm" variant="ghost">
              Émettre la quittance
            </BoutonEnvoi>
          </form>
        )
      ) : (
        <>
          <form action={actionEnc} className="inline-flex flex-wrap items-center gap-1.5">
            <BoutonEnvoi size="sm" variant="outline">
              {termeServiDAbord
                ? `Encaisser ${eur(reste)} (${moisEnFrancais(termeServiDAbord)} d'abord)`
                : `Encaisser ${eur(reste)}`}
            </BoutonEnvoi>
          </form>
          {termeServiDAbord && (
            <span className="text-xs text-muted-foreground">
              {eur(detteAnterieure)} de dette antérieure
            </span>
          )}
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
      {erreur && <span className="block w-full text-xs text-destructive">{erreur}</span>}
      {!erreur && compteRendu && (
        <span className="block w-full text-xs text-success-soft-foreground">{compteRendu}</span>
      )}
    </>
  );
}

export function QuittancementMois({
  orgId,
  mois,
  moisLabel,
  lignes,
  proprietaire = false,
}: {
  orgId: string;
  // « YYYY-MM » du mois affiché (celui de l'envoi groupé)
  mois: string;
  moisLabel: string;
  lignes: LigneQuittancement[];
  // Propriétaire direct : pas de mandat, donc jamais d'honoraires
  proprietaire?: boolean;
}) {
  const [etatEnvoi, actionEnvoi] = useActionState<EtatLoyers, FormData>(
    async () => envoyerQuittancesMois(orgId, mois),
    {}
  );
  const payees = lignes.filter((l) => l.statut === "paye").length;
  const aEnvoyer = lignes.filter((l) => l.quittance_id && !l.email_envoye_at).length;

  return (
    <div className="space-y-3">
      <div className="entete-carte !mb-0">
        <h3 className="text-base font-medium">Quittancement de {moisLabel}</h3>
        <span className="flex flex-wrap items-center gap-3">
          {aEnvoyer > 0 && (
            <form action={actionEnvoi}>
              <BoutonEnvoi enCoursTexte="Envoi…" size="sm" variant="outline">
                {`Envoyer les quittances (${aEnvoyer})`}
              </BoutonEnvoi>
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
      {/* Sous sm, le tableau devient des cartes empilées : « Encaisser » reste
          atteignable sans défilement horizontal. */}
      <ul className="space-y-3 sm:hidden">
        {lignes.map((l) => (
          <li
            key={l.appel_id}
            className="space-y-1.5 border-b border-border pb-3 last:border-0 last:pb-0"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Link
                href={`/agence/${orgId}/baux/${l.bail_id}`}
                className="font-medium hover:underline"
              >
                {l.locataire ?? "—"}
              </Link>
              <span className="whitespace-nowrap">
                {eur(l.montant_du)}
                {l.statut === "partiel" && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    réglé {eur(l.montant_couvert)}
                  </span>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{l.lot_nom}</p>
            <div className="flex flex-wrap items-center gap-2">
              <ActionsLigne orgId={orgId} ligne={l} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
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
                    <ActionsLigne orgId={orgId} ligne={l} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        L&apos;encaissement déclenche tout : quittance émise (un paiement partiel
        produit un reçu, promu en quittance au solde), écriture de recette
        {proprietaire ? " au livre — sans honoraires, jamais" : " et honoraires au taux du mandat"}. Le premier loyer d&apos;un bail est quittancé
        au prorata de la date d&apos;entrée. L&apos;argent s&apos;impute toujours du
        terme le plus ancien au plus récent (RM-3.3.2) : quand une dette
        antérieure existe, le bouton dit sur quel terme il ira, et le compte
        rendu dit où il est allé. L&apos;encaissement en un clic vaut virement du
        jour — corrigeable depuis la fiche du bail.
      </p>
    </div>
  );
}
