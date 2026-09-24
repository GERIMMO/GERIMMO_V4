"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modale } from "@/components/ui/modale";
import { nomComplet } from "@/lib/roles-personnes";

type Personne = { id: string; nom: string; prenom: string | null };

// Valeurs d'un brouillon existant — le formulaire de création passe un objet
// vide, celui d'édition les champs du bail (recette 21/08 : le brouillon
// revenait vierge, la saisie était perdue).
export type BailDefauts = {
  type?: string;
  chambre_id?: string | null;
  locataire_principal?: string | null;
  date_debut?: string | null;
  loyer_hc?: number | string | null;
  charges?: number | string | null;
  charges_mode?: string;
  depot_garantie?: number | string | null;
  jour_echeance?: number;
  irl_trimestre?: string | null;
  revision_irl?: boolean;
};

const classeSelect =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// Les champs communs création / édition d'un bail. `prefixe` distingue les ids
// quand deux formulaires cohabitent sur une même page. `valeurs` : la saisie
// renvoyée par l'action en erreur — reposée en priorité pour que le reset
// React ne vide pas le formulaire (recette 22/08, voir lib/formulaires.ts).
export function ChampsBail({
  personnes,
  chambres = [],
  defauts = {},
  prefixe = "bail",
  valeurs,
}: {
  personnes: Personne[];
  chambres?: { id: string; nom: string }[];
  defauts?: BailDefauts;
  prefixe?: string;
  valeurs?: Record<string, string>;
}) {
  // Création rapide d'un locataire (recette Tahir 09/09) : même patron que le
  // « + Nouvelle personne… » de la détention — saisie en pop-up, valeurs
  // reportées en champs cachés, la fiche est créée avec le bail.
  const [type, setType] = useState(valeurs?.type ?? (defauts.chambre_id ? "colocation_individuelle" : defauts.type ?? "nu"));
  const [locataire, setLocataire] = useState(
    valeurs?.locataire_principal ?? defauts.locataire_principal ?? ""
  );
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [nouveau, setNouveau] = useState({
    nom: valeurs?.nouveau_locataire_nom ?? "",
    prenom: valeurs?.nouveau_locataire_prenom ?? "",
    email: valeurs?.nouveau_locataire_email ?? "",
    dateNaissance: valeurs?.nouveau_locataire_date_naissance ?? "",
    communeNaissance: valeurs?.nouveau_locataire_commune_naissance ?? "",
    adresse: valeurs?.nouveau_locataire_adresse ?? "",
    codePostal: valeurs?.nouveau_locataire_code_postal ?? "",
    ville: valeurs?.nouveau_locataire_ville ?? "",
  });
  const refNom = useRef<HTMLInputElement>(null);
  const refEmail = useRef<HTMLInputElement>(null);

  const annulerNouveau = () => {
    setModaleOuverte(false);
    setNouveau({ nom: "", prenom: "", email: "", dateNaissance: "", communeNaissance: "", adresse: "", codePostal: "", ville: "" });
    setLocataire("");
  };
  // Clic sur le fond : on referme sans perdre une saisie déjà commencée —
  // seule une pop-up vide vaut annulation (même règle que la détention).
  const fermerModale = () => {
    if (!nouveau.nom && !nouveau.email) {
      annulerNouveau();
      return;
    }
    setModaleOuverte(false);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-type`}>Type de bail</Label>
        <select
          id={`${prefixe}-type`}
          name="type"
          value={type}
          onChange={e => setType(e.target.value)}
          className={classeSelect}
        >
          <option value="nu">Nu</option>
          <option value="meuble">Meublé</option>
          <option value="colocation">Colocation · contrat commun</option>
          <option value="colocation_individuelle">Colocation · contrat individuel</option>
        </select>
      </div>
      {type === "colocation_individuelle" && <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${prefixe}-chambre`}>Chambre privative</Label>
        <select id={`${prefixe}-chambre`} name="chambre_id" required className={classeSelect}
          defaultValue={valeurs?.chambre_id ?? defauts.chambre_id ?? ""}>
          <option value="" disabled>Choisir une chambre</option>
          {chambres.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Un seul locataire, son propre loyer et son dépôt. Sans solidarité avec les autres chambres.
          {chambres.length === 0 && " Ajoutez d’abord les chambres dans la fiche du logement."}</p>
      </div>}
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-locataire`}>{type === "colocation_individuelle" ? "Locataire du contrat" : "Locataire principal"}</Label>
        <select
          id={`${prefixe}-locataire`}
          name="locataire_principal"
          required
          value={locataire}
          onChange={(e) => {
            setLocataire(e.target.value);
            // « Nouveau locataire » : la saisie se fait dans une pop-up
            if (e.target.value === "nouvelle") setModaleOuverte(true);
          }}
          className={classeSelect}
        >
          <option value="" disabled>
            — Choisir —
          </option>
          {personnes.map((p) => (
            <option key={p.id} value={p.id}>
              {nomComplet(p)}
            </option>
          ))}
          <option value="nouvelle">+ Nouveau locataire…</option>
        </select>
        {locataire === "nouvelle" && (
          <>
            {/* Valeurs saisies dans la pop-up, reportées ici pour l'envoi */}
            <input type="hidden" name="nouveau_locataire_nom" value={nouveau.nom} />
            <input type="hidden" name="nouveau_locataire_prenom" value={nouveau.prenom} />
            <input type="hidden" name="nouveau_locataire_email" value={nouveau.email} />
            <input type="hidden" name="nouveau_locataire_date_naissance" value={nouveau.dateNaissance} />
            <input type="hidden" name="nouveau_locataire_commune_naissance" value={nouveau.communeNaissance} />
            <input type="hidden" name="nouveau_locataire_adresse" value={nouveau.adresse} />
            <input type="hidden" name="nouveau_locataire_code_postal" value={nouveau.codePostal} />
            <input type="hidden" name="nouveau_locataire_ville" value={nouveau.ville} />
            {!modaleOuverte && (
              <p className="text-xs text-muted-foreground">
                Nouveau <b>locataire</b> : {nomComplet(nouveau)} — {nouveau.email}{" "}
                <button
                  type="button"
                  onClick={() => setModaleOuverte(true)}
                  className="text-[var(--bleu)] underline-offset-2 hover:underline"
                >
                  modifier
                </button>
              </p>
            )}
          </>
        )}
      </div>
      {/* Pop-up « nouveau locataire » : fiche créée à la volée avec le bail —
          mêmes règles que la détention (email obligatoire et unique dans
          l'agence), fiche complétable ensuite dans Personnes. */}
      {modaleOuverte && (
        <Modale
          titre="Nouveau locataire"
          surtitre="La fiche complète se retrouve dans Personnes"
          fermer={fermerModale}
        >
          <div
            className="space-y-3"
            onKeyDown={(e) => {
              // Entrée dans un champ valide la pop-up (sans soumettre le
              // bail) — sur un bouton, elle garde son sens.
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                e.preventDefault();
                if (refNom.current?.reportValidity() && refEmail.current?.reportValidity()) {
                  setModaleOuverte(false);
                }
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${prefixe}-nouveau-nom`}>Nom *</Label>
              <Input
                id={`${prefixe}-nouveau-nom`}
                ref={refNom}
                required
                maxLength={120}
                value={nouveau.nom}
                onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefixe}-nouveau-prenom`}>Prénom *</Label>
              <Input
                id={`${prefixe}-nouveau-prenom`}
                maxLength={120}
                required
                value={nouveau.prenom}
                onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor={`${prefixe}-nouveau-naissance`}>Date de naissance *</Label><Input id={`${prefixe}-nouveau-naissance`} type="date" required value={nouveau.dateNaissance} onChange={(e) => setNouveau({ ...nouveau, dateNaissance: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor={`${prefixe}-nouveau-commune`}>Commune de naissance *</Label><Input id={`${prefixe}-nouveau-commune`} required maxLength={120} value={nouveau.communeNaissance} onChange={(e) => setNouveau({ ...nouveau, communeNaissance: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor={`${prefixe}-nouveau-adresse`}>Adresse *</Label><Input id={`${prefixe}-nouveau-adresse`} required maxLength={200} value={nouveau.adresse} onChange={(e) => setNouveau({ ...nouveau, adresse: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor={`${prefixe}-nouveau-cp`}>Code postal *</Label><Input id={`${prefixe}-nouveau-cp`} required maxLength={12} value={nouveau.codePostal} onChange={(e) => setNouveau({ ...nouveau, codePostal: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor={`${prefixe}-nouveau-ville`}>Ville *</Label><Input id={`${prefixe}-nouveau-ville`} required maxLength={120} value={nouveau.ville} onChange={(e) => setNouveau({ ...nouveau, ville: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefixe}-nouveau-email`}>Adresse email *</Label>
              <Input
                id={`${prefixe}-nouveau-email`}
                ref={refEmail}
                type="email"
                required
                maxLength={200}
                value={nouveau.email}
                onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Une adresse ne peut appartenir qu&apos;à une seule fiche de
                l&apos;agence.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={annulerNouveau}>
                Annuler
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  // Validation native des deux champs obligatoires avant de
                  // refermer — la création réelle part avec le bail.
                  if (!refNom.current?.reportValidity()) return;
                  if (!refEmail.current?.reportValidity()) return;
                  setModaleOuverte(false);
                }}
              >
                Valider
              </Button>
            </div>
          </div>
        </Modale>
      )}
      {/* La date d'entrée est une mention obligatoire du contrat et pilote
          aussi l'échéancier : elle est exigée dès le brouillon. */}
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-debut`}>Date d&apos;entrée *</Label>
        <Input
          id={`${prefixe}-debut`}
          name="date_debut"
          type="date"
          required
          defaultValue={valeurs?.date_debut ?? defauts.date_debut ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-jour`}>Jour d&apos;échéance *</Label>
        <Input
          id={`${prefixe}-jour`}
          name="jour_echeance"
          type="number"
          min="1"
          max="28"
          required
          defaultValue={valeurs?.jour_echeance ?? defauts.jour_echeance ?? 1}
        />
      </div>
      {/* Sans loyer, charges et dépôt explicites, les appels et le contrat
          seraient ambigus : 0 doit être saisi lorsque le montant est nul. */}
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-loyer`}>Loyer HC (€) *</Label>
        <Input
          id={`${prefixe}-loyer`}
          name="loyer_hc"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={valeurs?.loyer_hc ?? defauts.loyer_hc ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-charges`}>Charges (€) *</Label>
        <Input
          id={`${prefixe}-charges`}
          name="charges"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={valeurs?.charges ?? defauts.charges ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-charges-mode`}>Mode de charges</Label>
        <select
          id={`${prefixe}-charges-mode`}
          name="charges_mode"
          defaultValue={valeurs?.charges_mode ?? defauts.charges_mode ?? "provision"}
          className={classeSelect}
        >
          <option value="provision">Provision (régularisée chaque année)</option>
          <option value="forfait">Forfait (définitif, jamais régularisé)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-depot`}>Dépôt de garantie (€) *</Label>
        <Input
          id={`${prefixe}-depot`}
          name="depot_garantie"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={valeurs?.depot_garantie ?? defauts.depot_garantie ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          Maximum : 1 mois de loyer hors charges en location nue, 2 en meublé.
          {type === "colocation_individuelle" ? " Le plafond s’applique au loyer de cette chambre." : " En contrat commun, le plafond s’applique au loyer du logement entier."}
          {/* L'espace se dit : JSX avale le saut de ligne après l'accolade
              (« entier.Le caractère », relevé du 24/09). */}
          {" "}Le caractère meublé est repris de la fiche du lot pour les colocations.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-irl`}>Trimestre IRL de référence</Label>
        <select
          id={`${prefixe}-irl`}
          name="irl_trimestre"
          defaultValue={valeurs?.irl_trimestre ?? defauts.irl_trimestre ?? ""}
          className={classeSelect}
        >
          <option value="">—</option>
          {["T1", "T2", "T3", "T4"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {/* `pt-6` aligne la case sur les champs voisins en deux colonnes ; en
          une seule (téléphone) ce vide la décrochait du champ précédent (24/09). */}
      <div className="flex items-center gap-2 sm:pt-6">
        <input
          id={`${prefixe}-revision`}
          name="revision_irl"
          type="checkbox"
          value="on"
          defaultChecked={valeurs ? valeurs.revision_irl === "on" : defauts.revision_irl ?? true}
          className="size-4"
        />
        <Label htmlFor={`${prefixe}-revision`}>Clause de révision annuelle (IRL)</Label>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        * Mentions indispensables au contrat et à ses calculs. Saisissez 0
        lorsqu&apos;un montant est volontairement nul.
      </p>
    </div>
  );
}
