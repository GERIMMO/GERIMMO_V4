import Link from "next/link";
import { LIBELLES_MESURES, SOURCES_DIRECTION, type FaitsDirection, type SourceDirection } from "@/lib/faits-direction";
import { formaterDateHeureParis } from "@/lib/heure-paris";

export function FaitsDeDirection({ snapshot, erreur }: { snapshot: FaitsDirection | null; erreur: boolean }) {
  return <section className="section-ecran" aria-labelledby="faits-direction">
    <h2 id="faits-direction" className="font-heading text-[length:var(--pas-section)]">Faits de direction</h2>
    <p className="mt-2 mb-4 text-sm text-muted-foreground">Préparés à la demande, sans envoi. Les montants portent sur les échéances déjà appelées ; ils ne constituent pas une prévision de trésorerie. Aucun nom de personne n’est copié : une alerte est désignée par son type et un lien vers l’organisation concernée.</p>
    {erreur ? <p role="alert" className="err">La lecture des faits est indisponible. Aucun compte n’est confirmé.</p>
      : !snapshot ? <p className="text-sm text-muted-foreground">Aucun relevé préparé pour ce jour. Utilisez « Préparer le point maintenant » pour réunir les sources.</p>
      : <><p className="mb-4 text-sm">Préparation du {formaterDateHeureParis(snapshot.genere_le)} · version {snapshot.version_regles}.</p>
        <div className="grid gap-4 md:grid-cols-2">{(Object.keys(SOURCES_DIRECTION) as SourceDirection[]).map(cle => {
          const source = snapshot.sources[cle];
          return <article className="loc-carte min-w-0" key={cle}>
            <h3 className="font-semibold">{SOURCES_DIRECTION[cle]}</h3>
            {source.statut === "indisponible" && <p role="alert" className="err mt-2">Source indisponible. {source.donnees ? "Dernier état connu conservé ci-dessous." : "Aucun état connu ; ce n’est pas un zéro."}</p>}
            {source.observe_le && <p className="mt-1 text-xs text-muted-foreground">Observé le {formaterDateHeureParis(source.observe_le)}</p>}
            {source.donnees && <>
              <dl className="my-3 space-y-2 text-sm">{Object.entries(source.donnees.mesures).map(([nom, nombre]) => <div key={nom} className="flex justify-between gap-3"><dt>{LIBELLES_MESURES[nom] ?? nom}</dt><dd className="shrink-0 font-semibold">{nom.endsWith("_eur") ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(nombre) : nombre.toLocaleString("fr-FR")}</dd></div>)}</dl>
              {source.donnees.faits.length > 0 && <details><summary className="cursor-pointer text-sm">Dossiers concernés (20 au plus)</summary><ul className="mt-2 space-y-2 text-sm">{source.donnees.faits.map((fait, i) => <li key={i}><Link className="lien-discret break-words" href={fait.href}>{fait.titre}</Link>{fait.date && <span className="ml-2 text-xs text-muted-foreground">{new Date(fait.date).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>}</li>)}</ul></details>}
            </>}
          </article>;
        })}</div>
      </>}
  </section>;
}
