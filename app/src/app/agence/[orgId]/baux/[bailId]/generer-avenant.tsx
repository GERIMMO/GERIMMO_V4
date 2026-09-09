"use client";

import { useState } from "react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const classeTextarea =
  "w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm";

// Avenant au bail : l'objet et les modifications sont saisis au moment du
// geste et partent en options du modèle « avenant » — rien n'est stocké en
// base, le PDF généré est l'acte à faire signer par les parties.
export function GenererAvenant({
  orgId,
  bailId,
  cheminRetour,
}: {
  orgId: string;
  bailId: string;
  cheminRetour: string;
}) {
  const [objet, setObjet] = useState("");
  const [modifications, setModifications] = useState("");
  const pret = objet.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="avenant-objet">Objet de l&apos;avenant</Label>
        <Input
          id="avenant-objet"
          value={objet}
          onChange={(e) => setObjet(e.target.value)}
          maxLength={200}
          placeholder="Ex. révision de la provision sur charges au 1er janvier"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="avenant-modifications">Modifications convenues</Label>
        <textarea
          id="avenant-modifications"
          value={modifications}
          onChange={(e) => setModifications(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder={
            "Une modification par ligne.\nEx. La provision mensuelle sur charges est portée de 60 € à 80 €."
          }
          className={classeTextarea}
        />
        <p className="text-xs text-muted-foreground">
          Chaque ligne devient un paragraphe de l&apos;avenant ; toutes les autres
          clauses du bail demeurent inchangées.
        </p>
      </div>
      {pret ? (
        <BoutonGenererDocument
          orgId={orgId}
          code="avenant"
          cibleId={bailId}
          cheminRetour={cheminRetour}
          libelle="Générer l'avenant (PDF)"
          options={{ objet: objet.trim(), modifications }}
        />
      ) : (
        <Button type="button" size="sm" variant="outline" disabled>
          Générer l&apos;avenant (PDF)
        </Button>
      )}
    </div>
  );
}
