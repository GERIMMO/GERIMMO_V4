"use client";
import { useId, useState } from "react";
import { calculerDevis, erreurPrixSaisi, erreurQuantiteSaisie, montantEnCentimes, type LigneDevis } from "@/lib/devis-structure";
import type { LigneDevisSaisie } from "@/lib/brouillon-devis-local";
import { euros } from "./libelles";
import { CLASSE_BOUTON_SOBRE, CLASSE_CHAMP, CLASSE_LIBELLE, TitreSection } from "./ui";

/** Cellule de la grille : le champ se cale en bas, même si un libellé passe sur deux lignes. */
const CLASSE_CELLULE = "flex flex-col justify-end gap-1.5";
const CLASSE_ERREUR_CHAMP = "text-[0.9375rem] text-[var(--destructive-soft-foreground)]";
/** Bordure d'un champ refusé : le texte d'erreur dit pourquoi, la couleur seule ne suffit pas. */
const CLASSE_CHAMP_INVALIDE = "aria-invalid:border-[var(--destructive)]";
/** Dans une carte déjà ouverte, le bloc garde sa structure mais pas son habillage. */
const DANS_UNE_CARTE = "in-[.artisan-carte]:rounded-none in-[.artisan-carte]:border-0 in-[.artisan-carte]:bg-transparent in-[.artisan-carte]:p-0 in-[.artisan-carte]:shadow-none";

