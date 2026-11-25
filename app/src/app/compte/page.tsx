import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nomMarque, styleMarque } from "@/lib/marque-organisation";
import { formaterDateHeure } from "@/lib/ged";
import { FormulaireMotDePasse } from "./formulaire-mot-de-passe";
import { SecondFacteur } from "./second-facteur";
import { ConditionsAcceptees } from "./conditions-acceptees";
import { identiteContactLocataire, interlocuteurDeLIdentite } from "@/lib/identite-contact-locataire";
// Phase 3, lot 61 : l'en-tête et les lectures du compte servent aussi à /compte/donnees (même bandeau, même renvoi vers
// l'interlocuteur de la location) ; ils vivent dans bandeau-compte.tsx.
import {
  BandeauCompte,
  RenvoiDonneesLocation,
  lireContactCompteLocataire,
  lireEspaceLocataire,
  lireMarqueLocataire,
  LIEN_CONFIDENTIALITE,
} from "./bandeau-compte";

export async function generateMetadata(): Promise<Metadata> {
  const marque = await lireMarqueLocataire();
  return { title: marque ? `Sécurité du compte — ${nomMarque(marque)}` : "Sécurité du compte — Gerimmo" };
}

/**
 * SÉCURITÉ DU COMPTE — l'écran qui manquait (19/09).
 *
 * Un utilisateur connecté ne pouvait NI changer son mot de passe (seul chemin :
 * « Mot de passe oublié », donc un email), NI remplacer son second facteur
 * (aucun chemin du tout). Les deux gestes sont ici, dans le compte, là où on
 * les cherche.
 *
 * CE N'EST PAS `/securite`, ET LES DEUX RESTENT. `/securite` est le SAS de la
 * supervision : le proxy y envoie le super admin tant que sa session n'est pas
 * en aal2, et cette page-là doit rester atteignable AVANT vérification. Celle-ci
 * est derrière la vérification, pour tout le monde, et sert à entretenir son
 * compte plutôt qu'à ouvrir une porte.
 */
