"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Building2, LoaderCircle, Search, UserRound, Wrench, X } from "lucide-react";
import {
  rechercherDansSupervision,
  type ReponseRechercheSupervision,
} from "@/app/actions/recherche-supervision";
import { normaliserRecherche } from "@/lib/recherche-espace";

// `masquerSousMobile` (25/09, audit C26) : dans la console, le bouton quitte la
// barre haute au téléphone ; le menu envoie l'événement `gerimmo:ouvrir-recherche`
// et la fenêtre s'ouvre ici — une seule fenêtre, un seul raccourci clavier.
export function RechercheSupervision({ masquerSousMobile = false }: { masquerSousMobile?: boolean }) {
  const [ouverte, ouvrir] = useState(false);
  useEffect(() => {
    const raccourci = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !document.querySelector('[role="dialog"], dialog[open]')) {
        event.preventDefault();
        ouvrir(true);
      }
    };
    const depuisLeMenu = () => ouvrir(true);
    window.addEventListener("keydown", raccourci);
    window.addEventListener("gerimmo:ouvrir-recherche", depuisLeMenu);
    return () => { window.removeEventListener("keydown", raccourci); window.removeEventListener("gerimmo:ouvrir-recherche", depuisLeMenu); };
  }, []);
  return <>
    <button type="button" className={`recherche-ouvrir${masquerSousMobile ? " max-[640px]:hidden!" : ""}`} onClick={() => ouvrir(true)} aria-haspopup="dialog" aria-label="Rechercher une agence, un propriétaire ou un artisan">
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span>Rechercher<span className="hidden xl:inline"> un client…</span></span>
      <kbd className="hidden 2xl:inline">⌘ / Ctrl K</kbd>
    </button>
    {ouverte && <FenetreRecherche fermer={() => ouvrir(false)} />}
  </>;
}

function FenetreRecherche({ fermer }: { fermer: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const [saisie, saisir] = useState("");
  const [tentative, recommencer] = useState(0);
  const [reponse, afficher] = useState<{ texte: string; tentative: number; contenu: ReponseRechercheSupervision } | null>(null);
  // Le résultat en surbrillance (audit console 27/09) : ↑ ↓ pour choisir,
  // Entrée ouvre — le premier par défaut, comme le promet le pied.
  const [choix, choisir] = useState<{ texte: string; index: number }>({ texte: "", index: 0 });
  const router = useRouter();
  const texte = normaliserRecherche(saisie);
  const resultat = reponse?.texte === texte && reponse.tentative === tentative ? reponse.contenu : null;
  const liste = resultat?.resultats ?? [];
  const actif = liste.length === 0 ? -1 : choix.texte === texte ? Math.min(choix.index, liste.length - 1) : 0;
  const clavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (liste.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const pas = e.key === "ArrowDown" ? 1 : -1;
      choisir({ texte, index: (Math.max(actif, 0) + pas + liste.length) % liste.length });
    } else if (e.key === "Enter" && actif >= 0) {
      e.preventDefault();
      router.push(liste[actif].href);
      fermer();
    }
  };
  const chargement = texte.length >= 2 && !resultat;

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    champ.current?.focus();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (texte.length < 2) return;
    let abandon = false;
    const timer = setTimeout(() => {
      rechercherDansSupervision(texte)
        .then((contenu) => { if (!abandon) afficher({ texte, tentative, contenu }); })
        .catch(() => { if (!abandon) afficher({ texte, tentative, contenu: { resultats: [], erreur: "La recherche n’a pas abouti. Réessayez." } }); });
    }, 250);
    return () => { abandon = true; clearTimeout(timer); };
  }, [texte, tentative]);

  return <dialog ref={dialog} className="recherche-dialog" aria-labelledby="recherche-supervision-titre" onCancel={(e) => { e.preventDefault(); fermer(); }} onClick={(e) => { if (e.target === dialog.current) fermer(); }}>
    <div className="recherche-corps">
      <header className="recherche-entete">
        <div><p className="eyebrow">Supervision Gerimmo</p><h2 id="recherche-supervision-titre">Retrouvez un client</h2></div>
        <button type="button" onClick={fermer} className="recherche-fermer" aria-label="Fermer la recherche"><X className="size-5" /></button>
      </header>
      <div className="recherche-champ">
        <Search className="size-5 shrink-0" aria-hidden="true" />
        <input ref={champ} value={saisie} onChange={(e) => saisir(e.target.value)} onKeyDown={clavier} maxLength={80} autoComplete="off" role="combobox" aria-expanded={liste.length > 0} aria-controls="recherche-supervision-liste" aria-activedescendant={actif >= 0 ? `recherche-resultat-${actif}` : undefined} aria-label="Nom, ville, email ou SIRET" placeholder="Nom, ville, email ou SIRET…" aria-describedby="recherche-supervision-aide" />
        {saisie && <button type="button" className="recherche-fermer" aria-label="Effacer la recherche" onClick={() => { saisir(""); champ.current?.focus(); }}><X className="size-4" /></button>}
      </div>
      <div className="recherche-resultats" aria-busy={chargement}>
        <p id="recherche-supervision-aide" className="text-sm text-muted-foreground">{texte.length < 2 ? "Saisissez au moins 2 caractères." : "Agences, propriétaires directs, artisans inscrits et comptes (par adresse)."}</p>
        {chargement && <p role="status" className="flex items-center gap-2 py-5 text-sm"><LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />Recherche en cours…</p>}
        {resultat?.erreur && <div role="alert" className="err mt-3"><p>{resultat.erreur}</p><button type="button" className="mt-2 underline" onClick={() => recommencer((n) => n + 1)}>Réessayer</button></div>}
        {texte.length >= 2 && resultat && !resultat.erreur && resultat.resultats.length === 0 && <p role="status" className="py-5">Aucun client trouvé.</p>}
        {resultat && <ul id="recherche-supervision-liste" role="listbox" aria-label="Résultats" className="mt-3 divide-y divide-border">{resultat.resultats.map((r, i) => {
          const Icone = r.type === "Organisation" ? Building2 : r.type === "Compte" ? UserRound : Wrench;
          return <li key={`${r.type}-${r.id}`} id={`recherche-resultat-${i}`} role="option" aria-selected={i === actif}><Link href={r.href} prefetch={false} onClick={fermer} onMouseEnter={() => choisir({ texte, index: i })} data-resultat data-actif={i === actif ? "" : undefined} className={`recherche-resultat${i === actif ? " bg-[var(--survol)]" : ""}`}>
            <span className="recherche-icone"><Icone className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="eyebrow">{r.type}</span><strong className="block font-medium">{r.titre}</strong><span className="block break-words text-sm text-muted-foreground">{r.detail}</span></span>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
          </Link></li>;
        })}</ul>}
        {texte.length < 2 && <div className="recherche-raccourcis"><Link href="/admin/clients" onClick={fermer} className="recherche-resultat"><Building2 className="size-5 shrink-0" aria-hidden="true" /><span><strong className="block font-medium">Tous les clients</strong><span className="text-sm text-muted-foreground">Agences, propriétaires et artisans</span></span><ArrowUpRight className="ml-auto size-4" aria-hidden="true" /></Link></div>}
      </div>
      <footer className="recherche-pied">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</footer>
    </div>
  </dialog>;
}
