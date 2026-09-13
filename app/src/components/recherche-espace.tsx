"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight, Building2, Users, FileText, X, LoaderCircle } from "lucide-react";
import { rechercherDansEspace } from "@/app/actions/recherche-espace";
import { normaliserRecherche, type ReponseRecherche } from "@/lib/recherche-espace";

export function RechercheEspace({ orgId }: { orgId: string }) {
  const [ouverte, ouvrir] = useState(false);
  useEffect(() => {
    const raccourci = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !document.querySelector('[role="dialog"], dialog[open]')) {
        event.preventDefault();
        ouvrir(true);
      }
    };
    window.addEventListener("keydown", raccourci);
    return () => window.removeEventListener("keydown", raccourci);
  }, []);
  return <>
    <button type="button" className="recherche-ouvrir" onClick={() => ouvrir(true)} aria-haspopup="dialog" aria-label="Rechercher un logement, une personne ou un bail">
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span>Rechercher<span className="hidden lg:inline"> un logement, une personne…</span></span>
      <kbd className="hidden sm:inline">⌘ / Ctrl K</kbd>
    </button>
    {ouverte && <FenetreRecherche key={orgId} orgId={orgId} fermer={() => ouvrir(false)} />}
  </>;
}

function FenetreRecherche({ orgId, fermer }: { orgId: string; fermer: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const [saisie, saisir] = useState("");
  const [tentative, recommencer] = useState(0);
  const [reponse, afficher] = useState<{ texte: string; tentative: number; contenu: ReponseRecherche } | null>(null);
  const texte = normaliserRecherche(saisie);
  const resultat = reponse?.texte === texte && reponse.tentative === tentative ? reponse.contenu : null;
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
      rechercherDansEspace(orgId, texte)
        .then((contenu) => { if (!abandon) afficher({ texte, tentative, contenu }); })
        .catch(() => { if (!abandon) afficher({ texte, tentative, contenu: { resultats: [], erreur: "La recherche n’a pas abouti. Vérifiez votre connexion et réessayez." } }); });
    }, 250);
    return () => { abandon = true; clearTimeout(timer); };
  }, [orgId, texte, tentative]);

  const base = `/agence/${orgId}`;
  return <dialog ref={dialog} className="recherche-dialog" aria-labelledby="recherche-titre" onCancel={(e) => { e.preventDefault(); fermer(); }} onClick={(e) => { if (e.target === dialog.current) fermer(); }}>
    <div className="recherche-corps">
      <header className="recherche-entete">
        <div><p className="eyebrow">Votre espace de gestion</p><h2 id="recherche-titre">Retrouvez le bon dossier</h2></div>
        <button type="button" onClick={fermer} className="recherche-fermer" aria-label="Fermer la recherche"><X className="size-5" /></button>
      </header>
      <div className="recherche-champ">
        <Search className="size-5 shrink-0" aria-hidden="true" />
        <input ref={champ} value={saisie} onChange={(e) => saisir(e.target.value)} maxLength={80} autoComplete="off" aria-label="Nom, adresse ou e-mail" placeholder="Nom, adresse ou e-mail…" aria-describedby="recherche-aide" onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); dialog.current?.querySelector<HTMLAnchorElement>("[data-resultat]")?.focus(); }
        }} />
        {saisie && <button type="button" className="recherche-fermer" aria-label="Effacer la recherche" onClick={() => { saisir(""); champ.current?.focus(); }}><X className="size-4" /></button>}
      </div>
      <div className="recherche-resultats" aria-busy={chargement}>
        <p id="recherche-aide" className="text-sm text-muted-foreground">{texte.length < 2 ? "Saisissez au moins 2 caractères, ou accédez directement à une rubrique." : "Les résultats sont limités à vos accès dans cet espace."}</p>
        {chargement && <p role="status" className="flex items-center gap-2 py-5 text-sm"><LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />Recherche en cours…</p>}
        {resultat?.erreur && <div role="alert" className="err mt-3"><p>{resultat.erreur}</p><button type="button" className="mt-2 underline" onClick={() => recommencer((n) => n + 1)}>Réessayer</button></div>}
        {texte.length >= 2 && resultat && !resultat.erreur && resultat.resultats.length === 0 && <p role="status" className="py-5">Aucun dossier trouvé. Essayez un nom, une ville ou une adresse e-mail.</p>}
        {resultat && <ul className="mt-3 divide-y divide-border" onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const liens = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("[data-resultat]"));
          const courant = liens.indexOf(document.activeElement as HTMLAnchorElement);
          e.preventDefault();
          const suivant = courant + (e.key === "ArrowDown" ? 1 : -1);
          if (suivant < 0) champ.current?.focus(); else liens[Math.min(suivant, liens.length - 1)]?.focus();
        }}>{resultat.resultats.map((r) => {
          const Icone = r.type === "Logement" ? Building2 : r.type === "Personne" ? Users : FileText;
          return <li key={`${r.type}-${r.id}`}><Link href={r.href} prefetch={false} onClick={fermer} data-resultat className="recherche-resultat">
            <span className="recherche-icone"><Icone className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="eyebrow">{r.type}</span><strong className="block font-medium">{r.titre}</strong><span className="block break-words text-sm text-muted-foreground">{r.detail}</span></span>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
          </Link></li>;
        })}</ul>}
        {texte.length < 2 && <div className="recherche-raccourcis">
          {[{ href: `${base}/parc`, titre: "Logements", detail: "Ouvrir une fiche et ses documents", Icone: Building2 }, { href: `${base}/personnes`, titre: "Personnes", detail: "Retrouver un contact ou son dossier", Icone: Users }, { href: `${base}/alertes`, titre: "À traiter", detail: "Voir vos prochaines actions", Icone: FileText }].map(({ href, titre, detail, Icone }) => <Link key={href} href={href} onClick={fermer} className="recherche-resultat"><Icone className="size-5 shrink-0" aria-hidden="true" /><span><strong className="block font-medium">{titre}</strong><span className="text-sm text-muted-foreground">{detail}</span></span><ArrowUpRight className="ml-auto size-4" aria-hidden="true" /></Link>)}
        </div>}
      </div>
      <footer className="recherche-pied">↑ ↓ pour parcourir · Entrée pour ouvrir · Échap pour fermer</footer>
    </div>
  </dialog>;
}