export default async function PageCompte() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Le second facteur est obligatoire pour la supervision seulement : le dire
  // change le ton de la carte, pas les gestes qu'elle propose.
  const { data: supervision } = await supabase
    .from("memberships")
    .select("id")
    .eq("account_id", user.id)
    .eq("role", "super_admin")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const marque = await lireMarqueLocataire();
  // Audit 27/09 : l'artisan n'a pas de « gestionnaire », et la barre de son
  // portail disparaît ici. On lui parle de sa situation, et on lui rend le
  // chemin de son portail.
  const { data: ficheArtisan } = await supabase.rpc("mon_artisan");
  const estArtisan = ((ficheArtisan ?? []) as unknown[]).length > 0;
  const espaceLocataire = await lireEspaceLocataire();
  const contactLocataire = await lireContactCompteLocataire();
  // « votre gestionnaire » / « votre bailleur » pour une seule adhésion de locataire ; pour plusieurs, ou des adhésions
  // illisibles, la tournure de l'écran des espaces (« votre bailleur ou son gestionnaire »), vraie dans les deux cas.
  const quiLocataire = contactLocataire
    ? contactLocataire.identite
      ? `votre ${interlocuteurDeLIdentite(contactLocataire.identite)}`
      : "votre bailleur ou à son gestionnaire"
    : null;
  // L'espace unique du locataire : son titre et son interlocuteur viennent de la même identité (illisible : « bailleur »).
  const identiteEspace = contactLocataire?.identite ?? identiteContactLocataire(null);

  return (
    <div className="flex min-h-full flex-1 flex-col" style={styleMarque(marque)}>
      <BandeauCompte compteId={user.id} marque={marque} estArtisan={estArtisan} espaceLocataire={espaceLocataire} />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4 sm:p-7">
        <div>
          <p className="eyebrow mb-1.5">Votre compte</p>
          <h1 className="mb-6">Sécurité du compte</h1>
        </div>

        <div className="loc-carte">
          <div className="entete-carte">
            <h2 className="titre-carte leading-[inherit]">Identifiants</h2>
          </div>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div className="ligne-info">
              <dt className="text-muted-foreground">Adresse de connexion</dt>
              {/* Lot 61 (E135) : `break-all` coupait l'adresse au milieu d'un mot (« examp / le.com ») alors que la carte
                  avait la place ; la coupure n'intervient plus que si un mot ne tient vraiment pas sur la ligne. */}
              <dd className="font-medium [overflow-wrap:anywhere]">{user.email}</dd>
            </div>
            <div className="ligne-info">
              <dt className="text-muted-foreground">Dernière connexion</dt>
              <dd className="font-medium">{formaterDateHeure(user.last_sign_in_at)}</dd>
            </div>
          </dl>
          <p className="mesure-lecture mt-3 text-sm text-muted-foreground">
            {estArtisan
              ? "L’adresse de connexion ne se change pas depuis cet écran : elle identifie votre compte auprès de tous vos clients. Pour la modifier, écrivez-nous depuis Aide et retours."
              : `L’adresse de connexion ne se change pas depuis cet écran : elle identifie votre compte dans toutes vos organisations. Demandez-la à ${quiLocataire ?? "votre gestionnaire"}, ou à l’assistance pour un compte propriétaire.`}
          </p>
        </div>

        <div className="loc-carte">
          <div className="entete-carte">
            <h2 className="titre-carte leading-[inherit]">Mot de passe</h2>
          </div>
          <p className="mesure-lecture text-sm text-muted-foreground">
            Le mot de passe actuel est demandé : sans lui, un poste laissé
            déverrouillé une minute suffirait à prendre le compte. Vos autres
            appareils connectés seront déconnectés ; celui-ci restera ouvert.
          </p>
          <FormulaireMotDePasse />
        </div>

        {/* Ancre de l'archive complète (relecture du 24/10) : « Valider mon second facteur » y mène. */}
        <div id="second-facteur" className="scroll-mt-24">
          <SecondFacteur obligatoire={Boolean(supervision)} />
        </div>

        {/* Plan de conformité du 23/10 (lot 1A) : la version acceptée des conditions, et le lien pour la relire. */}
        <ConditionsAcceptees supabase={supabase} compteId={user.id} />

        {/* Mes données personnelles (audit du 27/09) : aucun chemin vers la
            politique de confidentialité ni vers l'exercice des droits depuis
            les espaces. [[RGPD]] : pour les données de gestion locative,
            c'est le gestionnaire (ou le bailleur qui gère lui-même) qui
            répond aux demandes et décide de l'effacement (Gerimmo est son
            sous-traitant) ; pour le compte lui-même, l'assistance. */}
        <div className="loc-carte" id="donnees-personnelles">
          <div className="entete-carte">
            <h2 className="titre-carte leading-[inherit]">Mes données personnelles</h2>
          </div>
          <p className="mesure-lecture text-sm text-muted-foreground">
            Vous pouvez demander à consulter vos données, à les recevoir, à les faire
            corriger ou à faire effacer les pièces de votre dossier.{" "}
            {espaceLocataire ? (
              <RenvoiDonneesLocation espace={espaceLocataire} identite={identiteEspace} />
            ) : (
              <>
                Pour les données d&apos;une location, adressez-vous à son bailleur ou à
                son gestionnaire ;
                pour votre compte, écrivez-nous depuis{" "}
                <Link href="/assistance" className="lien-discret">
                  Aide et retours
                </Link>
                .
              </>
            )}
          </p>
          <p className="mt-3"><Link href="/compte/donnees" className="btn-secondaire">Gérer mes données et demander la fermeture de mon compte</Link></p>
          <p className="mt-2 text-sm">
            {/* Lot 61 (E139) : lien isolé de 14 px de haut ; souligné et haut de 24 px au moins. */}
            <Link href="/confidentialite" className={LIEN_CONFIDENTIALITE}>
              Lire la politique de confidentialité
            </Link>
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Mot de passe perdu et session fermée ? Depuis la page de connexion,
          « Mot de passe oublié » vous envoie un lien par email. Second facteur
          perdu sans code valable, en revanche, personne ne peut rouvrir le
          compte depuis l’application : il faut passer par l’assistance.
        </p>
      </main>
    </div>
  );
}
