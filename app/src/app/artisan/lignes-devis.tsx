"use client";
import { useId, useState } from "react";
import { calculerDevis, montantEnCentimes, type LigneDevis } from "@/lib/devis-structure";
import { euros } from "./libelles";
import { CLASSE_BOUTON_SOBRE, CLASSE_CHAMP, CLASSE_LIBELLE, TitreSection } from "./ui";

/** Cellule de la grille : le champ se cale en bas, même si un libellé passe sur deux lignes. */
const CLASSE_CELLULE = "flex flex-col justify-end gap-1.5";
/** Dans une carte déjà ouverte, le bloc garde sa structure mais pas son habillage. */
const DANS_UNE_CARTE = "in-[.artisan-carte]:rounded-none in-[.artisan-carte]:border-0 in-[.artisan-carte]:bg-transparent in-[.artisan-carte]:p-0 in-[.artisan-carte]:shadow-none";

type Saisie = { libelle: string; quantite: string; prix: string; tva: string };
const vide = (): Saisie => ({ libelle: "", quantite: "1", prix: "", tva: "0" });
export function LignesDevis({ initiales = [], titre = "Détail des travaux" }: { initiales?: LigneDevis[]; titre?: string }) {
  const id = useId();
  const [lignes, setLignes] = useState<Saisie[]>(() => initiales.length ? initiales.map(l => ({ libelle: l.libelle, quantite: String(l.quantite).replace(".", ","), prix: (l.prix_unitaire_ht_cents/100).toFixed(2).replace(".", ","), tva: String(l.tva_bps) })) : [vide()]);
  const donnees = lignes.map(l => ({ libelle: l.libelle, quantite: Number(l.quantite.replace(",", ".")), prix_unitaire_ht_cents: montantEnCentimes(l.prix), tva_bps: Number(l.tva) }));
  let total: ReturnType<typeof calculerDevis> | null = null;
  try { total = calculerDevis(donnees); } catch { /* Le formulaire et le serveur expliquent les champs invalides. */ }
  const modifier = (index: number, cle: keyof Saisie, valeur: string) => setLignes(ls => ls.map((l, i) => i===index ? {...l, [cle]: valeur} : l));
  // 24/09 : le bloc prend l'habillage des autres cartes de l'espace (fond,
  // ombre, titre de section, libellés du formulaire) au lieu d'un cadre fin à
  // légende flottante. Posé dans une carte déjà ouverte (le dépassement du
  // bilan), il rend cet habillage pour ne pas empiler carte sur carte.
  return <fieldset className={`artisan-carte min-w-0 space-y-4 ${DANS_UNE_CARTE}`}>
    {/* Légende flottée : elle quitte la bordure et se lit comme un titre de section. */}
    <legend className="float-left mb-0 w-full"><TitreSection>{titre}</TitreSection></legend>
    <input type="hidden" name="lignes_devis" value={JSON.stringify(donnees)} />
    <p className="clear-both text-[0.9375rem] text-[var(--texte-secondaire)]">Précisez chaque prestation ou fourniture. Choisissez le taux de TVA adapté à votre situation et aux travaux.</p>
    {/* 24/09 : plus de fond teinté par ligne — un filet sépare les lignes, rien pour une ligne seule. */}
    {lignes.map((ligne, index) => <div key={`${id}-${index}`} className={`space-y-3 ${index > 0 ? "border-t border-[var(--filet-leger)] pt-4" : ""}`}>
      <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Prestation ou fourniture</span>
        <input required maxLength={240} aria-label={`Ligne ${index+1} : prestation`} className={CLASSE_CHAMP} value={ligne.libelle} onChange={e => modifier(index,"libelle",e.target.value)} placeholder="Ex. : remplacement du robinet" />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={CLASSE_CELLULE}><span className={CLASSE_LIBELLE}>Quantité</span><input required aria-label={`Ligne ${index+1} : quantité`} inputMode="decimal" className={CLASSE_CHAMP} value={ligne.quantite} onChange={e => modifier(index,"quantite",e.target.value)} /></label>
        <label className={CLASSE_CELLULE}><span className={CLASSE_LIBELLE}>Prix unitaire HT (€)</span><input required aria-label={`Ligne ${index+1} : prix unitaire HT`} inputMode="decimal" className={CLASSE_CHAMP} value={ligne.prix} onChange={e => modifier(index,"prix",e.target.value)} placeholder="0,00" /></label>
        {/* Téléphone : la TVA prend toute la ligne, sinon « 0 % / non applicable » se tronque. */}
        <label className={`${CLASSE_CELLULE} col-span-2 sm:col-span-1`}><span className={CLASSE_LIBELLE}>TVA</span><select aria-label={`Ligne ${index+1} : TVA`} className={CLASSE_CHAMP} value={ligne.tva} onChange={e => modifier(index,"tva",e.target.value)}>
          <option value="0">0 % / non applicable</option><option value="210">2,1 %</option><option value="550">5,5 %</option><option value="1000">10 %</option><option value="2000">20 %</option>
        </select></label>
      </div>
      {lignes.length>1 && <button type="button" className={CLASSE_BOUTON_SOBRE} onClick={() => setLignes(ls => ls.filter((_,i) => i!==index))}>Retirer cette ligne</button>}
    </div>)}
    <button type="button" disabled={lignes.length>=100} className={CLASSE_BOUTON_SOBRE} onClick={() => setLignes(ls => [...ls,vide()])}>Ajouter une prestation ou fourniture</button>
    {/* Le total est du texte, pas une boîte : posé dans un cadre blanc, il passait pour un champ désactivé. */}
    <div aria-live="polite">
      {total ? <><p className="text-[0.9375rem] text-[var(--texte-secondaire)]">Total HT : {euros(total.montant_ht_cents)} · TVA : {euros(total.montant_tva_cents)}</p><p className="text-[1.0625rem] font-semibold text-[var(--encre)]">Total TTC : {euros(total.montant_ttc_cents)}</p></> : <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">Le total apparaîtra une fois les lignes complétées.</p>}
    </div>
  </fieldset>;
}
