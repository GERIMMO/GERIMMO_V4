"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deposerDiagnostic, type EtatParc } from "@/app/actions/parc";
import { TYPES_DIAGNOSTIC, type NiveauDiagnostic } from "@/lib/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Dépôt d'un diagnostic : le remplacement archive l'ancien du même type et
// lève seul le blocage (RM-0.8.5). L'expiration se pré-remplit d'après la
// validité réglementaire, ajustable (plomb positif, amiante avec trace…).
export function FormulaireDiagnostic({
  orgId,
  bienId,
  lotId,
  niveau,
  typeInitial,
}: {
  orgId: string;
  bienId: string;
  lotId: string | null;
  niveau: NiveauDiagnostic;
  // Dépôt depuis la ligne d'un diagnostic précis : le type est déjà choisi
  typeInitial?: string;
}) {
  const types = Object.entries(TYPES_DIAGNOSTIC).filter(
    ([, t]) => t.niveau === niveau
  );
  const actionLiee = deposerDiagnostic.bind(null, orgId, bienId, lotId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  const formulaire = useRef<HTMLFormElement>(null);
  const [type, setType] = useState(typeInitial ?? types[0]?.[0] ?? "");
  const [realisation, setRealisation] = useState("");
  const [expiration, setExpiration] = useState("");

  // Pré-remplissage de l'expiration : date de réalisation + validité du type
  const majExpiration = (leType: string, laRealisation: string) => {
    const validite = TYPES_DIAGNOSTIC[leType]?.validite_mois;
    if (!laRealisation || validite === null || validite === undefined) return;
    const d = new Date(laRealisation);
    d.setMonth(d.getMonth() + validite);
    setExpiration(d.toISOString().slice(0, 10));
  };

  // Date de réalisation pré-remplie à aujourd'hui (retour recette S2) —
  // posée après l'hydratation pour rester cohérente avec le rendu serveur
  useEffect(() => {
    const minuterie = setTimeout(() => {
      const aujourdhui = new Date().toLocaleDateString("en-CA", {
        timeZone: "Europe/Paris",
      });
      setRealisation((r) => r || aujourdhui);
      majExpiration(type, aujourdhui);
    }, 0);
    return () => clearTimeout(minuterie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!etat.succes) return;
    formulaire.current?.reset();
    const minuterie = setTimeout(() => {
      setRealisation("");
      setExpiration("");
      // form.reset() vient de remettre le <select> sur sa 1re option : sans ça,
      // l'état React garde l'ancien type et le prochain dépôt part avec le
      // mauvais — un « Termites » enregistré en « Amiante ».
      setType(typeInitial ?? types[0]?.[0] ?? "");
    }, 0);
    return () => clearTimeout(minuterie);
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium">
        {typeInitial
          ? `Déposer : ${TYPES_DIAGNOSTIC[typeInitial]?.libelle ?? typeInitial}`
          : "Déposer un diagnostic"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {typeInitial ? (
          // Ouvert depuis la ligne d'un diagnostic précis : le type est acquis,
          // un menu serait à la fois inutile et une source d'erreur (un reset
          // le ramenait sur la 1re option et le dépôt partait du mauvais type).
          <div className="space-y-1.5">
            <input type="hidden" name="type" value={typeInitial} />
            <p className="pt-1 text-xs text-muted-foreground">
              {TYPES_DIAGNOSTIC[typeInitial]?.aide}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`diag-type-${niveau}`}>Type</Label>
            <select
              id={`diag-type-${niveau}`}
              name="type"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                majExpiration(e.target.value, realisation);
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {types.map(([valeur, t]) => (
                <option key={valeur} value={valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
            {TYPES_DIAGNOSTIC[type] && (
              <p className="text-xs text-muted-foreground">{TYPES_DIAGNOSTIC[type].aide}</p>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`diag-diagnostiqueur-${niveau}`}>Diagnostiqueur</Label>
          <Input
            id={`diag-diagnostiqueur-${niveau}`}
            name="diagnostiqueur"
            maxLength={120}
            placeholder="Cabinet (facultatif)"
          />
        </div>
        {type === "dpe" && (
          <div className="space-y-1.5">
            <Label htmlFor={`diag-classe-${niveau}`}>Classe énergétique (DPE)</Label>
            <select
              id={`diag-classe-${niveau}`}
              name="classe_dpe"
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">—</option>
              {["A", "B", "C", "D", "E", "F", "G"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Classe G : logement interdit à la location (loi Climat).
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`diag-realisation-${niveau}`}>Réalisé le</Label>
          <Input
            id={`diag-realisation-${niveau}`}
            name="date_realisation"
            type="date"
            required
            value={realisation}
            onChange={(e) => {
              setRealisation(e.target.value);
              majExpiration(type, e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`diag-expiration-${niveau}`}>Expire le</Label>
          <Input
            id={`diag-expiration-${niveau}`}
            name="date_expiration"
            type="date"
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Laisser vide pour une validité illimitée (RM-0.6.4).
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`diag-fichier-${niveau}`}>
            Rapport du diagnostiqueur
          </Label>
          <Input
            id={`diag-fichier-${niveau}`}
            name="fichier"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            required
          />
          <p className="text-xs text-muted-foreground">
            Obligatoire — le diagnostic est annexé au bail. PDF, JPEG ou PNG
            (10 Mo max), déposé dans la GED et lié au diagnostic, chaque
            consultation tracée.
          </p>
        </div>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Dépôt…" : "Déposer"}
      </Button>
    </form>
  );
}
