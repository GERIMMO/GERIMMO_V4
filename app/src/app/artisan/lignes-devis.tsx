"use client";
import { useId, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { calculerDevis, erreurPrixSaisi, erreurQuantiteSaisie, lireQuantite, montantEnCentimes, type LigneDevis } from "@/lib/devis-structure";
import type { LigneDevisSaisie } from "@/lib/brouillon-devis-local";
import { avecLigneGardee, detailLigneGardee, reprendreLigne, type LigneGardee } from "@/lib/lignes-devis-gardees";
import { euros } from "./libelles";
import { CLASSE_AIDE, CLASSE_BOUTON_SOBRE, CLASSE_CHAMP, CLASSE_LIBELLE, TitreSection } from "./ui";

/**
 * P2-04 (audit palier 1) : les lignes que l'artisan a gardées, et les deux gestes pour en garder une de plus ou en
 * retirer une. `lignes` vaut `null` quand leur lecture a échoué : l'écran le dit et n'offre alors aucun geste.
 * Sans cette propriété, le bloc reste exactement celui d'avant (facture, bilan, chantier privé).
 */
export type MesLignesGardees = {
  lignes: LigneGardee[] | null;
  /**
   * La liste vit chez le parent, qui la reçoit ici après chaque geste : elle survit ainsi au remontage de ce bloc
   * (« Repartir d'un devis vierge » le remonte ; une ligne gardée l'instant d'avant doit rester proposée).
   */
  definir: (lignes: LigneGardee[]) => void;
  garder: (saisie: { libelle: string; prix: string; tva: string }) => Promise<{ erreur?: string; ligne?: LigneGardee }>;
  retirer: (ligneId: string) => Promise<{ erreur?: string; retiree?: string }>;
};

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
export function LignesDevis({ initiales = [], saisieInitiale, titre = "Détail des travaux", afficherHtIncomplet = false, mesLignes }: { mesLignes?: MesLignesGardees; afficherHtIncomplet?: boolean; saisieInitiale?: LigneDevisSaisie[]; initiales?: (Omit<LigneDevis, "tva_bps" | "prix_unitaire_ht_cents"> & {code?: string; tva_bps: number | null; prix_unitaire_ht_cents: number | null})[]; titre?: string }) {
  const id = useId();
  const [lignes, setLignes] = useState<Saisie[]>(() => saisieInitiale ?? (initiales.length ? initiales.map(l => ({ code: l.code ?? "", libelle: l.libelle, quantite: String(l.quantite).replace(".", ","), prix: l.prix_unitaire_ht_cents === null ? "" : (l.prix_unitaire_ht_cents/100).toFixed(2).replace(".", ","), tva: l.tva_bps === null ? "" : String(l.tva_bps) })) : [vide()]));
  const donnees = lignes.map(l => ({ code: l.code ?? "", libelle: l.libelle, quantite: lireQuantite(l.quantite) ?? Number.NaN, prix_unitaire_ht_cents: montantEnCentimes(l.prix), tva_bps: l.tva === "" ? Number.NaN : Number(l.tva) }));
  let total: ReturnType<typeof calculerDevis> | null = null;
  try { total = calculerDevis(donnees); } catch { /* Le formulaire et le serveur expliquent les champs invalides. */ }
  // Aperçu HT uniquement : même moteur et mêmes arrondis, sans modifier les lignes soumises.
  let totalHt: number | null = total?.montant_ht_cents ?? null;
  if (afficherHtIncomplet && totalHt === null) {
    try { totalHt = calculerDevis(donnees.map(l => ({ ...l, libelle: l.libelle || "Prestation", tva_bps: 0 }))).montant_ht_cents; } catch { /* Prix ou quantité incomplets : aucun montant inventé. */ }
  }
  const tvaManquante = lignes.some(l => l.tva === "");
  // ART-12 : une quantité ou un prix invalide laissait le total à 0,00 € sans
  // dire lequel des deux était en cause. Le message se pose sous la ligne ; un
  // champ vide n'est pas une erreur (le champ requis la signale à l'envoi).
  const erreurs = lignes.map(l => ({ quantite: erreurQuantiteSaisie(l.quantite), prix: erreurPrixSaisi(l.prix) }));
  const aDesErreurs = erreurs.some(e => e.quantite || e.prix);
  const modifier = (index: number, cle: keyof Saisie, valeur: string) => setLignes(ls => ls.map((l, i) => i===index ? {...l, [cle]: valeur, ...(cle === "libelle" ? { code: "" } : {})} : l));
  // P2-04 : les lignes gardées. Garder ou retirer une ligne n'envoie pas le devis et ne modifie pas sa saisie ;
  // reprendre une ligne la recopie dans la saisie, que l'artisan relit.
  const gardees = mesLignes?.lignes ?? [];
  const [avis, setAvis] = useState<{ ton: "succes" | "erreur"; texte: string } | null>(null);
  const [enCours, lancer] = useTransition();
  const garder = (index: number) => lancer(async () => {
    const l = lignes[index];
    const r = await mesLignes!.garder({ libelle: l.libelle, prix: l.prix, tva: l.tva });
    if (r.ligne) { const gardee = r.ligne; mesLignes!.definir(avecLigneGardee(gardees, gardee)); setAvis({ ton: "succes", texte: `« ${gardee.libelle} » est gardée : vous la retrouverez dans vos prochains devis.` }); }
    else setAvis({ ton: "erreur", texte: r.erreur ?? "La ligne n’a pas pu être gardée. Réessayez dans un instant." });
  });
  const retirer = (g: LigneGardee) => lancer(async () => {
    const r = await mesLignes!.retirer(g.id);
    if (r.retiree) { mesLignes!.definir(gardees.filter(x => x.id !== g.id)); setAvis({ ton: "succes", texte: `« ${g.libelle} » est retirée de vos lignes gardées. Les devis déjà préparés ne changent pas.` }); }
    else setAvis({ ton: "erreur", texte: r.erreur ?? "La ligne n’a pas pu être retirée. Réessayez dans un instant." });
  });
  const offertes = Boolean(mesLignes) && mesLignes!.lignes !== null;
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
    {/* Phase 3, lot 60 (E117) : en `flex`, le titre du volet perd le triangle du navigateur et rien ne disait qu'il s'ouvre ; un chevron le remplace et se retourne à l'ouverture. */}
    {mesLignes && <details data-mes-lignes className="group rounded-[var(--rayon-champ)] border border-[var(--filet)] px-3.5 open:pb-3">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-[var(--encre)] [&::-webkit-details-marker]:hidden"><span>Mes lignes gardées{offertes && gardees.length ? ` (${gardees.length})` : ""}</span><ChevronDown size={18} aria-hidden="true" className="shrink-0 text-[var(--texte-secondaire)] group-open:rotate-180" /></summary>
      {!offertes ? <p role="alert" className={CLASSE_ERREUR_CHAMP}>Vos lignes gardées n’ont pas pu être lues : rechargez la page avant d’en reprendre une.</p>
        : gardees.length === 0 ? <p className={CLASSE_AIDE}>Aucune ligne gardée pour l’instant. Sous une ligne de ce devis, « Garder cette ligne » la met de côté, avec son prix et sa TVA, pour vos prochains devis.</p>
        : <ul className="space-y-3">{gardees.map(g => <li key={g.id} data-ligne-gardee className="space-y-2 border-t border-[var(--filet-leger)] pt-3 first:border-t-0 first:pt-0">
          <p className="text-base text-[var(--encre)] [overflow-wrap:anywhere]"><strong>{g.libelle}</strong><span className="block text-[0.9375rem] font-normal text-[var(--texte-secondaire)]">{detailLigneGardee(g)}</span></p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-reprendre-ligne className={`${CLASSE_BOUTON_SOBRE} sm:w-auto`} aria-label={`Ajouter au devis : ${g.libelle}`} disabled={lignes.length >= 100 && !lignes.some(l => !l.libelle.trim() && !l.prix.trim())} onClick={() => setLignes(ls => reprendreLigne(ls, g))}>Ajouter au devis</button>
            <button type="button" data-retirer-ligne-gardee className="lien-discret inline-flex min-h-11 items-center px-2 text-[0.9375rem] underline underline-offset-2" aria-label={`Retirer de ma liste : ${g.libelle}`} disabled={enCours} onClick={() => retirer(g)}>Retirer de ma liste</button>
          </div>
        </li>)}</ul>}
    </details>}
    {mesLignes && <p role="status" aria-live="polite" data-avis-lignes-gardees className={avis ? (avis.ton === "erreur" ? CLASSE_ERREUR_CHAMP : "text-[0.9375rem] text-[var(--success-soft-foreground)]") : "sr-only"}>{avis?.texte ?? ""}</p>}
    {/* 24/09 : plus de fond teinté par ligne — un filet sépare les lignes, rien pour une ligne seule. */}
    {lignes.map((ligne, index) => { const idQuantite = `${id}-${index}-quantite`, idPrix = `${id}-${index}-prix`, erreur = erreurs[index]; return <div data-ligne-devis key={`${id}-${index}`} className={`space-y-3 ${index > 0 ? "border-t border-[var(--filet-leger)] pt-4" : ""}`}>
      <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Prestation ou fourniture</span>
        <input required maxLength={240} aria-label={`Ligne ${index+1} : prestation`} className={CLASSE_CHAMP} value={ligne.libelle} onChange={e => modifier(index,"libelle",e.target.value)} placeholder="Ex. : remplacement du robinet" />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={CLASSE_CELLULE}><span className={CLASSE_LIBELLE}>Quantité</span><input required aria-label={`Ligne ${index+1} : quantité`} aria-invalid={erreur.quantite ? true : undefined} aria-describedby={erreur.quantite ? idQuantite : undefined} inputMode="decimal" className={`${CLASSE_CHAMP} ${CLASSE_CHAMP_INVALIDE}`} value={ligne.quantite} onChange={e => modifier(index,"quantite",e.target.value)} /></label>
        <label className={CLASSE_CELLULE}><span className={CLASSE_LIBELLE}>Prix unitaire HT (€)</span><input required aria-label={`Ligne ${index+1} : prix unitaire HT`} aria-invalid={erreur.prix ? true : undefined} aria-describedby={erreur.prix ? idPrix : undefined} inputMode="decimal" className={`${CLASSE_CHAMP} ${CLASSE_CHAMP_INVALIDE}`} value={ligne.prix} onChange={e => modifier(index,"prix",e.target.value)} placeholder="0,00" /></label>
        {/* Téléphone : la TVA prend toute la ligne, sinon « 0 % / non applicable » se tronque. */}
        <label className={`${CLASSE_CELLULE} col-span-2 sm:col-span-1`}><span className={CLASSE_LIBELLE}>TVA</span><select required aria-label={`Ligne ${index+1} : TVA`} aria-describedby={afficherHtIncomplet && !ligne.tva ? `${id}-tva-aide` : undefined} className={`${CLASSE_CHAMP} ${afficherHtIncomplet && !ligne.tva ? "border-[var(--prestige-champagne)]" : ""}`} value={ligne.tva} onChange={e => modifier(index,"tva",e.target.value)}>
          <option value="" disabled>Choisir un taux</option><option value="0">0 % / non applicable</option><option value="210">2,1 %</option><option value="550">5,5 %</option><option value="1000">10 %</option><option value="2000">20 %</option>
        </select></label>
      </div>
      {(erreur.quantite || erreur.prix) && <div className="space-y-1">
        {erreur.quantite && <p id={idQuantite} className={CLASSE_ERREUR_CHAMP}>{erreur.quantite}</p>}
        {erreur.prix && <p id={idPrix} className={CLASSE_ERREUR_CHAMP}>{erreur.prix}</p>}
      </div>}
      {offertes && <button data-garder-ligne type="button" className="lien-discret inline-flex min-h-11 items-center text-left text-[0.9375rem] underline underline-offset-2" disabled={enCours || !ligne.libelle.trim()} onClick={() => garder(index)}>Garder cette ligne pour mes prochains devis</button>}
      {lignes.length>1 && <button data-retirer-ligne type="button" className={CLASSE_BOUTON_SOBRE} onClick={() => setLignes(ls => ls.filter((_,i) => i!==index))}>Retirer cette ligne</button>}
    </div>; })}
    <button data-ajouter-ligne type="button" disabled={lignes.length>=100} className={CLASSE_BOUTON_SOBRE} onClick={() => setLignes(ls => [...ls,vide()])}>Ajouter une prestation ou fourniture</button>
    <div data-totaux-devis aria-live="polite">
      {afficherHtIncomplet ? <>
        <p className="text-[1.0625rem] text-[var(--encre)]"><strong>Total HT : {totalHt === null ? "À compléter" : euros(totalHt)}</strong><span className="block text-sm font-normal">{total ? `TVA : ${euros(total.montant_tva_cents)}` : tvaManquante ? "TVA : à préciser" : "TVA : calcul en attente"}</span></p>
        <p className="text-[1.0625rem] font-semibold text-[var(--encre)]">Total TTC : {total ? euros(total.montant_ttc_cents) : "À compléter"}</p>
        {!total && <p id={`${id}-tva-aide`} className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">{aDesErreurs ? "Corrigez les quantités ou prix signalés pour calculer le total." : tvaManquante ? "Choisissez la TVA de chaque prestation pour calculer le TTC, y compris 0 % si elle ne s’applique pas." : "Complétez la prestation, la quantité et le prix pour calculer le TTC."}</p>}
      </> : <>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">Total HT : {euros(total?.montant_ht_cents ?? 0)} · TVA : {euros(total?.montant_tva_cents ?? 0)}</p>
        <p className="text-[1.0625rem] font-semibold text-[var(--encre)]">Total TTC : {euros(total?.montant_ttc_cents ?? 0)}</p>
        {!total && <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">{aDesErreurs ? "Le total n’est pas calculé : corrigez les champs signalés ci-dessus." : "Le total se met à jour à mesure que les lignes se complètent (prestation, prix et taux de TVA)."}</p>}
      </>}
    </div>
  </fieldset>;
}
