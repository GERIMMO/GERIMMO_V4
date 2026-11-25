"use client";

import { useState } from "react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBaseEspace } from "@/components/racine-espace-contexte";
import { CERTIFICATION_SANS_GARANTIE_CUMULEE, DECLARATION_ETUDIANT_NON_BOURSIER } from "@/lib/textes-signature-actes";

// Génération de l'acte de cautionnement : un acte par garant du bail, avec
// les choix du geste (forme solidaire ou simple, plafond garanti en euros).
// Le plafond est exigé à peine de nullité de l'engagement — laissé vide, il
// reste en libellé d'épreuve dans le PDF et remonte dans les manquants.
export function CarteCautionnement({
  orgId,
  bailId,
  garants,
}: {
  orgId: string;
  bailId: string;
  garants: { id: string; nom: string }[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Depuis 2022, la mention type peut être dactylographiée : le PDF
        l&apos;imprime dans un encadré que la caution appose elle-même avant de
        signer. La forme solidaire permet de poursuivre la caution sans
        discuter d&apos;abord le locataire.
      </p>
      {/* Textes officiels, lot T2 (R03-A1) : la règle de l'article 22-1 de la loi du 6 juillet 1989, lue dans le recueil ; le
          serveur refuse l'acte (assemblerCautionnement). L'ancien texte n'était qu'un rappel (« Gerimmo ne contrôle pas »). */}
      <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm" data-rappel-caution-societe>
        <strong>Bailleur en société (SCI non familiale, autre personne morale) :</strong> la loi ne lui permet de
        demander la caution d’une personne que si le logement est loué à un étudiant qui ne bénéficie pas d’une
        bourse de l’enseignement supérieur. Hors de ce cas, Gerimmo ne prépare pas l’acte. Une SCI familiale
        (constituée entre parents et alliés jusqu’au quatrième degré) n’est pas concernée.
      </p>
      <p className="text-xs text-muted-foreground" data-rappel-caution-colocation>
        Bail à plusieurs locataires : l’acte nomme le locataire pour lequel la caution s’engage. Gerimmo ne le
        prépare pas tant que le garant n’est pas rattaché à l’un d’eux (personnes du bail).
      </p>
      <div className="divide-y divide-border">
        {garants.map((g) => (
          <LigneGarant key={g.id} orgId={orgId} bailId={bailId} garant={g} />
        ))}
      </div>
    </div>
  );
}

function LigneGarant({
  orgId,
  bailId,
  garant,
}: {
  orgId: string;
  bailId: string;
  garant: { id: string; nom: string };
}) {
  // Décision D27 : chez le propriétaire direct, les liens de cet espace vivent sous /espace/<id>.
  const base = useBaseEspace(orgId);
  const [forme, setForme] = useState<"solidaire" | "simple">("solidaire");
  const [montantMax, setMontantMax] = useState("");
  // Constat R30 : sans cette case, le serveur refuse de préparer l'acte (assemblerCautionnement).
  const [sansGarantie, setSansGarantie] = useState(false);
  // Lot T2 (R03-A1) : déclaration facultative ; elle ne compte que pour un bailleur en société non familiale.
  const [etudiantNonBoursier, setEtudiantNonBoursier] = useState(false);

  return (
    <div className="space-y-2 py-3">
      <p className="text-sm font-medium">{garant.nom}</p>
      <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
        <div className="space-y-1">
          <Label htmlFor={`caut-forme-${garant.id}`} className="text-xs">
            Forme
          </Label>
          <select
            id={`caut-forme-${garant.id}`}
            value={forme}
            onChange={(e) => setForme(e.target.value === "simple" ? "simple" : "solidaire")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="solidaire">Caution solidaire</option>
            <option value="simple">Caution simple</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`caut-plafond-${garant.id}`} className="text-xs">
            Montant maximal garanti (€)
          </Label>
          <Input
            id={`caut-plafond-${garant.id}`}
            type="text"
            inputMode="decimal"
            placeholder="ex. 15000"
            value={montantMax}
            onChange={(e) => setMontantMax(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 text-xs sm:col-span-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={sansGarantie}
            onChange={(e) => setSansGarantie(e.target.checked)}
          />
          <span>{CERTIFICATION_SANS_GARANTIE_CUMULEE}</span>
        </label>
        <label className="flex items-start gap-2 text-xs sm:col-span-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={etudiantNonBoursier}
            onChange={(e) => setEtudiantNonBoursier(e.target.checked)}
          />
          <span>{DECLARATION_ETUDIANT_NON_BOURSIER} À laisser décochée dans les autres cas.</span>
        </label>
        <div className="pb-0.5">
          <BoutonGenererDocument
            orgId={orgId}
            code="cautionnement"
            cibleId={bailId}
            cheminRetour={`${base}/baux/${bailId}`}
            libelle="Générer l'acte"
            options={{
              garant: garant.id,
              forme,
              ...(montantMax.trim() ? { montant_max: montantMax.trim() } : {}),
              ...(sansGarantie ? { sans_garantie_cumulee: "oui" } : {}),
              ...(etudiantNonBoursier ? { etudiant_non_boursier: "oui" } : {}),
            }}
          />
        </div>
      </div>
    </div>
  );
}
