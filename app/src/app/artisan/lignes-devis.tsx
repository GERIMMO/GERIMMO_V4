"use client";
import { useId, useState } from "react";
import { calculerDevis, montantEnCentimes, type LigneDevis } from "@/lib/devis-structure";
import { euros } from "./libelles";
import { CLASSE_BOUTON_SOBRE, CLASSE_CHAMP } from "./ui";

type Saisie = { libelle: string; quantite: string; prix: string; tva: string };
const vide = (): Saisie => ({ libelle: "", quantite: "1", prix: "", tva: "0" });
export function LignesDevis({ initiales = [], titre = "Détail des travaux" }: { initiales?: LigneDevis[]; titre?: string }) {
  const id = useId();
  const [lignes, setLignes] = useState<Saisie[]>(() => initiales.length ? initiales.map(l => ({ libelle: l.libelle, quantite: String(l.quantite).replace(".", ","), prix: (l.prix_unitaire_ht_cents/100).toFixed(2).replace(".", ","), tva: String(l.tva_bps) })) : [vide()]);
  const donnees = lignes.map(l => ({ libelle: l.libelle, quantite: Number(l.quantite.replace(",", ".")), prix_unitaire_ht_cents: montantEnCentimes(l.prix), tva_bps: Number(l.tva) }));
  let total: ReturnType<typeof calculerDevis> | null = null;
  try { total = calculerDevis(donnees); } catch { /* Le formulaire et le serveur expliquent les champs invalides. */ }
  const modifier = (index: number, cle: keyof Saisie, valeur: string) => setLignes(ls => ls.map((l, i) => i===index ? {...l, [cle]: valeur} : l));
  return <fieldset className="space-y-4 rounded-xl border border-[var(--filet)] p-4">
    <legend className="px-1 font-semibold">{titre}</legend>
    <input type="hidden" name="lignes_devis" value={JSON.stringify(donnees)} />
    <p className="text-sm text-[var(--texte-secondaire)]">Précisez chaque prestation ou fourniture. Choisissez le taux de TVA adapté à votre situation et aux travaux.</p>
    {lignes.map((ligne, index) => <div key={`${id}-${index}`} className="space-y-2 rounded-lg bg-[var(--ardoise)] p-3">
      <label className="block text-sm">Prestation ou fourniture
        <input required maxLength={240} aria-label={`Ligne ${index+1} : prestation`} className={CLASSE_CHAMP} value={ligne.libelle} onChange={e => modifier(index,"libelle",e.target.value)} placeholder="Ex. : remplacement du robinet" />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-sm">Quantité<input required aria-label={`Ligne ${index+1} : quantité`} inputMode="decimal" className={CLASSE_CHAMP} value={ligne.quantite} onChange={e => modifier(index,"quantite",e.target.value)} /></label>
        <label className="text-sm">Prix unitaire HT (€)<input required aria-label={`Ligne ${index+1} : prix unitaire HT`} inputMode="decimal" className={CLASSE_CHAMP} value={ligne.prix} onChange={e => modifier(index,"prix",e.target.value)} placeholder="0,00" /></label>
        <label className="text-sm">TVA<select aria-label={`Ligne ${index+1} : TVA`} className={CLASSE_CHAMP} value={ligne.tva} onChange={e => modifier(index,"tva",e.target.value)}>
          <option value="0">0 % / non applicable</option><option value="210">2,1 %</option><option value="550">5,5 %</option><option value="1000">10 %</option><option value="2000">20 %</option>
        </select></label>
      </div>
      {lignes.length>1 && <button type="button" className={CLASSE_BOUTON_SOBRE} onClick={() => setLignes(ls => ls.filter((_,i) => i!==index))}>Retirer cette ligne</button>}
    </div>)}
    <button type="button" disabled={lignes.length>=100} className={CLASSE_BOUTON_SOBRE} onClick={() => setLignes(ls => [...ls,vide()])}>Ajouter une prestation ou fourniture</button>
    <div className="rounded-lg bg-[var(--ivoire)] p-3" aria-live="polite">
      {total ? <><p className="text-sm">Total HT : {euros(total.montant_ht_cents)} · TVA : {euros(total.montant_tva_cents)}</p><p className="font-semibold">Total TTC : {euros(total.montant_ttc_cents)}</p></> : <p className="text-sm">Le total apparaîtra une fois les lignes complétées.</p>}
    </div>
  </fieldset>;
}
