import { ConsoleSection } from "@/components/console-section";
import { lireEditeur } from "@/lib/editeur-serveur";
import {createClient} from "@/lib/supabase/server";
import {IdentiteEditeur} from "./identite";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { defautsVendeur, faitsACompleter, faitsManquants } from "@/lib/editeur";
import { lireReglageSouscription } from "@/lib/reglage-souscription-serveur";
import { BlocageSouscription, OuvertureVentes } from "./blocage-souscription";
import { InterrupteurIA } from "./interrupteur-ia";
import { etatIA, motifIANonConnectee } from "@/lib/etat-ia";
import { EnvoisAutomatiques } from "./envois-automatiques";
import { envoisOuverts, FLUX_ENVOIS_AUTOMATIQUES, type AccordsEspaces, type EtatEnvoisAutomatiques } from "@/lib/envois-suspendus";
import { ReperesFiscauxReglage } from "./reperes-fiscaux";
import { chargerReperesFiscaux, libelleVerification } from "@/lib/reperes-fiscaux";
import { aujourdhuiParis } from "@/lib/ged";

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
  // Interrupteur IA (22/11/2026) : le réglage n'est lisible que par le superviseur permanent ; l'état constaté par
  // les écrans (`ia_disponible`), lui, l'est par tout compte connecté.
  const reglageIA = await db.from("ia_plafond_reglage").select("ia_active").eq("singleton", true).maybeSingle();
  const iaActive = reglageIA.error || !reglageIA.data ? null : reglageIA.data.ia_active === true;
  const etatDeLIA = await etatIA(db);
  // Envois automatiques (audit palier 1, P1-08) : quatre interrupteurs, fermés à la livraison. Illisible = on n'affiche
  // aucun bouton plutôt qu'un état supposé.
  const reglageEnvois = await db.rpc("lire_envois_automatiques");
  const lu = reglageEnvois.error || !reglageEnvois.data || typeof reglageEnvois.data !== "object" ? null : reglageEnvois.data as Record<string, unknown>;
  const etatEnvois: EtatEnvoisAutomatiques | null = lu && FLUX_ENVOIS_AUTOMATIQUES.every((f) => typeof lu[f] === "boolean")
    ? Object.fromEntries(FLUX_ENVOIS_AUTOMATIQUES.map((f) => [f, lu[f] === true])) as EtatEnvoisAutomatiques
    : null;
  const nbEnvoisOuverts = envoisOuverts(etatEnvois);
  const compte = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const accordsEspaces: AccordsEspaces = { avis_echeance: compte(lu?.espaces_avis_echeance), relance_loyer: compte(lu?.espaces_relance_loyer) };
  // Repères fiscaux (audit palier 1, P2-09) : plafond et abattement du micro-foncier cités par l'aide du récapitulatif
  // fiscal. Illisible = aucun formulaire, et l'aide des propriétaires ne cite alors aucune valeur.
  const reperesFiscaux = await chargerReperesFiscaux(db);
  const jourDeParis = aujourdhuiParis();
  const requis = faitsManquants({});
  const manquants = new Set(faitsManquants(editeur));
  // Le médiateur se complète à part : il ne ferme que la première souscription d'un particulier (lib/editeur.ts, A_COMPLETER).
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
            Coordonnées publiques de Gerimmo, ouverture des abonnements, fonctions assistées par l’IA, envois
            automatiques d’e-mails et repères fiscaux affichés aux propriétaires.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="État des paramètres">
        <a className="loc-carte" href="#identite"><strong className="block">Identité de Gerimmo ↓</strong><span className="text-sm text-muted-foreground">{indisponible ? 'Lecture indisponible' : `${fournis} / ${exiges.length} fournis`}</span></a>
        <a className="loc-carte" href="#souscriptions"><strong className="block">Abonnements ↓</strong><span className="text-sm text-muted-foreground">Vérifier la règle d’ouverture</span></a>
        <a className="loc-carte" href="#ia"><strong className="block">Fonctions assistées par l’IA ↓</strong><span className="text-sm text-muted-foreground">{iaActive === null ? 'État indisponible' : iaActive ? 'Activée' : 'Désactivée'}</span></a>
        <a className="loc-carte" href="#envois-automatiques"><strong className="block">Envois automatiques ↓</strong><span className="text-sm text-muted-foreground">{nbEnvoisOuverts === null ? 'État indisponible' : nbEnvoisOuverts === 0 ? 'Tous fermés' : `${nbEnvoisOuverts} ouvert${nbEnvoisOuverts > 1 ? 's' : ''} sur ${FLUX_ENVOIS_AUTOMATIQUES.length}`}</span></a>
        <a className="loc-carte" href="#reperes-fiscaux"><strong className="block">Repères fiscaux ↓</strong><span className="text-sm text-muted-foreground">{libelleVerification(reperesFiscaux, jourDeParis)}</span></a>
        <Link className="loc-carte" href="/admin/conservation"><strong className="block">Conservation</strong><span className="text-sm text-muted-foreground">Régler les durées par catégorie →</span></Link>
      </div>

      <section id="identite" className="scroll-mt-24">
        {indisponible||config.error||!config.data ? <p role="alert" className="err">Paramètres indisponibles. Rechargez avant de modifier.</p> : <IdentiteEditeur valeurs={editeur} revision={config.data.revision}/>}
        <Link className="lien-discret mt-4 inline-flex" href="/admin/journaux?registre=supervision_identite">Historique des modifications →</Link>
      </section>

      <ConsoleSection id="souscriptions" titre="Ouverture des abonnements" description="Ouverture des ventes, et règle de blocage tant que l’identité du vendeur est incomplète ou que le médiateur de la consommation manque." icone="securite" ton="ambre" statut={indisponible || regle.revision === null ? "Lecture indisponible" : manquants.size ? `${manquants.size} à fournir` : 'Identité requise complète'}>
        <OuvertureVentes ouvertes={regle.ventesOuvertes} revision={regle.revision} />
        <BlocageSouscription actif={regle.blocageIdentiteActif} revision={regle.revision} manquants={defautsVendeur(editeur)} aCompleter={[...aCompleter]} />
      </ConsoleSection>

      <section id="ia" className="scroll-mt-24">
        <InterrupteurIA active={iaActive} etat={etatDeLIA} motif={motifIANonConnectee()} />
      </section>

      <section id="envois-automatiques" className="scroll-mt-24">
        <EnvoisAutomatiques etat={etatEnvois} accords={accordsEspaces} />
      </section>

      <section id="reperes-fiscaux" className="scroll-mt-24">
        <ReperesFiscauxReglage reperes={reperesFiscaux} aujourdHui={jourDeParis} />
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
