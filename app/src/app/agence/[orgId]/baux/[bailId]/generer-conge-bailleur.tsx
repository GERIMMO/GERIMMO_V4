"use client";

import { useState } from "react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formaterDate } from "@/lib/ged";

// Génération du congé délivré par le bailleur : le motif (vente, reprise ou
// motif légitime et sérieux) et ses précisions sont les choix du geste — ils
// partent en `options`, rien n'est écrit en base. Le PDF se notifie hors
// plateforme (LRAR, acte d'huissier ou remise en main propre) : Gerimmo
// génère et suit, il ne notifie jamais (RM-A3.1).
// Audit 29/09 : la date d'effet n'est plus saisie — c'est le terme du bail
// calculé par la base pour la date de présentation prévue ; le prix est exigé
// pour un congé pour vente d'un logement loué nu (le congé vaut offre, art. 15 II).
export function GenererCongeBailleur({
  orgId,
  bailId,
  cheminRetour,
  meuble,
  terme,
}: {
  orgId: string;
  bailId: string;
  cheminRetour: string;
  /** Location meublée : pas d'offre de vente, prix facultatif (art. 25-8). */
  meuble: boolean;
  /** Terme de la période en cours, calculé par la base (null : incalculable). */
  terme: string | null;
}) {
  const [motif, setMotif] = useState<"vente" | "reprise" | "motif_legitime">("vente");
  const [beneficiaireNom, setBeneficiaireNom] = useState("");
  const [beneficiaireLien, setBeneficiaireLien] = useState("");
  const [motifDetail, setMotifDetail] = useState("");
  const [datePresentation, setDatePresentation] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [conditionsVente, setConditionsVente] = useState("");
  const prixExige = motif === "vente" && !meuble;
  const prixManquant = prixExige && !prixVente.trim();

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Le congé du bailleur ne vaut qu&apos;au terme du bail : il doit parvenir au
        locataire au moins <b className="font-semibold">{meuble ? "3 mois" : "6 mois"}</b> avant
        l&apos;échéance. À notifier par lettre recommandée AR, acte d&apos;huissier ou remise
        en main propre contre émargement — à chaque locataire individuellement.
        {terme
          ? ` Terme de la période en cours : ${formaterDate(terme)} — si le préavis n'y tient plus à la date de présentation, le congé vise l'échéance suivante.`
          : " Le terme du bail ne se calcule pas (durée réduite ou date de début manquante) : il restera à compléter sur l'épreuve."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="conge-b-motif" className="text-xs">
            Motif
          </Label>
          <select
            id="conge-b-motif"
            value={motif}
            onChange={(e) =>
              setMotif(
                e.target.value === "reprise"
                  ? "reprise"
                  : e.target.value === "motif_legitime"
                    ? "motif_legitime"
                    : "vente"
              )
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="vente">Vente</option>
            <option value="reprise">Reprise</option>
            <option value="motif_legitime">Motif légitime et sérieux</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="conge-b-presentation" className="text-xs">
            Présentation prévue au locataire (aujourd&apos;hui par défaut)
          </Label>
          <Input
            id="conge-b-presentation"
            type="date"
            value={datePresentation}
            onChange={(e) => setDatePresentation(e.target.value)}
          />
        </div>
        {motif === "vente" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="conge-b-prix" className="text-xs">
                Prix de vente proposé (€){prixExige ? " — obligatoire" : " — facultatif en meublé"}
              </Label>
              <Input
                id="conge-b-prix"
                inputMode="decimal"
                placeholder="ex. 245 000"
                value={prixVente}
                onChange={(e) => setPrixVente(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="conge-b-conditions" className="text-xs">
                Conditions de la vente
              </Label>
              <Input
                id="conge-b-conditions"
                placeholder="ex. vente libre de toute occupation, frais d'acte à la charge de l'acquéreur"
                value={conditionsVente}
                onChange={(e) => setConditionsVente(e.target.value)}
              />
            </div>
          </>
        )}
        {motif === "reprise" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="conge-b-beneficiaire" className="text-xs">
                Bénéficiaire de la reprise
              </Label>
              <Input
                id="conge-b-beneficiaire"
                placeholder="ex. Marie Dupont"
                value={beneficiaireNom}
                onChange={(e) => setBeneficiaireNom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="conge-b-lien" className="text-xs">
                Lien avec le bailleur
              </Label>
              <Input
                id="conge-b-lien"
                placeholder="ex. fille du bailleur"
                value={beneficiaireLien}
                onChange={(e) => setBeneficiaireLien(e.target.value)}
              />
            </div>
          </>
        )}
        {motif === "motif_legitime" && (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="conge-b-detail" className="text-xs">
              Motif invoqué
            </Label>
            <Input
              id="conge-b-detail"
              placeholder="ex. impayés répétés malgré mises en demeure"
              value={motifDetail}
              onChange={(e) => setMotifDetail(e.target.value)}
            />
          </div>
        )}
      </div>
      {prixManquant && (
        <p className="text-xs text-muted-foreground">
          En location nue, le congé pour vendre vaut offre de vente au locataire : le prix
          proposé doit y figurer, le PDF ne se génère pas sans lui.
        </p>
      )}
      <BoutonGenererDocument
        orgId={orgId}
        code="conge_bailleur"
        cibleId={bailId}
        cheminRetour={cheminRetour}
        libelle="Générer le congé (PDF)"
        options={{
          motif,
          ...(motif === "reprise" && beneficiaireNom.trim()
            ? { beneficiaire_nom: beneficiaireNom.trim() }
            : {}),
          ...(motif === "reprise" && beneficiaireLien.trim()
            ? { beneficiaire_lien: beneficiaireLien.trim() }
            : {}),
          ...(motif === "motif_legitime" && motifDetail.trim()
            ? { motif_detail: motifDetail.trim() }
            : {}),
          ...(motif === "vente" && prixVente.trim() ? { prix_vente: prixVente.trim() } : {}),
          ...(motif === "vente" && conditionsVente.trim()
            ? { conditions_vente: conditionsVente.trim() }
            : {}),
          ...(datePresentation ? { date_presentation: datePresentation } : {}),
        }}
      />
    </div>
  );
}
