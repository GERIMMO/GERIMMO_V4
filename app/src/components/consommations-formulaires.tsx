"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { enregistrerConsommation, type EtatConsommations } from "@/app/actions/consommations";
import { RepartitionFacture } from "./repartition-fourniture";
import type { RepartitionFourniture } from "@/lib/proposition-repartition";
import { Button } from "./ui/button";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import { LectureDocumentAssistee } from "./lecture-document-assistee";
import { ChampFichier } from "./champ-fichier";
import { ApercuDocumentEspace } from "./apercu-document-espace";
import { usePhotoConsommation } from "@/lib/use-photo-consommation";
import { comparerFactureReleves, debutFactureSuivante } from "@/lib/rapprochement-fourniture";
import { eur, formaterDate } from "@/lib/ged";
import { TYPES_COMPTEUR, CATEGORIES_FOURNITURE, consommationEntre, type CompteurConsommation, type ContratFourniture, type FactureFourniture, type DemandeReleve, type ReleveConsommation } from "@/lib/consommations";
import styles from "./consommations.module.css";

export type BailConso = { id: string; lot_id: string; locataire_principal: string | null; nom: string; mode_charges: string | null; date_debut: string; date_fin: string | null; etat: string };
export type SuggestionCompteur = { type: string; numero: string | null; index: string; date: string; lotId: string; bailId: string };
type Props = { orgId: string; bienId: string; lotId: string | null; base: string; lectureSeule: boolean; aujourdHui: string;
  compteurs: CompteurConsommation[]; contrats: ContratFourniture[]; factures: FactureFourniture[]; demandes: DemandeReleve[]; releves: ReleveConsommation[];
  repartitions: RepartitionFourniture[];
  lots: { id: string; nom: string; etat: string }[]; baux: BailConso[]; suggestions: SuggestionCompteur[] };
