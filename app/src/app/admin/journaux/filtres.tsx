import Link from "next/link";

// Les filtres et la pagination des journaux (25/09) — des composants serveur :
// un formulaire GET et des liens, pour que l'adresse porte l'état et se partage.

export type FiltresJournaux = { type: string; org: string; depuis: string; jusqu: string };
type Pages = { audit: number; technique: number; acces: number };

const champ = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function FiltresJournaux({
  filtres,
  organisations,
  codes,
}: {
  filtres: FiltresJournaux;
  organisations: { id: string; name: string }[];
  codes: { audit: string[]; technique: string[] };
}) {
  const actif = Boolean(filtres.type || filtres.org || filtres.depuis || filtres.jusqu);
  return (
    <form method="get" className="loc-carte mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtrer les journaux">
      <label className="grid gap-1">
        <span className="libelle-champ">Type d&apos;événement</span>
        <input className={champ} name="type" list="codes-journaux" defaultValue={filtres.type} maxLength={60} placeholder="Ex. tache_, traversee, erreur" />
        <datalist id="codes-journaux">
          {[...codes.technique, ...codes.audit].map((c) => <option key={c} value={c} />)}
        </datalist>
      </label>
      <label className="grid gap-1">
        <span className="libelle-champ">Organisation</span>
        <select className={champ} name="org" defaultValue={filtres.org}>
          <option value="">Toutes</option>
          {organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="libelle-champ">Depuis le</span>
        <input className={champ} type="date" name="depuis" defaultValue={filtres.depuis} />
      </label>
      <label className="grid gap-1">
        <span className="libelle-champ">Jusqu&apos;au</span>
        <input className={champ} type="date" name="jusqu" defaultValue={filtres.jusqu} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <button type="submit" className="btn-or">Filtrer</button>
        {actif && <Link href="/admin/journaux" className="btn-secondaire">Effacer</Link>}
      </div>
    </form>
  );
}

/** L'adresse d'une page d'un journal, les autres filtres et pages conservés. */
export function adressePage(cle: keyof Pages, n: number, filtres: FiltresJournaux, pages: Pages): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtres)) if (v) q.set(k, v);
  const suivantes = { ...pages, [cle]: n };
  for (const [k, v] of Object.entries(suivantes)) if (v > 1) q.set(`p_${k}`, String(v));
  const chaine = q.toString();
  return `/admin/journaux${chaine ? `?${chaine}` : ""}`;
}

export function PagesJournal({
  cle,
  page,
  suite,
  filtres,
  pages,
}: {
  cle: "p_audit" | "p_technique" | "p_acces";
  page: number;
  suite: boolean;
  filtres: FiltresJournaux;
  pages: Pages;
}) {
  if (page === 1 && !suite) return null;
  const journal = cle.slice("p_".length) as keyof Pages;
  return (
    <nav aria-label="Pages du journal" className="mt-3 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? <Link href={adressePage(journal, page - 1, filtres, pages)} className="underline">Précédent</Link> : <span />}
      <span className="text-muted-foreground">Page {page}</span>
      {suite ? <Link href={adressePage(journal, page + 1, filtres, pages)} className="underline">Suivant</Link> : <span />}
    </nav>
  );
}
