import { ConsoleSection } from "@/components/console-section";
import { lireEditeur } from "@/lib/editeur-serveur";
import {createClient} from "@/lib/supabase/server";
import {IdentiteEditeur} from "./identite";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { faitsACompleter, faitsManquants } from "@/lib/editeur";
import { lireReglageSouscription } from "@/lib/reglage-souscription-serveur";
import { BlocageSouscription } from "./blocage-souscription";

export const metadata = { title: "Paramètres généraux" };

/**
 * PARAMÈTRES (26/09) : la dernière entrée du plan dessiné par le porteur.
 * Ce qui se règle une fois et se revoit rarement : l'identité de l'éditeur
 * (les huit faits exigés par les pages légales), la sécurité du compte de
 * supervision, l'ouverture d'une organisation. Les coordonnées publiques sont versionnées ici ; les accès gardent leurs
 * procédures de contrôle dédiées.
 */
export default async function PageParametres() {
  const {editeur,indisponible}=await lireEditeur();
  const regle=await lireReglageSouscription();
  const db=await createClient();
  const config=await db.from("supervision_identite").select("revision").eq("singleton",true).maybeSingle();
  const requis = faitsManquants({});
  const manquants = new Set(faitsManquants(editeur));
  // 23/10 : le médiateur se complète plus tard, sans fermer le paiement (lib/editeur.ts, A_COMPLETER).
  const nonBloquants = faitsACompleter({});
  const aCompleter = new Set(faitsACompleter(editeur));
  const exiges = [...requis, ...nonBloquants];
  const fournis = exiges.length - manquants.size - aCompleter.size;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-7">
      <div className="entete-page">
        <div className="min-w-0 flex-[1_1_20rem]">
          <TitreEcran rubrique="profil">Paramètres généraux</TitreEcran>
          <p className="mt-2 max-w-3xl text-sm text-[var(--texte-secondaire)]">
            Coordonnées publiques, abonnements et conservation des données.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="État des paramètres">
        <a className="loc-carte" href="#identite"><strong className="block">Identité de Gerimmo</strong><span className="text-sm text-muted-foreground">{indisponible ? 'Lecture indisponible' : `${fournis} / ${exiges.length} fournis`}</span></a>
        <a className="loc-carte" href="#souscriptions"><strong className="block">Abonnements</strong><span className="text-sm text-muted-foreground">Vérifier la règle d’ouverture</span></a>
        <Link className="loc-carte" href="/admin/conservation"><strong className="block">Conservation</strong><span className="text-sm text-muted-foreground">Régler les durées par catégorie →</span></Link>
      </div>

      <section id="identite" className="scroll-mt-24">
        {indisponible||config.error||!config.data ? <p role="alert" className="err">Paramètres indisponibles. Rechargez avant de modifier.</p> : <IdentiteEditeur valeurs={editeur} revision={config.data.revision}/>}
        <Link className="lien-discret mt-4 inline-block" href="/admin/journaux?registre=supervision_identite">Historique des modifications →</Link>
      </section>

      <ConsoleSection id="souscriptions" titre="Ouverture des abonnements" description="Règle de blocage si l’identité de Gerimmo est incomplète." icone="securite" ton="ambre" statut={indisponible || regle.revision === null ? "Lecture indisponible" : manquants.size ? `${manquants.size} à fournir` : 'Identité requise complète'}>
        <BlocageSouscription actif={regle.blocageIdentiteActif} revision={regle.revision} manquants={[...manquants]} aCompleter={[...aCompleter]} />
      </ConsoleSection>

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
