"use client";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { expirationDiagnostic } from "@/lib/documents-bail";

import { useEffect, useRef, useState } from "react";
import { deposerDiagnostic, type EtatParc } from "@/app/actions/parc";
import { TYPES_DIAGNOSTIC, type NiveauDiagnostic } from "@/lib/parc";
import { aujourdhuiParis } from "@/lib/ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChampFichier } from "@/components/champ-fichier";

// Dépôt d'un diagnostic : le remplacement archive l'ancien du même type et
// lève seul le blocage (RM-0.8.5). L'expiration se pré-remplit d'après la
// validité réglementaire, ajustable (plomb positif, amiante avec trace…).
export function FormulaireDiagnostic({
  orgId,
  bienId,
  lotId,
  niveau,
  typeInitial,
  tousNiveaux = false,
  initialiserDate = true,
  actionDepot,
}: {
  orgId: string;
  bienId: string;
  lotId: string | null;
  niveau: NiveauDiagnostic;
  // Dépôt depuis la ligne d'un diagnostic précis : le type est déjà choisi
  typeInitial?: string;
  tousNiveaux?: boolean;
  initialiserDate?: boolean;
  actionDepot?: (etat:EtatParc,form:FormData)=>Promise<EtatParc>;
}) {
  const types = Object.entries(TYPES_DIAGNOSTIC).filter(
    ([, t]) => tousNiveaux || t.niveau === niveau
  );
  const actionLiee = actionDepot ?? deposerDiagnostic.bind(null, orgId, bienId, lotId);
  const {etat, soumettre: action, enCours, version} = useActionFormulaire<EtatParc>(actionLiee, true);
  const formulaire = useRef<HTMLFormElement>(null);
  const [etatModifie, setEtatModifie] = useState<typeof etat | null>(null);
  // Réponse (état) pour laquelle la proposition « Utiliser cette pièce » a cessé de valoir : l'utilisateur a choisi un autre
  // fichier ou un autre type depuis. Une nouvelle réponse du serveur est un autre objet : elle rouvre la proposition.
  const [propositionRetiree, setPropositionRetiree] = useState<typeof etat | null>(null);
  const [type, setType] = useState(typeInitial ?? types[0]?.[0] ?? "");
  const [realisation, setRealisation] = useState("");
  const [expiration, setExpiration] = useState("");

  // Pré-remplissage de l'expiration : date de réalisation + validité du type
  const majExpiration = (leType: string, laRealisation: string) => {
    setExpiration(expirationDiagnostic(leType, laRealisation));
  };

  // Date de réalisation pré-remplie à aujourd'hui (retour recette S2) —
  // posée après l'hydratation pour rester cohérente avec le rendu serveur
  useEffect(() => {
    if (!initialiserDate) return;
    const minuterie = setTimeout(() => {
      const aujourdhui = aujourdhuiParis();
      setRealisation((r) => r || aujourdhui);
      majExpiration(type, aujourdhui);
    }, 0);
    return () => clearTimeout(minuterie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Une nouvelle version n'arrive qu'après confirmation de la saisie exacte.
    // Le nouveau formulaire n'hérite pas de l'empreinte du dépôt précédent.
    // Une réponse tardive ne vide donc pas le diagnostic suivant.
    if (!version) return;
    const minuterie = setTimeout(() => {
      setRealisation("");
      setExpiration("");
      // Le nouveau formulaire repart du type initial, y compris dans l’état React.
      setType(typeInitial ?? types[0]?.[0] ?? "");
    }, 0);
    return () => clearTimeout(minuterie);
    // `typeInitial` et `types` sont volontairement hors des dépendances. Ils
    // viennent du parent et ne changent pas de valeur pendant la vie du
    // formulaire ; mais `types` est un TABLEAU RECONSTRUIT à chaque rendu du
    // parent. Le déclarer ici ferait rejouer l'effet à chaque rendu tant que
    // `etat.succes` reste vrai — c'est-à-dire vider le formulaire sous les
    // doigts de celui qui vient de commencer le dépôt suivant. Le seul
    // déclencheur légitime est la confirmation d’une saisie restée inchangée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const propositionAffichee = Boolean(etat.pieceExistante) && propositionRetiree !== etat;

  return (
    // Colonne flex : « Déposer » est écrit AVANT la proposition dans le DOM mais s'affiche après (`order-last`). La touche
    // Entrée dans un champ clique le premier bouton d'envoi du formulaire dans le DOM : « Utiliser cette pièce » ne doit
    // jamais être celui-là, sinon Entrée (dans « Diagnostiqueur », une date…) rattacherait la pièce proposée sans que
    // personne l'ait demandé (constat de relecture du 15/10/2026).
    <form
      key={version}
      data-saisie-confirmee
      onChange={(e) => {
        setEtatModifie(etat);
        // La proposition vaut pour le fichier qui vient d'être refusé : un autre fichier ou un autre type ne la concerne plus.
        const nom = (e.target as { name?: string }).name;
        if (nom === "fichier" || nom === "type") setPropositionRetiree(etat);
      }}
      ref={formulaire}
      onSubmit={action}
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
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
            <Label htmlFor={`diag-type-${niveau}`}>Type de diagnostic</Label>
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
              <p className="text-sm text-muted-foreground">{TYPES_DIAGNOSTIC[type].aide}{tousNiveaux && ` · ${TYPES_DIAGNOSTIC[type].niveau === "lot" ? "Logement" : "Bâtiment"}`}</p>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`diag-diagnostiqueur-${niveau}`}>Diagnostiqueur</Label>
          {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
          <Input
            id={`diag-diagnostiqueur-${niveau}`}
            name="diagnostiqueur"
            maxLength={120}
            placeholder="Cabinet (facultatif)"
            defaultValue={etat.valeurs?.diagnostiqueur}
          />
        </div>
        {type === "dpe" && (
          <div className="space-y-1.5">
            <Label htmlFor={`diag-classe-${niveau}`}>Classe énergétique (DPE)</Label>
            <select
              id={`diag-classe-${niveau}`}
              name="classe_dpe"
              required={Boolean(actionDepot)}
              defaultValue={etat.valeurs?.classe_dpe ?? ""}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">—</option>
              {["A", "B", "C", "D", "E", "F", "G"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
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
            max={aujourdhuiParis()}
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
            required={TYPES_DIAGNOSTIC[type]?.validite_mois != null}
            name="date_expiration"
            type="date"
            min={realisation || undefined}
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {TYPES_DIAGNOSTIC[type]?.validite_mois != null ? "Date d’expiration obligatoire : vérifiez la date indiquée sur le rapport." : "Laisser vide uniquement si le rapport ne prévoit pas de date d’expiration."}
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`diag-fichier-${niveau}`}>
            Rapport du diagnostiqueur
          </Label>
          <ChampFichier id={`diag-fichier-${niveau}`} name="fichier" accept=".pdf,.jpg,.jpeg,.png" required />
          <p className="text-sm text-muted-foreground">
            Rapport requis. PDF, JPEG ou PNG
            (4 Mo maximum), à déposer avec les dates et la classe figurant sur le rapport.
          </p>
        </div>
      </div>
      <BoutonEnvoi enCours={enCours} size="sm" variant="outline" enCoursTexte="Dépôt…" className="order-last self-start">
        Déposer
      </BoutonEnvoi>
      {etat.pieceExistante ? (
        // X07 (PROP-11) : le même rapport est déjà rangé (diagnostic collectif d'un immeuble). Plutôt qu'un refus
        // sans issue, on propose de l'utiliser aussi ici : le bouton envoie le MÊME formulaire (dates et classe
        // déjà saisies comprises) avec l'identifiant de la pièce, et rien n'est déposé une seconde fois. Retirée dès qu'un
        // autre fichier ou un autre type est choisi ; le refus brut qui allait avec ne s'affiche pas non plus.
        propositionAffichee && (
          <div role="status" className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p>
              <strong>Ce rapport est déjà dans votre dossier</strong>, sous le nom « {etat.pieceExistante.titre ?? "sans titre"} ».
            </p>
            <p className="text-muted-foreground">
              S’il vaut aussi pour {niveau === "lot" ? "ce lot" : "ce bien"} (par exemple le diagnostic collectif d’un immeuble),
              utilisez cette même pièce : elle ne sera pas déposée une seconde fois.
            </p>
            <BoutonEnvoi
              type="submit"
              name="piece_existante"
              value={etat.pieceExistante.id}
              enCours={enCours}
              size="sm"
              enCoursTexte="Enregistrement…"
            >
              {niveau === "lot" ? "Utiliser cette pièce pour ce lot" : "Utiliser cette pièce pour ce bien"}
            </BoutonEnvoi>
          </div>
        )
      ) : (
        etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>
      )}
      {etat.succes && etatModifie !== etat && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
    </form>
  );
}
