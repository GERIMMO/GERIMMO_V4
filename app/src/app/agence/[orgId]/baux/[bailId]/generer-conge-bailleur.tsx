"use client";

import { useState } from "react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Génération du congé délivré par le bailleur : le motif (vente, reprise ou
// motif légitime et sérieux) et ses précisions sont les choix du geste — ils
// partent en `options`, rien n'est écrit en base. Le PDF se notifie hors
// plateforme (LRAR, acte d'huissier ou remise en main propre) : Gerimmo
// génère et suit, il ne notifie jamais (RM-A3.1).
export function GenererCongeBailleur({
  orgId,
  bailId,
  cheminRetour,
}: {
  orgId: string;
  bailId: string;
  cheminRetour: string;
}) {
  const [motif, setMotif] = useState<"vente" | "reprise" | "motif_legitime">("vente");
  const [beneficiaireNom, setBeneficiaireNom] = useState("");
  const [beneficiaireLien, setBeneficiaireLien] = useState("");
  const [motifDetail, setMotifDetail] = useState("");
  const [dateEffet, setDateEffet] = useState("");

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Le congé du bailleur ne vaut qu&apos;au terme du bail : il doit parvenir au
        locataire au moins <b className="font-semibold">6 mois</b> avant
        l&apos;échéance en location nue, <b className="font-semibold">3 mois</b> en
        meublé. À notifier par lettre recommandée AR, acte d&apos;huissier ou remise
        en main propre contre émargement — à chaque locataire individuellement.
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
          <Label htmlFor="conge-b-effet" className="text-xs">
            Date d&apos;effet (échéance du bail)
          </Label>
          <Input
            id="conge-b-effet"
            type="date"
            value={dateEffet}
            onChange={(e) => setDateEffet(e.target.value)}
          />
        </div>
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
          ...(dateEffet ? { date_effet: dateEffet } : {}),
        }}
      />
    </div>
  );
}
