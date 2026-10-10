"use client";
import { useActionStateSuivi } from "@/lib/suivi-enregistrement";

import styles from "@/components/presentation-parcours.module.css";
import { ArrowLeft, ArrowRight, Info, UserRoundCheck } from "lucide-react";
import { CadreParcours } from "@/components/parcours-location";
import { ETAPES_LOT } from "@/lib/parcours-lot";
import { useEffect, useId, useRef, useState } from "react";
import { creerBien, modifierBien, type EtatParc } from "@/app/actions/parc";
import { TYPES_BIEN, TYPES_NON_DECOUPABLES } from "@/lib/parc";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelBail as Label } from "@/components/pastille-bail";
import { createClient } from "@/lib/supabase/client";
import { communeEvidente, type CommuneReseau } from "@/lib/reseau";

type SuggestionAdresse = {
  label: string;
  name: string;
  postcode: string;
  city: string;
};

export type BienFormulaire = {
  id: string;
  nom: string;
  type: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  city: string;
  annee_construction: number | null;
  copropriete: boolean;
  /** NULL = zone non vérifiée (audit 29/09) : jamais « non » par défaut. */
  zone_tendue: boolean | null;
  /** Commune INSEE confirmée (réseau d'artisans). */
  commune_insee?: string | null;
  parties_communes: string | null;
  acces_tic: string | null;
};

