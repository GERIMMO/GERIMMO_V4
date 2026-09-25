import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { MarqueOrganisation } from "@/components/marque-organisation";
import { nomMarque, styleMarque, type MarqueOrganisation as Marque } from "@/lib/marque-organisation";
import { chargerMarque } from "@/lib/marque-organisation-serveur";
import { formaterDateHeure } from "@/lib/ged";
import { FormulaireMotDePasse } from "./formulaire-mot-de-passe";
import { SecondFacteur } from "./second-facteur";

// LA MARQUE DU LOCATAIRE (25/09, D04). Cet écran est hors de tout espace, et
// il affichait le logo GERIMMO — au locataire d'une agence en marque blanche,
// qui ne doit jamais lire ce nom. Quand le compte n'a QUE des adhésions de
// locataire, l'en-tête et l'onglet portent la marque de son organisation ; un
// compte qui a aussi un espace agence ou propriétaire garde Gerimmo. Lu une
// fois par requête : la page et son titre en ont besoin.
const lireMarqueLocataire = cache(async function lireMarqueLocataire(): Promise<Marque | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organization_id")
    .eq("account_id", user.id)
    .eq("status", "active");
  const adhesions = (data ?? []) as { role: string; organization_id: string }[];
  // Une lecture tombée ne décide rien : on garde l'en-tête neutre.
  if (error || adhesions.length === 0 || adhesions.some((a) => a.role !== "locataire")) return null;
  return chargerMarque(supabase, adhesions[0].organization_id);
});

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

  return (
    <div className="flex min-h-full flex-1 flex-col" style={styleMarque(marque)}>
      <header className="bandeau-appli">
        {/* Les deux liens ne se coupent pas sur deux lignes à 390 px (25/09,
            D28) : ils restent d'un tenant, c'est la marque qui cède la place. */}
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-7">
          <div className="min-w-0 max-w-[180px]">
            {marque ? <MarqueOrganisation marque={marque} /> : <MarqueGerimmo />}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/espaces" className="lien-bandeau whitespace-nowrap">
              Mes espaces
            </Link>
            <form action={seDeconnecter}>
              <button type="submit" className="lien-bandeau whitespace-nowrap">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4 sm:p-7">
        <div>
          <p className="eyebrow mb-1.5">Votre compte</p>
          <h1 className="mb-6">Sécurité du compte</h1>
        </div>

        <div className="loc-carte">
          <div className="entete-carte">
            <h3>Identifiants</h3>
          </div>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div className="ligne-info">
              <dt className="text-muted-foreground">Adresse de connexion</dt>
              <dd className="font-medium break-all">{user.email}</dd>
            </div>
            <div className="ligne-info">
              <dt className="text-muted-foreground">Dernière connexion</dt>
              <dd className="font-medium">{formaterDateHeure(user.last_sign_in_at)}</dd>
            </div>
          </dl>
          <p className="mesure-lecture mt-3 text-sm text-muted-foreground">
            L’adresse de connexion ne se change pas depuis cet écran : elle
            identifie votre compte dans toutes vos organisations. Demandez-la à
            votre gestionnaire, ou à l’assistance pour un compte propriétaire.
          </p>
        </div>

        <div className="loc-carte">
          <div className="entete-carte">
            <h3>Mot de passe</h3>
          </div>
          <p className="mesure-lecture text-sm text-muted-foreground">
            Le mot de passe actuel est demandé : sans lui, un poste laissé
            déverrouillé une minute suffirait à prendre le compte. Vos autres
            appareils connectés seront déconnectés ; celui-ci restera ouvert.
          </p>
          <FormulaireMotDePasse />
        </div>

        <SecondFacteur obligatoire={Boolean(supervision)} />

        <p className="text-sm text-muted-foreground">
          Mot de passe perdu et session fermée ? Il reste{" "}
          <Link href="/mot-de-passe-oublie" className="lien-discret">
            le lien reçu par email
          </Link>
          . Second facteur perdu sans code valable, en revanche, personne ne
          peut rouvrir le compte depuis l’application : il faut passer par
          l’assistance.
        </p>
      </main>
    </div>
  );
}
