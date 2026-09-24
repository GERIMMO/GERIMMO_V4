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
import { CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eur, moisEnFrancais } from "@/lib/ged";
import { COULEURS_STATUT_APPEL_LOYER, STATUTS_APPEL_LOYER } from "@/lib/baux";

// Carte « Quittancement du mois » (maquette v3) : le mois d'un coup d'œil,
// l'encaissement en un clic, l'envoi groupé des quittances.
//
// Le composant rend l'EN-TÊTE et le CORPS d'une carte (CardHeader +
// CardContent) : l'appelant le pose directement dans <Card>, comme les cartes
// voisines — il n'y a plus de titre logé dans un CardContent, ni la bande vide
// de 50 px qu'il laissait au-dessus (24/09).

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
// Chaque cible (bouton, lien) porte `relative z-10` : le rang entier est un
// lien vers le bail (le `::after` du nom du locataire le couvre), et ces
// gestes doivent rester des cibles à part au-dessus de lui (24/09).
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
        {STATUTS_APPEL_LOYER[l.statut] ?? "État du paiement à vérifier"}
      </span>
      {l.statut === "paye" ? (
        l.quittance_id ? (
          <>
            {/* .lien-discret EST ce lien bleu 12 px : il était refait à la
                main à côté de deux autres recettes de lien dans la zone. */}
            <Link
              href={`/quittance/${l.quittance_id}`}
              target="_blank"
              className="lien-discret relative z-10"
            >
              {l.est_quittance ? "quittance" : "reçu"}
            </Link>
            {l.email_envoye_at && (
              <span className="text-xs text-muted-foreground">✉ envoyée</span>
            )}
          </>
        ) : (
          <form action={actionEmi} className="relative z-10 inline-flex flex-wrap items-center gap-1.5">
            <BoutonEnvoi size="sm" variant="ghost">
              Émettre la quittance
            </BoutonEnvoi>
          </form>
        )
      ) : (
        <>
          <form action={actionEnc} className="relative z-10 inline-flex flex-wrap items-center gap-1.5">
            <BoutonEnvoi size="sm" variant="outline">
              {termeServiDAbord
                ? `Encaisser ${eur(reste)} (${moisEnFrancais(termeServiDAbord)} d'abord)`
                : `Encaisser ${eur(reste)}`}
            </BoutonEnvoi>
          </form>
          {termeServiDAbord && (
            <span className="montant text-xs text-muted-foreground">
              {eur(detteAnterieure)} de dette antérieure
            </span>
          )}
          {/* Même geste, même cible et même libellé que la carte « Impayés à
              relancer » de la page : la relance se consigne dans la section
              des loyers du bail (24/09). */}
          {l.statut === "impaye" && (
            <Link
              href={`/agence/${orgId}/baux/${l.bail_id}#loyers`}
              className="lien-discret relative z-10"
            >
              Relancer sur le bail →
            </Link>
          )}
        </>
      )}
      {erreur && <span className="block w-full text-left text-xs text-destructive">{erreur}</span>}
      {!erreur && compteRendu && (
        <span className="block w-full text-left text-xs text-success-soft-foreground">{compteRendu}</span>
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
  // L'envoi groupé part pour les quittances ET les reçus d'un paiement
  // partiel : le bouton nomme ce qu'il envoie. « Envoyer les quittances (1) »
  // pour un seul reçu faisait croire qu'on quittançait un loyer non soldé
  // (24/09). Même accord que libelleEmission (lib/quittances).
  const nonEnvoyes = lignes.filter((l) => l.quittance_id && !l.email_envoye_at);
  const quittancesAEnvoyer = nonEnvoyes.filter((l) => l.est_quittance).length;
  const recusAEnvoyer = nonEnvoyes.length - quittancesAEnvoyer;
  const libelleEnvoi = `Envoyer ${[
    quittancesAEnvoyer > 0 && `${quittancesAEnvoyer} quittance${quittancesAEnvoyer > 1 ? "s" : ""}`,
    recusAEnvoyer > 0 && `${recusAEnvoyer} reçu${recusAEnvoyer > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" et ")}`;

  return (
    <>
      <CardHeader>
        {/* Niveau 2 : la page ne porte qu'un h1 — un h3 y sautait un niveau. */}
        <CardTitle role="heading" aria-level={2}>
          Quittancement de {moisLabel}
        </CardTitle>
        {/* « réglé en entier » : la formule de la tuile Encaissé de la page.
            « 0 / 1 encaissée », au féminin et collé au bouton d'envoi,
            semblait compter des quittances (24/09). Sur téléphone, le bloc
            passe sous le titre au lieu de le comprimer. */}
        <CardAction className="flex flex-wrap items-center justify-end gap-3 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-2 max-sm:justify-self-start max-sm:justify-start">
          {nonEnvoyes.length > 0 && (
            <form action={actionEnvoi}>
              <BoutonEnvoi enCoursTexte="Envoi…" size="sm" variant="outline">
                {libelleEnvoi}
              </BoutonEnvoi>
            </form>
          )}
          <span className="mono-discret">
            {payees} / {lignes.length} réglé{payees > 1 ? "s" : ""} en entier
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {(etatEnvoi.succes || etatEnvoi.erreur) && (
          <p className={`text-sm ${etatEnvoi.erreur ? "text-destructive" : "text-success-soft-foreground"}`}>
            {etatEnvoi.succes ?? etatEnvoi.erreur}
          </p>
        )}
        {/* Sous sm, le tableau devient des cartes empilées : « Encaisser » reste
            atteignable sans défilement horizontal. */}
        {/* TOUT LE RANG MÈNE AU BAIL (24/09, « je veux que tout le carré soit
            cliquable ») : seul le nom du locataire était un lien, noir et sans
            signe. Le lien du nom s'étend au rang par son `::after` ; les gestes
            (encaisser, relancer, quittance) restent des cibles à part au-dessus
            de lui. Même comportement que la liste « Impayés à relancer ». */}
        <ul className="space-y-1 sm:hidden">
          {lignes.map((l) => (
            <li
              key={l.appel_id}
              className="relative -mx-2 space-y-1.5 rounded-lg border-b border-border px-2 py-2 last:border-0 hover:bg-[var(--survol)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link
                  href={`/agence/${orgId}/baux/${l.bail_id}#loyers`}
                  className="font-medium after:absolute after:inset-0 after:rounded-lg after:content-['']"
                >
                  {l.locataire ?? "—"}
                </Link>
                <span className="montant whitespace-nowrap">
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
        {/* .tableau : une seule mise en forme de tableau dans toute la zone, et
            des montants en chiffres de même chasse (.nombre) — sans quoi une
            colonne d'euros ne se compare pas d'un rang à l'autre. */}
        <div className="tableau-defilant hidden sm:block">
          <table className="tableau">
            <thead>
              <tr>
                <th>Locataire</th>
                <th>Lot</th>
                <th className="nombre">Montant</th>
                <th>
                  <span className="sr-only">Statut et actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.appel_id} className="relative hover:bg-[var(--survol)]">
                  <td>
                    <Link
                      href={`/agence/${orgId}/baux/${l.bail_id}#loyers`}
                      className="font-medium after:absolute after:inset-0 after:content-['']"
                    >
                      {l.locataire ?? "—"}
                    </Link>
                  </td>
                  <td className="text-muted-foreground">{l.lot_nom}</td>
                  <td className="nombre montant">
                    {eur(l.montant_du)}
                    {l.statut === "partiel" && (
                      <span className="block text-xs text-muted-foreground">
                        réglé {eur(l.montant_couvert)}
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <ActionsLigne orgId={orgId} ligne={l} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Une phrase, le détail replié (24/09) : cinq lignes de mode d'emploi
            en 12 px gris sous le tableau — neuf sur téléphone, en partie sous
            la bulle d'aide — faisaient lire l'écran comme une notice.
            Imputation du plus ancien au plus récent : RM-3.3.2. */}
        <p className="text-xs text-muted-foreground">
          Un encaissement émet le reçu ou la quittance et passe l&apos;écriture —
          corrigeable depuis le bail.
        </p>
        <details className="information-depliable text-xs text-muted-foreground">
          <summary className="justify-start gap-1.5 text-sm">
            Comment ça marche
            <span aria-hidden className="information-chevron">⌄</span>
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              Un paiement partiel produit un reçu, promu en quittance au solde ;
              l&apos;écriture de recette
              {proprietaire
                ? " s'inscrit au livre — sans honoraires, jamais."
                : " s'accompagne des honoraires au taux du mandat."}
            </li>
            <li>
              Le premier loyer d&apos;un bail est quittancé au prorata de la date
              d&apos;entrée.
            </li>
            <li>
              L&apos;argent s&apos;impute toujours du terme le plus ancien au plus
              récent : quand une dette antérieure existe, le bouton dit sur quel
              terme il ira, et le compte rendu dit où il est allé.
            </li>
            <li>
              L&apos;encaissement en un clic vaut virement du jour ; un autre mode ou
              une autre date se saisit sur le bail.
            </li>
          </ul>
        </details>
      </CardContent>
    </>
  );
}