// Création (avec surface/pièces du lot unique) ou édition d'un bien existant.
export function FormulaireBien({
  orgId,
  bien,
  guide = false,
  libelleEnregistrer = "Enregistrer",
  champsVisibles,
  proprietaireAutomatique = false,
}: {
  orgId: string;
  bien?: BienFormulaire;
  guide?: boolean;
  libelleEnregistrer?: string;
  /** Réservé à la complétion du bail ; les valeurs masquées restent soumises. */
  champsVisibles?: string[];
  proprietaireAutomatique?: boolean;
}) {
  const masquer = (champ: string) => Boolean(bien) && champsVisibles !== undefined && !champsVisibles.includes(champ);
  const [etapeCreation, setEtapeCreation] = useState(0);
  const formulaire = useRef<HTMLFormElement>(null);
  const [restants, setRestants] = useState([7, 3]);
  function actualiserReperes() {
    requestAnimationFrame(() => {
      if (!formulaire.current) return;
      setRestants([0,1].map(i => Array.from(formulaire.current!.querySelectorAll<HTMLInputElement>(`[data-etape-creation="${i}"] input[required]`)).filter(c => !c.validity.valid).length));
    });
  }
  const groupeBien = useRef<HTMLDivElement>(null);
  const guideActif = guide && !bien;
  function changerEtape(i: number) {
    if (i === 1) {
      const champs = groupeBien.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
      for (const champ of champs ?? []) if (!champ.reportValidity()) return;
      const nomBien = String(new FormData(formulaire.current ?? undefined).get("nom") ?? "").trim();
      setLotUnique(lot => lot.nom === undefined ? {...lot, nom: nomBien} : lot);
    }
    setEtapeCreation(i);
    if (guideActif) actualiserReperes();
    requestAnimationFrame(() => {
      document.getElementById("assistant-titre")?.focus({preventScroll:true});
      document.getElementById("assistant-lot-navigation")?.scrollIntoView({block:"start"});
    });
  }
  const actionLiee = bien
    ? modifierBien.bind(null, orgId, bien.id)
    : creerBien.bind(null, orgId);
  const [etat, action] = useActionStateSuivi<EtatParc, FormData>(actionLiee, {});
  const erreurRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!etat.erreur) return;
    erreurRef.current?.focus({ preventScroll: true });
    erreurRef.current?.scrollIntoView({ block: "center" });
  }, [etat]);

  // Identifiants tirés de useId() — jamais une chaîne en dur : la page peut
  // rendre deux fois le même formulaire, et des id identiques décrocheraient
  // les libellés de leurs champs.
  const idType = useId();
  const idComplement = useId();
  const idLot = useId();

  // Autocomplétion d'adresse via la Base Adresse Nationale (retour recette S2) :
  // la sélection remplit la voie, le code postal et la ville
  const [adresse, setAdresse] = useState(bien?.address_line1 ?? "");
  const [codePostal, setCodePostal] = useState(bien?.postal_code ?? "");
  const [ville, setVille] = useState(bien?.city ?? "");
  const [suggestions, setSuggestions] = useState<SuggestionAdresse[]>([]);
  const adresseFocalisee = useRef(false);
  const minuterieRecherche = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audit gestion du 29/09 : la commune du bien (réseau d'artisans) se choisit
  // dès la saisie, parmi les communes desservies par le code postal. Une seule
  // commune possible, ou une seule qui porte le nom saisi : elle est proposée
  // d'office. La base vérifie la cohérence (reseau_controler_commune_bien).
  const [communes, setCommunes] = useState<CommuneReseau[]>([]);
  const [commune, setCommune] = useState<string>(bien?.commune_insee ?? "");
  useEffect(() => {
    const cp = codePostal.trim();
    if (!/^\d{5}$/.test(cp)) return;
    let abandon = false;
    createClient()
      .from("reseau_communes")
      .select("code,nom,codes_postaux,departement")
      .contains("codes_postaux", [cp])
      .order("nom")
      .then(({ data }) => {
        if (abandon) return;
        setCommunes((data ?? []) as CommuneReseau[]);
      });
    return () => {
      abandon = true;
    };
  }, [codePostal]);
  const communesDuCodePostal = /^\d{5}$/.test(codePostal.trim()) ? communes : [];
  const communeProposee = communeEvidente(communesDuCodePostal, ville);
  const communeRetenue = communesDuCodePostal.some((c) => c.code === commune)
    ? commune
    : communeProposee?.code ?? "";

  useEffect(() => () => {
    if (minuterieRecherche.current) clearTimeout(minuterieRecherche.current);
  }, []);

  const rechercherAdresse = (saisie: string) => {
    setAdresse(saisie);
    if (minuterieRecherche.current) clearTimeout(minuterieRecherche.current);
    if (saisie.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    minuterieRecherche.current = setTimeout(async () => {
      try {
        const reponse = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(saisie)}&limit=5&autocomplete=1`
        );
        if (!reponse.ok) return;
        const donnees = (await reponse.json()) as {
          features?: { properties: SuggestionAdresse }[];
        };
        if (adresseFocalisee.current) setSuggestions((donnees.features ?? []).map((f) => f.properties));
      } catch {
        // Hors ligne ou API indisponible : la saisie manuelle reste possible
      }
    }, 300);
  };

  const choisirAdresse = (s: SuggestionAdresse) => {
    setAdresse(s.name);
    setCodePostal(s.postcode);
    setVille(s.city);
    setSuggestions([]);
    if (guideActif) actualiserReperes();
  };

  // Questionnaire progressif : le type choisi commande la suite. Un appartement
  // ou un parking EST l'unité locative (un seul lot, pas de question) ; un
  // immeuble est multi-lots par nature ; les autres types peuvent l'être.
  const [type, setType] = useState(bien?.type ?? "appartement");
  const nonDecoupable = (TYPES_NON_DECOUPABLES as readonly string[]).includes(type);
  const [divise, setDivise] = useState(false);
  const multiLots = !nonDecoupable && (type === "immeuble" || divise);

  const [lots, setLots] = useState<{ nom: string; surface: string; pieces: string }[]>([
    { nom: "", surface: "", pieces: "" },
  ]);
  const majLot = (i: number, champ: "nom" | "surface" | "pieces", valeur: string) =>
    setLots((l) => l.map((x, j) => (j === i ? { ...x, [champ]: valeur } : x)));
  const [lotUnique, setLotUnique] = useState<{nom?: string; surface: string; pieces: string}>({surface: "", pieces: ""});
  const ajouterLot = () => { setLots((l) => [...l, { nom: "", surface: "", pieces: "" }]); if (guideActif) actualiserReperes(); };
  const retirerLot = (i: number) => { setLots((l) => l.filter((_, j) => j !== i)); if (guideActif) actualiserReperes(); };

  // Les deux saisies restent en mémoire si l’utilisateur change de type ou de découpage.
  const changerType = (nouveau: string) => {
    setType(nouveau);
    setDivise(false);
    if (guideActif) actualiserReperes();
  };

  const contenu = (
    <form ref={formulaire} data-champs-cibles={bien && champsVisibles !== undefined || undefined}
      onReset={event => { if (bien || guideActif) event.preventDefault(); }}
      onChangeCapture={guideActif ? actualiserReperes : undefined}
      action={action} className={`saisie-bien space-y-6 ${guideActif ? styles.creation : ""}`} noValidate={guideActif}
      onSubmit={(e) => {
        if (!guideActif) return;
        // Entrée depuis la première étape fait avancer, sans créer prématurément.
        if (etapeCreation === 0) { e.preventDefault(); changerEtape(1); return; }
        const champs = e.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
        for (const champ of champs) if (!champ.validity.valid) {
          e.preventDefault(); setEtapeCreation(groupeBien.current?.contains(champ) ? 0 : 1);
          requestAnimationFrame(() => champ.reportValidity()); break;
        }
      }}>
      {etat.erreur && <p ref={erreurRef} role="alert" tabIndex={-1} className="scroll-mt-24 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{etat.erreur}</p>}
      {guideActif && <><input type="hidden" name="parcours" value="1" /><p className={styles.aide}><span className={styles.legendePastille} aria-hidden="true" /> Pastille rouge : information obligatoire à compléter. Les champs indiqués « facultatif » peuvent rester vides.</p></>}
      <div data-bien-groupes data-etape-creation="0" ref={groupeBien} hidden={guideActif && etapeCreation !== 0} className="space-y-6">
      <div hidden={["nom", "type", "address_line1", "address_line2", "postal_code", "city", "commune_insee"].every(masquer)} data-bien-section="adresse" className="space-y-6">
      <div className="saisie-repere"><span>1</span><div><h2>Adresse et localisation</h2><p>Identifiez le bien et sa commune.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div hidden={masquer("nom")} className="space-y-2">
          <Label htmlFor="bien-nom">{guideActif ? "Nom du bien" : "Référence interne *"}</Label>
          {/* defaultValue={etat.valeurs?.…} : en erreur, le reset React retombe
              sur la saisie (recette 22/08 — mécanique commune, lib/formulaires.ts) */}
          <Input
            id="bien-nom"
            name="nom"
            required
            maxLength={120}
            defaultValue={etat.valeurs?.nom ?? bien?.nom}
            placeholder="ex. 12 rue des Lilas"
          />
        </div>
        <div hidden={masquer("type")} className="space-y-2">
          <Label htmlFor={idType}>Type</Label>
          {bien ? (
            // Le type conditionne les diagnostics attendus : figé après création
            <Input id={idType} disabled value={TYPES_BIEN[bien.type] ?? bien.type} />
          ) : (
            <select
              id={idType}
              name="type"
              value={type}
              onChange={(e) => changerType(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {Object.entries(TYPES_BIEN).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div hidden={masquer("address_line1")} className="relative space-y-2">
        <Label htmlFor="bien-adresse1" champ="bien.address_line1" renseigne={String(adresse).trim() !== ""}>Adresse</Label>
        <Input
          id="bien-adresse1"
          name="address_line1"
          required
          maxLength={200}
          value={adresse}
          onChange={(e) => rechercherAdresse(e.target.value)}
          onFocus={() => { adresseFocalisee.current = true; }}
          onBlur={() => { adresseFocalisee.current = false; setTimeout(() => setSuggestions([]), 150); }}
          placeholder="Adresse libre ou proposée — les suggestions sont facultatives"
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-10 w-full rounded-md border border-border bg-background shadow-md">
            {suggestions.map((s) => (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => choisirAdresse(s)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div hidden={masquer("address_line2")} className="space-y-2">
        <Label htmlFor={idComplement}>Complément d&apos;adresse{guideActif && <span className="text-xs font-normal text-muted-foreground"> — facultatif</span>}</Label>
        <Input
          id={idComplement}
          name="address_line2"
          maxLength={200}
          defaultValue={etat.valeurs?.address_line2 ?? bien?.address_line2 ?? ""}
          placeholder="Complément (facultatif)"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div hidden={masquer("postal_code")} className="space-y-2">
          <Label htmlFor="bien-cp" champ="bien.postal_code" renseigne={String(codePostal).trim() !== ""}>Code postal{!guideActif && " *"}</Label>
          {/* inputMode et non type=number : tolère les CP étrangers */}
          <Input
            id="bien-cp"
            name="postal_code"
            required
            maxLength={12}
            inputMode="numeric"
            autoComplete="postal-code"
            value={codePostal}
            onChange={(e) => setCodePostal(e.target.value)}
          />
        </div>
        <div hidden={masquer("city")} className="space-y-2">
          <Label htmlFor="bien-ville" champ="bien.city" renseigne={String(ville).trim() !== ""}>Ville{!guideActif && " *"}</Label>
          <Input
            id="bien-ville"
            name="city"
            required
            maxLength={120}
            value={ville}
            onChange={(e) => setVille(e.target.value)}
          />
        </div>
      </div>
      {communesDuCodePostal.length > 0 && (
        <div hidden={masquer("commune_insee")} className="space-y-2">
          <Label htmlFor="bien-commune">Commune (réseau d&apos;artisans){guideActif && <span className="text-xs font-normal text-muted-foreground"> — facultatif</span>}</Label>
          <select
            id="bien-commune"
            name="commune_insee"
            value={communeRetenue}
            onChange={(e) => setCommune(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">À confirmer plus tard</option>
            {communesDuCodePostal.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nom} ({c.departement})
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Un code postal peut desservir plusieurs communes : choisissez celle
            de l&apos;adresse. Elle permet de vérifier les métiers disponibles pour ce bien, selon les zones ouvertes par Gerimmo.
          </p>
        </div>
      )}

      </div>
      <div hidden={["annee_construction", "copropriete", "zone_tendue", "parties_communes", "acces_tic"].every(masquer)} data-bien-section="batiment" className="space-y-6">
      <div className="saisie-repere">{!guideActif && <span>2</span>}<div><h2>Caractéristiques du bâtiment</h2><p>Ces informations servent à préparer le dossier et ses documents.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div hidden={masquer("annee_construction")} className="space-y-2">
          <Label htmlFor="bien-annee" champ="bien.annee_construction" renseigne={String(etat.valeurs?.annee_construction ?? bien?.annee_construction ?? "").trim() !== ""}>Année de construction{!guideActif && " *"}</Label>
          <Input
            id="bien-annee"
            name="annee_construction"
            type="number"
            min={1000}
            max={2100}
            required
            defaultValue={etat.valeurs?.annee_construction ?? bien?.annee_construction ?? ""}
          />
          <p className="text-sm text-muted-foreground">
            Elle déduit les diagnostics attendus (plomb avant 1949, amiante
            avant 1997…).
          </p>
        </div>
        <div hidden={masquer("copropriete")} className="flex items-center gap-2 pt-6">
          <input
            id="bien-copro"
            name="copropriete"
            type="checkbox"
            defaultChecked={etat.valeurs ? etat.valeurs.copropriete === "on" : bien?.copropriete}
            className="size-4"
          />
          <Label htmlFor="bien-copro">En copropriété</Label>
        </div>
        {/* Audit gestion du 29/09 : trois réponses, dont « non vérifiée » —
            une case décochée valait « hors zone tendue » pour un bien que
            personne n'avait qualifié. */}
        <div hidden={masquer("zone_tendue")} className="space-y-1">
          <Label htmlFor="bien-zone-tendue">Zone tendue{guideActif && <span className="text-xs font-normal text-muted-foreground"> — facultatif à cette étape</span>}</Label>
          <select
            id="bien-zone-tendue"
            name="zone_tendue"
            defaultValue={
              etat.valeurs?.zone_tendue ??
              (bien?.zone_tendue === true ? "oui" : bien?.zone_tendue === false ? "non" : "")
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Non vérifiée</option>
            <option value="oui">Oui — commune en zone tendue</option>
            <option value="non">Non — hors zone tendue</option>
          </select>
          <p className="text-sm text-muted-foreground">
            Zone tendue : préavis du locataire d&apos;1 mois de plein droit. Tant
            qu&apos;elle n&apos;est pas vérifiée, un congé à 1 mois est accepté
            et signalé à vérifier.
          </p>
        </div>
      </div>

      {(
        // Repris tels quels dans la désignation du bail (parties communes et
        // accès aux technologies de l'information — art. 3 loi 89-462).
        // Le formulaire les demande dès la création pour éviter un bail incomplet.
        <div className="grid gap-4 sm:grid-cols-2">
          <div hidden={masquer("parties_communes")} className="space-y-2">
            <Label htmlFor="bien-parties-communes" champ="bien.parties_communes" renseigne={String(etat.valeurs?.parties_communes ?? bien?.parties_communes ?? "").trim() !== ""}>Parties communes{!guideActif && " *"}</Label>
            <Input
              id="bien-parties-communes"
              name="parties_communes"
              maxLength={300}
              required
              defaultValue={etat.valeurs?.parties_communes ?? bien?.parties_communes ?? ""}
              // Une maison ou un parking n'en a pas (audit du 27/09) : la
              // clause du bail accepte « Néant », on le dit.
              placeholder="Hall, ascenseur… ou « Néant » (maison)"
            />
          </div>
          <div hidden={masquer("acces_tic")} className="space-y-2">
            {/* « TIC » seul était du jargon (audit du 27/09). */}
            <Label htmlFor="bien-acces-tic" champ="bien.acces_tic" renseigne={String(etat.valeurs?.acces_tic ?? bien?.acces_tic ?? "").trim() !== ""}>Accès internet, téléphone, TV{!guideActif && " (TIC) *"}</Label>
            <Input
              id="bien-acces-tic"
              name="acces_tic"
              maxLength={200}
              required
              defaultValue={etat.valeurs?.acces_tic ?? bien?.acces_tic ?? ""}
              placeholder="Fibre optique, TNT… ou « Néant »"
            />
          </div>
        </div>
      )}

      </div>
      </div>
      <div data-etape-creation="1" hidden={guideActif && etapeCreation !== 1}>
      {!bien && (
        <div data-lots-section className="space-y-6 border-t border-border pt-6">
          <div className="saisie-repere"><span>{guideActif ? 2 : 3}</span><div><h2>{multiLots ? "Les lots à gérer" : "Le lot à louer"}</h2><p>Renseignez chaque unité que vous louez séparément.</p></div></div>
          {/* Types divisibles hors immeuble : la question précède la suite */}
          {!nonDecoupable && type !== "immeuble" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={divise}
                onChange={(e) => {
                  setDivise(e.target.checked);
                  if (guideActif) actualiserReperes();
                }}
                className="size-4"
              />
              Ce bien est divisé en plusieurs lots louables séparément
            </label>
          )}

          {multiLots ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">
                  {type === "immeuble" ? "Lots de l'immeuble" : "Lots du bien"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Un bail porte toujours sur un lot. Une clé de répartition sera à
                  définir ensuite pour ventiler les charges communes.
                </p>
              </div>
              {lots.map((lot, i) => (
                <div key={i} className={guideActif ? styles.lotLigne : "flex flex-wrap items-end gap-2"}>
                  <div className="space-y-1">
                    <Label htmlFor={`${idLot}-nom-${i}`} className="text-sm">
                      Nom du lot{guideActif && <span className="text-xs font-normal text-muted-foreground"> — facultatif</span>}
                    </Label>
                    <Input
                      id={`${idLot}-nom-${i}`}
                      value={lot.nom}
                      onChange={(e) => majLot(i, "nom", e.target.value)}
                      placeholder={`Lot ${i + 1}`}
                      className="w-44"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${idLot}-surface-${i}`} className="text-sm">
                      Surface (m²)
                    </Label>
                    <Input
                      id={`${idLot}-surface-${i}`}
                      value={lot.surface}
                      onChange={(e) => majLot(i, "surface", e.target.value)}
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className="w-28"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${idLot}-pieces-${i}`} className="text-sm">
                      Pièces
                    </Label>
                    <Input
                      id={`${idLot}-pieces-${i}`}
                      value={lot.pieces}
                      onChange={(e) => majLot(i, "pieces", e.target.value)}
                      type="number"
                      min={1}
                      required
                      className="w-20"
                    />
                  </div>
                  {lots.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => retirerLot(i)}
                      className="text-destructive"
                    >
                      Retirer
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={ajouterLot}>
                + Ajouter un lot
              </Button>
              {/* Transmis à l'action : la liste complète des lots à créer */}
              <input type="hidden" name="lots" value={JSON.stringify(lots)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={`${idLot}-unique-nom`}>Nom du lot</Label>
                <Input id={`${idLot}-unique-nom`} maxLength={200} required={guideActif}
                  value={lotUnique.nom ?? ""} onChange={e => setLotUnique(lot => ({...lot, nom:e.target.value}))}
                  placeholder="Appartement, studio, maison…" />
                <p className="text-xs text-muted-foreground">Le nom affiché dans votre parc. Vous pouvez l’adapter ici.</p>
              </div>
              <input type="hidden" name="lots" value={JSON.stringify([lotUnique])} />
              <div className="space-y-2">
                <Label htmlFor="lot-surface">
                  Surface {nonDecoupable ? "" : "du lot unique "}(m²)
                </Label>
                <Input
                  id="lot-surface"
                  name="surface_m2"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={lotUnique.surface}
                  onChange={e => setLotUnique(l => ({...l, surface:e.target.value}))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lot-pieces">Nombre de pièces</Label>
                <Input id="lot-pieces" name="pieces" type="number" min={1} required value={lotUnique.pieces} onChange={e => setLotUnique(l => ({...l, pieces:e.target.value}))} />
              </div>
            </div>
          )}
        </div>
      )}

      </div>
      {guideActif && etapeCreation === 1 && <div className={styles.creationNote}>{proprietaireAutomatique ? <UserRoundCheck size={17} aria-hidden="true"/> : <Info size={17} aria-hidden="true"/>}<p>{proprietaireAutomatique ? "Vous serez automatiquement rattaché comme propriétaire. Vous pourrez ensuite ajuster les propriétaires et les quotes-parts." : "Après l’enregistrement, complétez les propriétaires, les pièces, les équipements et les diagnostics du logement."}</p></div>}
      {etat.succes && (
        <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <div className="assistant-pied">
      {guideActif ? etapeCreation === 1 ? <Button type="button" variant="outline" onClick={() => changerEtape(0)}><ArrowLeft size={16} aria-hidden="true"/>Précédent</Button> : <span/> : null}
      {guideActif && etapeCreation === 0 ? <Button type="button" onClick={() => changerEtape(1)}>Suivant<ArrowRight size={16} aria-hidden="true"/></Button> : <BoutonEnvoi enCoursTexte="Enregistrement…">
        {bien ? libelleEnregistrer : guideActif ? multiLots && lots.length > 1 ? `Créer les ${lots.length} lots` : "Créer le lot et continuer" : multiLots ? `Créer le bien et ses ${lots.length} lots` : "Créer le bien et son lot unique"}
        {guideActif && <ArrowRight size={16} aria-hidden="true"/>}
      </BoutonEnvoi>}
      </div>
    </form>
  );
  return guideActif ? <CadreParcours etape={etapeCreation} changer={changerEtape} accessibles={2}
    etapes={ETAPES_LOT.map((e,i) => ({...e, ...(i<2 ? {statut:restants[i] ? "incomplet" as const : "complet" as const, restant:restants[i]} : {statutLibelle:"Après création du lot"})}))}
    resume={<><strong>{TYPES_BIEN[type] ?? type}</strong><p>{adresse || "Adresse à renseigner"}{(codePostal || ville) && ` · ${codePostal} ${ville}`}</p></>}>
    {contenu}
  </CadreParcours> : contenu;
}
