import Link from "next/link";
import { faitsManquants } from "@/lib/editeur";

export const metadata = { title: "Paramètres — Gerimmo" };

/**
 * PARAMÈTRES (26/09) : la dernière entrée du plan dessiné par le porteur.
 * Ce qui se règle une fois et se revoit rarement : l'identité de l'éditeur
 * (les huit faits exigés par les pages légales), la sécurité du compte de
 * supervision, l'ouverture d'une organisation. Rien n'est écrit ici ; chaque
 * carte mène à l'endroit où le réglage se fait.
 */
export default function PageParametres() {
  const exiges = faitsManquants({});
  const manquants = new Set(faitsManquants());
  const fournis = exiges.length - manquants.size;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-7">
      <div className="entete-page">
        <div className="min-w-0 flex-[1_1_20rem]">
          <h1>Paramètres</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--texte-secondaire)]">
            Ce qui se règle une fois : l’identité de Gerimmo sur les pages légales, la sécurité de votre compte et
            l’ouverture d’une organisation.
          </p>
        </div>
      </div>

      <section className="loc-carte">
        <div className="entete-carte">
          <h2>Identité de l’éditeur</h2>
          <span className={`puce ${manquants.size ? "puce-prep" : "puce-loue"}`}>
            {fournis} / {exiges.length} fournis
          </span>
        </div>
        <p className="text-sm text-[var(--texte-secondaire)]">
          Les mentions légales, les conditions générales et la politique de confidentialité citent ces faits. Tant
          qu’un fait manque, la page l’affiche comme « à compléter » plutôt que d’inventer une valeur.
        </p>
        <ul className="colonne-liste mt-4">
          {exiges.map((f) => (
            <li key={f} className="rang">
              <span className="first-letter:uppercase">{f}</span>
              <span className={`puce ml-auto ${manquants.has(f) ? "puce-prep" : "puce-loue"}`}>
                {manquants.has(f) ? "À fournir" : "Fourni"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[var(--texte-secondaire)]">
          Envoyez ces informations à votre développeur : elles sont écrites une seule fois, dans le code, puis
          reprises partout.{" "}
          <Link href="/mentions-legales" className="lien-discret">Voir les mentions légales →</Link>
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="loc-carte">
          <div className="entete-carte"><h2>Votre compte</h2></div>
          <p className="text-sm text-[var(--texte-secondaire)]">
            Mot de passe et second facteur du compte de supervision.
          </p>
          <Link href="/compte" className="btn-secondaire mt-4">Sécurité du compte</Link>
        </section>
        <section className="loc-carte">
          <div className="entete-carte"><h2>Organisations</h2></div>
          <p className="text-sm text-[var(--texte-secondaire)]">
            Créer l’espace d’une agence ou d’un propriétaire et inviter son premier responsable.
          </p>
          <Link href="/admin/organisations/nouvelle" className="btn-secondaire mt-4">Ouvrir une organisation</Link>
        </section>
      </div>
    </main>
  );
}
