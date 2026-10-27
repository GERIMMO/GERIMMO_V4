"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { preparerSoumission, confirmerSoumission, saisiesModifiees, MESSAGE_QUITTER } from "@/lib/protection-saisie";
import { useRouter } from "next/navigation";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { modifierDureeConservation } from "@/app/actions/retention";
import { dureeConservation, effetConservation, type RegleConservation } from "@/lib/conservation-reglages";

function EditionDuree({ regle, fermer }: { regle: RegleConservation; fermer: () => void }) {
  const formulaire = useRef<HTMLFormElement>(null);
  useEffect(() => { formulaire.current?.scrollIntoView({ block: "start" }); formulaire.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); }, []);
  const [mois, setMois] = useState(String(regle.duree_mois));
  const [motif, setMotif] = useState("");
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const nouvelle = Number(mois);
  const valide = /^\d+$/.test(mois) && nouvelle >= regle.minimum_mois && nouvelle <= 240 && nouvelle !== regle.duree_mois;
  return <form ref={formulaire} data-saisie-confirmee className="loc-carte scroll-mt-24 space-y-4 border-2 border-blue-200" aria-label={`Modifier ${regle.libelle}`} onSubmit={e => {
    e.preventDefault(); const donnees = new FormData(e.currentTarget); preparerSoumission(e.currentTarget, donnees); setErreur(""); setMessage("");
    startTransition(async () => {
      try {
        const r = await modifierDureeConservation({ categorie: regle.data_type, mois: nouvelle, revision: regle.revision, motif, confirme });
        if (r.erreur) { setErreur(r.erreur); return; }
        confirmerSoumission(donnees);
        setMessage("Durée enregistrée. Aucun nettoyage n’a été lancé."); router.refresh();
      } catch { setErreur("Enregistrement non confirmé. Rechargez la page avant de réessayer."); }
    });
  }}>
    <h2>{regle.libelle}</h2>
    <p className="text-sm text-muted-foreground">À partir de : {regle.declencheur}.</p>
    <label className="block space-y-1"><span>Nouvelle durée en mois</span><input className="w-full rounded-md border p-2 sm:max-w-48" name="mois" type="number" min={regle.minimum_mois} max={240} step={1} value={mois} onChange={e => { setMois(e.target.value); setConfirme(false); setMessage(""); }} required disabled={pending}/></label>
    <p className="text-sm text-muted-foreground">Minimum : {regle.minimum_mois} mois · Maximum : 240 mois. Certaines catégories, dont les archives de factures et de contrats, ont un minimum protégé.</p>
    <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950"><p className="font-medium">{valide ? `${dureeConservation(regle.duree_mois)} → ${dureeConservation(nouvelle)}` : `Durée actuelle : ${dureeConservation(regle.duree_mois)}`}</p><p className="mt-1">{effetConservation(regle)}</p>{valide && nouvelle < regle.duree_mois && regle.actif && !regle.data_type.startsWith("archive:") && <p className="mt-2 font-medium">Une durée plus courte peut rendre des données éligibles au prochain nettoyage automatique.</p>}</div>
    <label className="block space-y-1"><span>Raison du changement</span><textarea name="motif" className="w-full rounded-md border p-2" minLength={10} maxLength={1000} rows={3} value={motif} onChange={e => setMotif(e.target.value)} required disabled={pending}/></label>
    <label className="flex items-start gap-2 text-sm"><input name="confirme" type="checkbox" className="mt-1" checked={confirme} onChange={e => setConfirme(e.target.checked)} disabled={pending}/><span>Je valide cette durée et son effet. Elle sera également visible dans la politique de confidentialité ; les conditions archivées resteront intactes.</span></label>
    {erreur && <p role="alert" className="err">{erreur}</p>}{message && <p role="status" className="text-green-800">{message}</p>}
    <div className="flex flex-wrap gap-3"><BoutonEnvoi className="btn-primaire" enCours={pending} enCoursTexte="Enregistrement…" disabled={!valide || motif.trim().length < 10 || !confirme}>Enregistrer la durée</BoutonEnvoi><button className="btn-secondaire" type="button" onClick={fermer} disabled={pending}>Fermer</button></div>
  </form>;
}

export function ReglagesConservation({ regles }: { regles: RegleConservation[] }) {
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<string | null>(null);
  const choisir = (categorie: string | null) => {
    if (saisiesModifiees().length && !window.confirm(MESSAGE_QUITTER)) return;
    setSelection(categorie);
  };
  const filtre = recherche.toLocaleLowerCase("fr").normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const visibles = regles.filter(r => `${r.libelle} ${r.declencheur}`.toLocaleLowerCase("fr").normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(filtre));
  const totalPages = Math.max(1, Math.ceil(visibles.length / 6));
  const pageCourante = Math.min(page, totalPages);
  const debut = (pageCourante - 1) * 6;
  const regle = regles.find(r => r.data_type === selection);
  return <div className="space-y-4">
    {regle && <EditionDuree key={regle.data_type} regle={regle} fermer={() => choisir(null)} />}
    <label className="block space-y-1"><span>Rechercher une catégorie</span><input type="search" className="w-full rounded-md border p-3" value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }} placeholder="Factures, bail, compte…"/></label>
    <p className="text-sm text-muted-foreground" role="status">{visibles.length ? `${debut + 1}–${Math.min(debut + 6, visibles.length)} sur ${visibles.length} catégories` : "Aucune catégorie trouvée"}</p>
    <ul aria-label="Catégories de conservation" className="divide-y rounded-xl border bg-white">{visibles.slice(debut, debut + 6).map(r => <li key={r.data_type} className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 flex-1 basis-52"><h2 className="text-base font-medium">{r.libelle}</h2><p className="text-sm text-muted-foreground">{r.declencheur}</p><p className="mt-1 text-xs">{r.actif ? "Nettoyage actif" : "Nettoyage désactivé"}</p></div>
      <strong className="text-blue-800">{dureeConservation(r.duree_mois)}</strong><button className="btn-secondaire" onClick={() => choisir(r.data_type)} disabled={!!selection && selection !== r.data_type} aria-label={`Modifier ${r.libelle}`}>Modifier</button>
    </li>)}</ul>
    {totalPages > 1 && <nav aria-label="Pages des catégories" className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className="btn-secondaire" disabled={pageCourante === 1} onClick={() => setPage(pageCourante - 1)}>Précédente</button>
      <span className="text-sm">Page {pageCourante} sur {totalPages}</span>
      <button type="button" className="btn-secondaire" disabled={pageCourante === totalPages} onClick={() => setPage(pageCourante + 1)}>Suivante</button>
    </nav>}
    <p className="text-xs text-muted-foreground">Modifier une durée n’active pas une règle désactivée.</p>
    {!visibles.length && <p>Aucune catégorie ne correspond à la recherche.</p>}
  </div>;
}
