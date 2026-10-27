"use client";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { expirationDiagnostic } from "@/lib/documents-bail";

import { useEffect, useId, useRef, useState } from "react";
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
  initialiserDate = false,
  actionDepot,
  onDepotConfirmeAction,
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
  onDepotConfirmeAction?: (message: string) => void;
}) {
  const identifiant = useId();
  const types = Object.entries(TYPES_DIAGNOSTIC).filter(
    ([, t]) => tousNiveaux || t.niveau === niveau
  );
  const actionLiee = actionDepot ?? deposerDiagnostic.bind(null, orgId, bienId, lotId);
  const {etat, soumettre: action, enCours, version} = useActionFormulaire<EtatParc>(actionLiee, true);
  const formulaire = useRef<HTMLFormElement>(null);
  const versionAnnoncee = useRef(0);
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

  // La date du rapport n'est pas connue au dépôt. L'initialisation explicite
  // reste disponible pour les appelants qui connaissent une réalisation du jour.
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

  useEffect(() => {
    // Seule une saisie confirmée et restée inchangée incrémente la version.
    // Ni une erreur ni le succès tardif d'un ancien brouillon ne ferment la fiche.
    if (version <= versionAnnoncee.current) return;
    versionAnnoncee.current = version;
    if (etat.succes && !etat.erreur) onDepotConfirmeAction?.(etat.succes);
  }, [version, etat.succes, etat.erreur, onDepotConfirmeAction]);

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
      aria-busy={enCours}
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
      <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
        <Label htmlFor={`diag-fichier-${niveau}-${identifiant}`}>Rapport du diagnostiqueur</Label>
        <ChampFichier depotDirect id={`diag-fichier-${niveau}-${identifiant}`} name="fichier" accept=".pdf,.jpg,.jpeg,.png" required />
        <p className="text-xs text-muted-foreground">PDF, JPEG ou PNG · 10 Mo maximum</p>
      </div>
      <div className={`grid gap-3 sm:grid-cols-2${type === "dpe" ? " lg:grid-cols-3" : ""}`}>
        {typeInitial ? (
          // Ouvert depuis la ligne d'un diagnostic précis : le type est acquis,
          // un menu serait à la fois inutile et une source d'erreur (un reset
          // le ramenait sur la 1re option et le dépôt partait du mauvais type).
          <input type="hidden" name="type" value={typeInitial} />
        ) : (
          <div className="space-y-1.5 sm:col-span-full">
            <Label htmlFor={`diag-type-${niveau}-${identifiant}`}>Type de diagnostic</Label>
            <select
              id={`diag-type-${niveau}-${identifiant}`}
              name="type"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                majExpiration(e.target.value, realisation);
              }}
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm"
            >
              {types.map(([valeur, t]) => (
                <option key={valeur} value={valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
            {TYPES_DIAGNOSTIC[type] && (
              <p className="text-xs text-muted-foreground">{TYPES_DIAGNOSTIC[type].aide}{tousNiveaux && ` · ${TYPES_DIAGNOSTIC[type].niveau === "lot" ? "Logement" : "Bâtiment"}`}</p>
            )}
          </div>
        )}
        {type === "dpe" && (
          <div className="space-y-1.5">
            <Label htmlFor={`diag-classe-${niveau}-${identifiant}`}>Classe énergétique (DPE)</Label>
            <select
              id={`diag-classe-${niveau}-${identifiant}`}
              name="classe_dpe"
              required={Boolean(actionDepot)}
              defaultValue={etat.valeurs?.classe_dpe ?? ""}
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm"
            >
              <option value="">Classe indiquée sur le rapport</option>
              {["A", "B", "C", "D", "E", "F", "G"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`diag-realisation-${niveau}-${identifiant}`}>Réalisé le</Label>
          <Input
            id={`diag-realisation-${niveau}-${identifiant}`}
            name="date_realisation"
            type="date"
            className="min-h-11 text-base sm:text-sm"
            max={aujourdhuiParis()}
            required
            value={realisation}
            onChange={(e) => {
              setRealisation(e.target.value);
              majExpiration(type, e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">Date indiquée sur le rapport.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`diag-expiration-${niveau}-${identifiant}`}>Expire le</Label>
          <Input
            id={`diag-expiration-${niveau}-${identifiant}`}
            required={TYPES_DIAGNOSTIC[type]?.validite_mois != null}
            name="date_expiration"
            type="date"
            className="min-h-11 text-base sm:text-sm"
            min={realisation || undefined}
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {TYPES_DIAGNOSTIC[type]?.validite_mois != null
              ? "Calculée à partir de la réalisation. Ajustez-la si le rapport indique une autre échéance."
              : "À renseigner seulement si le rapport indique une échéance."}
          </p>
        </div>
      </div>
      <details className="rounded-lg border border-border px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Informations facultatives</summary>
        <div className="space-y-1.5 pb-3">
          <Label htmlFor={`diag-diagnostiqueur-${niveau}-${identifiant}`}>Diagnostiqueur</Label>
          <Input
            id={`diag-diagnostiqueur-${niveau}-${identifiant}`}
            name="diagnostiqueur"
            maxLength={120}
            className="min-h-11 text-base sm:text-sm"
            placeholder="Nom du cabinet"
            defaultValue={etat.valeurs?.diagnostiqueur}
          />
        </div>
      </details>
      <BoutonEnvoi enCours={enCours} variant="outline" enCoursTexte="Dépôt…" className="order-last min-h-11 w-full sm:w-auto sm:self-start">
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