type Saisie = LigneDevisSaisie;
// 25/09 (A7) : PAS de taux de TVA par défaut. « 0 % » pré-choisi partait tel
// quel dans un devis que l'artisan n'avait pas relu ; le taux dépend de son
// régime et des travaux, et lui seul le sait. Le choix est obligatoire.
const vide = (): Saisie => ({ code: "", libelle: "", quantite: "1", prix: "", tva: "" });
export function LignesDevis({ initiales = [], saisieInitiale, titre = "Détail des travaux" }: { saisieInitiale?: LigneDevisSaisie[]; initiales?: (Omit<LigneDevis, "tva_bps" | "prix_unitaire_ht_cents"> & {code?: string; tva_bps: number | null; prix_unitaire_ht_cents: number | null})[]; titre?: string }) {
  const id = useId();
  const [lignes, setLignes] = useState<Saisie[]>(() => saisieInitiale ?? (initiales.length ? initiales.map(l => ({ code: l.code ?? "", libelle: l.libelle, quantite: String(l.quantite).replace(".", ","), prix: l.prix_unitaire_ht_cents === null ? "" : (l.prix_unitaire_ht_cents/100).toFixed(2).replace(".", ","), tva: l.tva_bps === null ? "" : String(l.tva_bps) })) : [vide()]));
  const donnees = lignes.map(l => ({ code: l.code ?? "", libelle: l.libelle, quantite: Number(l.quantite.replace(",", ".")), prix_unitaire_ht_cents: montantEnCentimes(l.prix), tva_bps: l.tva === "" ? Number.NaN : Number(l.tva) }));
  let total: ReturnType<typeof calculerDevis> | null = null;
  try { total = calculerDevis(donnees); } catch { /* Le formulaire et le serveur expliquent les champs invalides. */ }
  // ART-12 : une quantité ou un prix invalide laissait le total à 0,00 € sans
  // dire lequel des deux était en cause. Le message se pose sous la ligne ; un
  // champ vide n'est pas une erreur (le champ requis la signale à l'envoi).
  const erreurs = lignes.map(l => ({ quantite: erreurQuantiteSaisie(l.quantite), prix: erreurPrixSaisi(l.prix) }));
  const aDesErreurs = erreurs.some(e => e.quantite || e.prix);
  const modifier = (index: number, cle: keyof Saisie, valeur: string) => setLignes(ls => ls.map((l, i) => i===index ? {...l, [cle]: valeur, ...(cle === "libelle" ? { code: "" } : {})} : l));
  // 24/09 : le bloc prend l'habillage des autres cartes de l'espace (fond,
  // ombre, titre de section, libellés du formulaire) au lieu d'un cadre fin à
  // légende flottante. Posé dans une carte déjà ouverte (le dépassement du
  // bilan), il rend cet habillage pour ne pas empiler carte sur carte.
  return <fieldset data-lignes-devis className={`artisan-carte min-w-0 space-y-4 ${DANS_UNE_CARTE}`}>
    {/* Légende flottée : elle quitte la bordure et se lit comme un titre de section. */}
    <legend className="float-left mb-0 w-full"><TitreSection>{titre}</TitreSection></legend>
    <input type="hidden" name="lignes_devis_saisie" value={JSON.stringify(lignes)} />
    <input type="hidden" name="lignes_devis" value={JSON.stringify(donnees)} />
    <p className="clear-both text-[0.9375rem] text-[var(--texte-secondaire)]">Précisez chaque prestation ou fourniture. Choisissez le taux de TVA adapté à votre situation et aux travaux.</p>
    {/* 24/09 : plus de fond teinté par ligne — un filet sépare les lignes, rien pour une ligne seule. */}
    {lignes.map((ligne, index) => { const idQuantite = `${id}-${index}-quantite`, idPrix = `${id}-${index}-prix`, erreur = erreurs[index]; return <div data-ligne-devis key={`${id}-${index}`} className={`space-y-3 ${index > 0 ? "border-t border-[var(--filet-leger)] pt-4" : ""}`}>
      <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Prestation ou fourniture</span>
        <input required maxLength={240} aria-label={`Ligne ${index+1} : prestation`} className={CLASSE_CHAMP} value={ligne.libelle} onChange={e => modifier(index,"libelle",e.target.value)} placeholder="Ex. : remplacement du robinet" />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={CLASSE_CELLULE}><span className={CLASSE_LIBELLE}>Quantité</span><input required aria-label={`Ligne ${index+1} : quantité`} aria-invalid={erreur.quantite ? true : undefined} aria-describedby={erreur.quantite ? idQuantite : undefined} inputMode="decimal" className={`${CLASSE_CHAMP} ${CLASSE_CHAMP_INVALIDE}`} value={ligne.quantite} onChange={e => modifier(index,"quantite",e.target.value)} /></label>
        <label className={CLASSE_CELLULE}><span className={CLASSE_LIBELLE}>Prix unitaire HT (€)</span><input required aria-label={`Ligne ${index+1} : prix unitaire HT`} aria-invalid={erreur.prix ? true : undefined} aria-describedby={erreur.prix ? idPrix : undefined} inputMode="decimal" className={`${CLASSE_CHAMP} ${CLASSE_CHAMP_INVALIDE}`} value={ligne.prix} onChange={e => modifier(index,"prix",e.target.value)} placeholder="0,00" /></label>
        {/* Téléphone : la TVA prend toute la ligne, sinon « 0 % / non applicable » se tronque. */}
        <label className={`${CLASSE_CELLULE} col-span-2 sm:col-span-1`}><span className={CLASSE_LIBELLE}>TVA</span><select required aria-label={`Ligne ${index+1} : TVA`} className={CLASSE_CHAMP} value={ligne.tva} onChange={e => modifier(index,"tva",e.target.value)}>
          <option value="" disabled>Choisir un taux</option><option value="0">0 % / non applicable</option><option value="210">2,1 %</option><option value="550">5,5 %</option><option value="1000">10 %</option><option value="2000">20 %</option>
        </select></label>
      </div>
      {(erreur.quantite || erreur.prix) && <div className="space-y-1">
        {erreur.quantite && <p id={idQuantite} className={CLASSE_ERREUR_CHAMP}>{erreur.quantite}</p>}
        {erreur.prix && <p id={idPrix} className={CLASSE_ERREUR_CHAMP}>{erreur.prix}</p>}
      </div>}
      {lignes.length>1 && <button data-retirer-ligne type="button" className={CLASSE_BOUTON_SOBRE} onClick={() => setLignes(ls => ls.filter((_,i) => i!==index))}>Retirer cette ligne</button>}
    </div>; })}
    <button data-ajouter-ligne type="button" disabled={lignes.length>=100} className={CLASSE_BOUTON_SOBRE} onClick={() => setLignes(ls => [...ls,vide()])}>Ajouter une prestation ou fourniture</button>
    {/* Le total est du texte, pas une boîte : posé dans un cadre blanc, il passait pour un champ désactivé.
        25/09 (A8) : il s'affiche à 0,00 € dès le départ — l'artisan voit le format attendu avant de saisir. */}
    <div data-totaux-devis aria-live="polite">
      <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">Total HT : {euros(total?.montant_ht_cents ?? 0)} · TVA : {euros(total?.montant_tva_cents ?? 0)}</p>
      <p className="text-[1.0625rem] font-semibold text-[var(--encre)]">Total TTC : {euros(total?.montant_ttc_cents ?? 0)}</p>
      {!total && <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">{aDesErreurs ? "Le total n’est pas calculé : corrigez les champs signalés ci-dessus." : "Le total se met à jour à mesure que les lignes se complètent (prestation, prix et taux de TVA)."}</p>}
    </div>
  </fieldset>;
}