type Contexte = Pick<Props, "orgId" | "bienId" | "lotId">;
function Champ({ titre, children }: { titre: string; children: ReactNode }) { return <label>{titre}{children}</label>; }
function Frequence({ valeur = 1 }: { valeur?: number }) { return <Champ titre="Fréquence"><select name="periodicite_mois" defaultValue={valeur}>{[1, 2, 3, 6, 12].map(n => <option key={n} value={n}>{n === 1 ? "Chaque mois" : n === 12 ? "Chaque année" : `Tous les ${n} mois`}</option>)}</select></Champ>; }
function Form({ p, action, id, children, titre = "Enregistrer", fini, extra, bloque = false }: { p: Contexte; action: string; id?: string; children?: ReactNode; titre?: string; fini?: (message: string) => void; extra?: (etat: EtatConsommations) => ReactNode; bloque?: boolean }) {
  const [etat, submit, pending] = useActionStateProtegee(enregistrerConsommation.bind(null, p.orgId, p.bienId, p.lotId), {} as EtatConsommations);
  useEffect(() => { if (etat.succes && fini) fini(etat.succes); }, [etat, fini]);
  return <form data-saisie-confirmee action={submit} onReset={e => e.preventDefault()} onSubmitCapture={e => { if (bloque) e.preventDefault(); }} className={styles.form}>
    <input type="hidden" name="action" value={etat.synchronisationAReprendre ? "synchroniser" : action} />{id && <input type="hidden" name="id" value={id} />}
    <fieldset disabled={pending || etat.synchronisationAReprendre} className="contents">{children}</fieldset>{extra?.(etat)}
    {etat.erreur && <p role="alert" className={styles.error}>{etat.erreur}</p>}{etat.succes && !fini && <p role="status" className={styles.ok}>{etat.succes}</p>}
    <BoutonEnvoi enCours={pending} enCoursTexte="Enregistrement…" disabled={bloque}>{etat.synchronisationAReprendre ? "Réessayer les demandes" : titre}</BoutonEnvoi>
  </form>;
}
function prochaineDate(date: string) { const d = new Date(`${date}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1, 1); return d.toISOString().slice(0, 10); }

export function FormulairesConsommations(p: Props) {
  const [ajout, setAjout] = useState<"compteur" | "contrat" | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionCompteur | undefined>();
  const [message, setMessage] = useState("");
  const actifs = p.compteurs.filter(c => c.actif), contrats = p.contrats.filter(c => c.actif);
  const terminer = (m: string) => { setAjout(null); setSuggestion(undefined); setMessage(m); };
  return <>
    {message && <p role="status" className={styles.ok}>{message}</p>}
    {!actifs.length && !contrats.length && <p className={styles.muted}>Confiez les relevés aux locataires et retrouvez ici les factures liées à ce {p.lotId ? "logement" : "bien"}.</p>}
    {actifs.map(c => <Compteur key={c.id} p={p} c={c} />)}
    {contrats.map(c => <Contrat key={c.id} p={p} c={c} />)}
    {!p.lectureSeule && <>
      {p.suggestions.length > 0 && !ajout && <details><summary className={styles.muted}>Reprendre un compteur de l’état des lieux ({p.suggestions.length})</summary><div className={styles.list}>{p.suggestions.map((s, i) => <Button key={i} type="button" variant="outline" onClick={() => { setSuggestion(s); setAjout("compteur"); }}>{s.type.replaceAll("_", " ")} · {s.numero || "sans numéro"} · {s.index}</Button>)}</div></details>}
      {!ajout ? <div className={styles.actions}><Button type="button" size="sm" variant="outline" onClick={() => { setMessage(""); setAjout("compteur"); }}>Ajouter un compteur</Button><Button type="button" size="sm" variant="outline" onClick={() => { setMessage(""); setAjout("contrat"); }}>Ajouter un contrat ou une charge</Button></div> : <>
        <div className={styles.line}><h3>{ajout === "compteur" ? "Nouveau compteur" : "Nouveau contrat ou charge"}</h3><Button type="button" variant="ghost" onClick={() => setAjout(null)}>Annuler</Button></div>
        {ajout === "compteur" ? <Form p={p} action="compteur" fini={terminer}><ChampsCompteur p={p} suggestion={suggestion} /></Form> : <Form p={p} action="contrat" fini={terminer}><ChampsContrat p={p} /></Form>}
      </>}
    </>}
    {(p.compteurs.some(c => !c.actif) || p.contrats.some(c => !c.actif)) && <details><summary className={styles.muted}>Historique des compteurs et contrats arrêtés</summary>{p.compteurs.filter(c => !c.actif).map(c => <Compteur key={c.id} p={{ ...p, lectureSeule: true }} c={c} />)}{p.contrats.filter(c => !c.actif).map(c => <Contrat key={c.id} p={p} c={c} />)}</details>}
  </>;
}

function ChampsCompteur({ p, c, suggestion }: { p: Props; c?: CompteurConsommation; suggestion?: SuggestionCompteur }) {
  const lotsDisponibles = p.lots.filter(l => l.etat !== "archive");
  const [lot, setLot] = useState(c?.lot_id ?? p.lotId ?? suggestion?.lotId ?? (lotsDisponibles.length === 1 ? lotsDisponibles[0].id : ""));
  const connu = suggestion?.type.toLowerCase().replaceAll("é", "e").replaceAll(" ", "_");
  const [type, setType] = useState(c?.type ?? (connu && connu in TYPES_COMPTEUR ? connu : "eau_froide"));
  const candidats = p.baux.filter(b => b.lot_id === lot && b.locataire_principal && ["actif", "preavis"].includes(b.etat) && b.date_debut <= p.aujourdHui);
  const bailPropose = candidats.some(b => b.id === c?.bail_referent) ? c!.bail_referent! : candidats.some(b => b.id === suggestion?.bailId) ? suggestion!.bailId : candidats.length === 1 ? candidats[0].id : "";
  const dejaDemande = c && (p.demandes.some(d => d.compteur_id === c.id) || p.releves.some(r => r.compteur_id === c.id));
  return <>
    {suggestion && <p className={styles.ok}>Informations reprises de l’état des lieux. Vérifiez le compteur et la date avant d’activer le suivi.</p>}
    <div className={styles.fields}>
      <Champ titre="Compteur"><select name="type" value={type} onChange={e => setType(e.target.value)} disabled={!!dejaDemande}>{Object.entries(TYPES_COMPTEUR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{dejaDemande && <input type="hidden" name="type" value={type} />}</Champ>
      {!p.lotId && <Champ titre="Emplacement"><select name="lot_id" value={lot} disabled={!!dejaDemande} onChange={e => setLot(e.target.value)}><option value="">Compteur général / parties communes</option>{p.lots.filter(l => l.etat !== "archive" || l.id === c?.lot_id).map(l => <option key={l.id} value={l.id}>{l.nom}{l.etat === "archive" ? " (archivé)" : ""}</option>)}</select>{dejaDemande && <input type="hidden" name="lot_id" value={lot} />}</Champ>}
      <Champ titre="Dernier index connu"><input name="index_initial" inputMode="decimal" required defaultValue={c?.index_initial ?? suggestion?.index ?? ""} readOnly={!!dejaDemande} /></Champ>
      <Champ titre="Date de ce relevé"><input name="date_index_initial" type="date" required max={p.aujourdHui} defaultValue={c?.date_index_initial ?? suggestion?.date ?? p.aujourdHui} readOnly={!!dejaDemande} /></Champ>
    </div>
    {lot && <Champ titre="Qui fera les prochains relevés ?"><select key={lot} name="bail_referent" defaultValue={bailPropose}><option value="">Je les renseignerai moi-même</option>{candidats.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}</select>{!candidats.length && <span className={styles.caption}>Les demandes au locataire seront disponibles dès qu’un bail sera en cours.</span>}</Champ>}
    <div className={styles.fields}><Champ titre="Prochaine demande"><input name="prochaine_demande" type="date" required defaultValue={c?.prochaine_demande ?? prochaineDate(p.aujourdHui)} /></Champ><Frequence valeur={c?.periodicite_mois} /></div>
    <details><summary>Numéro, accès et unité du compteur</summary><div className={styles.fields}>
      <Champ titre="Nom du compteur"><input name="libelle" maxLength={120} defaultValue={c?.libelle} placeholder={TYPES_COMPTEUR[type as keyof typeof TYPES_COMPTEUR]} /></Champ>
      <Champ titre="Numéro"><input name="numero" maxLength={120} defaultValue={c?.numero ?? suggestion?.numero ?? ""} /></Champ>
      <Champ titre="Où le trouver ?"><input name="emplacement" maxLength={500} defaultValue={c?.emplacement ?? ""} placeholder="Ex. placard de l’entrée" /></Champ>
      <Champ titre="Unité affichée"><select name="unite" key={type} defaultValue={c?.unite ?? (type.startsWith("eau") || type === "gaz" ? "m3" : "kwh")} disabled={!!dejaDemande}><option value="m3">m³</option><option value="kwh">kWh</option></select>{dejaDemande && <input type="hidden" name="unite" value={c!.unite} />}</Champ>
    </div></details>
  </>;
}
function Compteur({ p, c }: { p: Props; c: CompteurConsommation }) {
  const [edit, setEdit] = useState(false), [saisie, setSaisie] = useState(false);
  const lignes = p.releves.filter(r => r.compteur_id === c.id);
  const dernier = lignes[0];
  const demande = p.demandes.find(d => d.compteur_id === c.id && d.statut === "attendue");
  const unite = c.unite === "m3" ? "m³" : "kWh";
  const precedent = dernier?.index_releve ?? c.index_initial;
  const destinataireTermine = c.actif && c.bail_referent && !p.baux.some(b => b.id === c.bail_referent && ["actif", "preavis"].includes(b.etat));
  let delta: number | null = null;
  try { if (dernier) delta = consommationEntre(lignes[1]?.index_releve ?? c.index_initial, dernier.index_releve); } catch { /* Historique signalé dans la fiche, pas de calcul inventé. */ }
  return <div className={styles.row}>
    <div className={styles.line}><strong>{c.libelle}{!p.lotId && c.lot_id ? ` · ${p.lots.find(l => l.id === c.lot_id)?.nom ?? "Logement"}` : ""}</strong><span className={styles.badge}>{demande ? `Relevé attendu le ${formaterDate(demande.echeance)}` : c.actif ? "Suivi actif" : "Arrêté"}</span></div>
    <p className={styles.muted}>{Number(precedent).toLocaleString("fr-FR")} {unite} au {formaterDate(dernier?.date_releve ?? c.date_index_initial)}{delta != null ? ` · ${delta.toLocaleString("fr-FR")} ${unite} depuis le relevé précédent` : ""}</p>
    {c.bail_referent && <p className={styles.caption}>Relevés demandés à {p.baux.find(b => b.id === c.bail_referent)?.nom ?? "l’occupant désigné"}{c.actif ? ` · prochaine demande le ${formaterDate(c.prochaine_demande)}` : ""}</p>}
    {destinataireTermine && <p className={styles.warning}>Le bail du précédent destinataire est terminé. Choisissez qui recevra les prochains relevés.</p>}
    {!p.lectureSeule && <div className={styles.actions}><Button size="sm" variant="outline" type="button" onClick={() => setSaisie(!saisie)}>Renseigner un relevé</Button><Button size="sm" variant="ghost" type="button" onClick={() => setEdit(!edit)}>{destinataireTermine ? "Choisir le destinataire" : "Réglages"}</Button></div>}
    {saisie && !p.lectureSeule && <Form p={p} action="releve" id={c.id} fini={() => setSaisie(false)}><div className={styles.fields}><Champ titre={`Index (${unite})`}><input name="index" inputMode="decimal" required /></Champ><Champ titre="Date du relevé"><input name="date" type="date" defaultValue={p.aujourdHui} min={new Date(Date.parse(`${c.date_index_initial}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)} max={p.aujourdHui} required /></Champ></div><p className={styles.caption}>Vous pouvez aussi ajouter un ancien relevé manquant pour une facture. Son index sera vérifié entre les relevés connus.</p></Form>}
    {edit && !p.lectureSeule && <><Form p={p} action="compteur" id={c.id} fini={() => setEdit(false)}><ChampsCompteur p={p} c={c} /></Form><details><summary className={styles.muted}>Compteur remplacé ou suivi terminé</summary><p className={styles.muted}>Arrêtez ce suivi puis ajoutez le nouveau compteur. Les anciens relevés sont conservés.</p><Form p={p} action="archiver_compteur" id={c.id} titre="Arrêter ce suivi" fini={() => setEdit(false)} /></details></>}
    {lignes.length > 0 && <details><summary className={styles.muted}>{lignes.length === 1 ? "Voir le relevé" : `Voir les ${lignes.length} relevés`}</summary><ul className={styles.history}>{lignes.map(l => <li key={l.id}><span>{formaterDate(l.date_releve)} · {Number(l.index_releve).toLocaleString("fr-FR")} {unite} </span>{l.photo_document_id && <ApercuDocumentEspace fichier={`${p.base}/documents/${l.photo_document_id}/fichier`} titre={`Photo du compteur ${c.libelle}`} />}</li>)}</ul></details>}
  </div>;
}
function ChampsContrat({ p, c }: { p: Props; c?: ContratFourniture }) {
  const historique = !!c && p.factures.some(f => f.contrat_id === c.id);
  return <><div className={styles.fields}><Champ titre="Fournisseur ou organisme"><input name="fournisseur" required maxLength={150} defaultValue={c?.fournisseur} placeholder="Ex. fournisseur d’eau" /></Champ><Champ titre="Type"><select name="categorie" defaultValue={c?.categorie ?? "eau"} disabled={historique}>{Object.entries(CATEGORIES_FOURNITURE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{historique && <input name="categorie" type="hidden" value={c!.categorie} />}</Champ></div>
    {!p.lotId && <Champ titre="Concerne"><select name="lot_id" defaultValue={c?.lot_id ?? ""} disabled={historique}><option value="">Tout le bâtiment</option>{p.lots.filter(l => l.etat !== "archive" || l.id === c?.lot_id).map(l => <option key={l.id} value={l.id}>{l.nom}{l.etat === "archive" ? " (archivé)" : ""}</option>)}</select>{historique && <input name="lot_id" type="hidden" value={c!.lot_id ?? ""} />}</Champ>}
    {historique && <p className={styles.caption}>Des factures sont rattachées à ce contrat. Pour changer son type ou son logement, archivez-le puis ajoutez un nouveau contrat. Les autres réglages restent modifiables.</p>}
    <details open={!!c?.echeance}><summary>Montant et rappel d’échéance</summary><div className={styles.fields}><Champ titre="Montant habituel (€)"><input name="montant" inputMode="decimal" defaultValue={c?.montant_cents != null ? c.montant_cents / 100 : ""} /></Champ><Frequence valeur={c?.periodicite_mois} /><Champ titre="Fin de contrat / renouvellement"><input name="echeance" type="date" defaultValue={c?.echeance ?? ""} /></Champ><Champ titre="Préavis (jours)"><input name="preavis_jours" type="number" min="0" max="366" defaultValue={c?.preavis_jours ?? 30} /></Champ><Champ titre="Référence du contrat"><input name="reference" maxLength={150} defaultValue={c?.reference ?? ""} /></Champ></div></details>
  </>;
}
function Contrat({ p, c }: { p: Props; c: ContratFourniture }) {
  const [ajout, setAjout] = useState(false), [edit, setEdit] = useState(false);
  const factures = p.factures.filter(f => f.contrat_id === c.id);
  return <div className={styles.row}>
    <div className={styles.line}><strong>{c.fournisseur}</strong><span className={styles.badge}>{CATEGORIES_FOURNITURE[c.categorie]}</span></div>
    <p className={styles.muted}>{c.montant_cents != null ? `${eur(c.montant_cents / 100)} · ` : ""}{c.lot_id ? p.lots.find(l => l.id === c.lot_id)?.nom : "Bâtiment entier"}{c.echeance ? ` · échéance le ${formaterDate(c.echeance)}` : ""}</p>
    {!p.lectureSeule && <div className={styles.actions}><Button type="button" size="sm" variant="outline" onClick={() => setAjout(!ajout)}>{c.actif ? "Ajouter une facture" : "Ajouter la facture de clôture"}</Button>{c.actif && <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(!edit)}>Modifier le contrat</Button>}</div>}
    {edit && !p.lectureSeule && <><Form p={p} action="contrat" id={c.id} fini={() => setEdit(false)}><ChampsContrat p={p} c={c} /></Form><details><summary className={styles.muted}>Contrat terminé</summary><Form p={p} action="archiver_contrat" id={c.id} titre="Archiver le contrat" fini={() => setEdit(false)} /></details></>}
    {ajout && !p.lectureSeule && <NouvelleFacture p={p} c={c} derniere={factures[0]} fini={() => setAjout(false)} />}
    {factures.length > 0 && <details><summary className={styles.muted}>{factures.length} facture{factures.length > 1 ? "s" : ""} · {eur(factures.reduce((s, f) => s + Number(f.total_cents), 0) / 100)}</summary><div className={styles.list}>{factures.map(f => <Facture key={f.id} p={p} c={c} f={f} />)}</div></details>}
  </div>;
}
function NouvelleFacture({ p, c, derniere, fini }: { p: Props; c: ContratFourniture; derniere?: FactureFourniture; fini: () => void }) {
  const champId = useId();
  const { fichier, preparation, erreur: erreurDepot, empreinte, choisir: choisirDocument, lierChamp: lierDocument } = usePhotoConsommation(true);
  const [lus, setLus] = useState<Record<string, string>>({
    total: c.montant_cents != null ? String(c.montant_cents / 100) : "",
    periode_debut: debutFactureSuivante(c.categorie, derniere?.periode_fin) ?? "",
  });
  const [lectureAppliquee, setLectureAppliquee] = useState(false);
  const champ = (nom: string) => ({ value: lus[nom] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setLus(v => ({ ...v, [nom]: e.target.value })) });
  return <Form p={p} action="facture" fini={fini} bloque={preparation || !!erreurDepot} extra={etat => etat.documentId && empreinte && etat.documentEmpreinte === empreinte ? <><input type="hidden" name="document_id" value={etat.documentId} /><p className={styles.caption}>La pièce est déjà conservée. Corrigez les informations puis réessayez.</p></> : null}>
    <input type="hidden" name="contrat_id" value={c.id} /><h4>Facture · {c.fournisseur}</h4>
    <ChampFichier id={champId} ref={lierDocument} name="document" accept="application/pdf,image/jpeg,image/png" depotDirect libelle="Joindre la facture" onChange={choisirDocument} />
    {preparation && <p role="status" className={styles.muted}>Préparation du document…</p>}{erreurDepot && <p role="alert" className={styles.error}>{erreurDepot}</p>}
    <LectureDocumentAssistee key={fichier ? `${fichier.name}-${fichier.lastModified}` : "vide"} orgId={p.orgId} fichier={fichier} appliquer={lecture => {
      const valeurs = Object.fromEntries(Object.entries(lecture).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      // Un avis foncier contient plusieurs taxes : le total OCR n'est pas le montant TEOM.
      if (c.categorie === "teom") { delete valeurs.total; delete valeurs.frais_fixes; delete valeurs.frais_gestion; }
      setLus(precedentes => ({ ...precedentes, ...valeurs }));
      setLectureAppliquee(true);
    }} />
    {c.categorie === "teom" && <p className={styles.caption}>Recopiez uniquement la ligne « taxe d’enlèvement des ordures ménagères » et ses frais de gestion. Le total de l’avis foncier ne sera pas repris automatiquement.</p>}
    <div className={styles.fields}><Champ titre="Référence de la facture"><input name="reference" required maxLength={150} {...champ("reference")} /></Champ><Champ titre={c.categorie === "teom" ? "Montant TEOM (€), hors autres taxes" : "Total TTC (€)"}><input name="total" inputMode="decimal" required {...champ("total")} /></Champ><Champ titre="Période du"><input type="date" name="periode_debut" required {...champ("periode_debut")} /></Champ><Champ titre="Au"><input type="date" name="periode_fin" required {...champ("periode_fin")} /></Champ></div>
    <details open={lectureAppliquee}><summary>Consommation, abonnement et paiement</summary><div className={styles.fields}>{c.categorie === "gaz" && <Champ titre="Unité indiquée sur la facture"><select name="unite_consommation" {...champ("unite_consommation")}><option value="">À vérifier sur la facture</option><option value="m3">m³</option><option value="kwh">kWh</option></select></Champ>}<Champ titre="Consommation facturée (unité du compteur)"><input name="consommation" inputMode="decimal" {...champ("consommation")} /></Champ><Champ titre="Dont abonnement / frais fixes (€)"><input name="frais_fixes" inputMode="decimal" {...champ("frais_fixes")} /></Champ>{c.categorie === "teom" && <Champ titre="Dont frais de gestion (€)"><input name="frais_gestion" inputMode="decimal" {...champ("frais_gestion")} /></Champ>}<Champ titre="À payer avant le"><input name="date_echeance" type="date" {...champ("date_echeance")} /></Champ></div></details>
  </Form>;
}
function Facture({ p, c, f }: { p: Props; c: ContratFourniture; f: FactureFourniture }) {
  const [paiement, setPaiement] = useState(false);
  const [rapprochement, setRapprochement] = useState(false);
  const comparaison = comparerFactureReleves(f, c, p.compteurs, p.releves, p.lots.map(l => l.id));
  const bilan = comparaison.bilan;
  return <article className={styles.invoice}>
    <div className={styles.line}><strong>{f.reference} · {eur(Number(f.total_cents) / 100)}</strong><span className={styles.badge}>{f.payee_le ? `Payée le ${formaterDate(f.payee_le)}` : "Paiement à vérifier"}</span></div>
    <p className={styles.caption}>{formaterDate(f.periode_debut)} – {formaterDate(f.periode_fin)}</p>
    <div className={styles.actions}><ApercuDocumentEspace fichier={`${p.base}/documents/${f.document_id}/fichier`} titre={`Facture ${c.fournisseur} ${f.reference}`} />{!f.payee_le && !p.lectureSeule && <Button type="button" size="sm" variant="outline" onClick={() => setPaiement(!paiement)}>Indiquer le paiement</Button>}{f.consommation != null && <Button type="button" size="sm" variant="ghost" onClick={() => setRapprochement(!rapprochement)}>Comparer aux relevés</Button>}</div>
    {paiement && !p.lectureSeule && <Form p={p} action="facture_payee" id={f.id} fini={() => setPaiement(false)}><Champ titre="Payée le"><input name="date" type="date" defaultValue={p.aujourdHui} max={p.aujourdHui} required /></Champ></Form>}
    <RepartitionFacture base={p.base} orgId={p.orgId} factureId={f.id} existante={p.repartitions.find(r => r.facture_id === f.id)} lots={c.lot_id ? p.lots.filter(l => l.id === c.lot_id) : p.lots} baux={p.baux} lectureSeule={p.lectureSeule} categorie={c.categorie} compteurs={p.compteurs} releves={p.releves} facture={f}
      reglagesPrecedents={p.factures.filter(x => x.contrat_id === c.id && x.periode_fin < f.periode_fin).map(x => p.repartitions.find(r => r.facture_id === x.id)?.source?.reglages).find(Boolean)} />
    {rapprochement && <div className={styles.warning}>{bilan ? <><p>Facture : {bilan.consommationFacturee.toLocaleString("fr-FR")} {comparaison.unite} · relevés : {bilan.consommationRelevee.toLocaleString("fr-FR")} {comparaison.unite} · écart : {bilan.ecart.toLocaleString("fr-FR")} {comparaison.unite}</p>{bilan.avertissements.map(a => <p key={a}>{a}</p>)}{!bilan.avertissements.length && <p>Les périodes et les consommations correspondent.</p>}</> : <p>{comparaison.erreur}</p>}</div>}
  </article>;
}
