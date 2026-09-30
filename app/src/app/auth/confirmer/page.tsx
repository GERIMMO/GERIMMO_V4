import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { CoquilleAuth } from "@/components/coquille-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { destinationSure } from "@/lib/destination-sure";
import { COOKIE_CONFIRMATION } from "@/lib/jeton-confirmation";

// LA PAGE D'UN LIEN REÇU PAR E-MAIL (30/09/2026).
//
// Le lien d'une invitation, de « mot de passe oublié » ou d'une confirmation
// d'inscription mène ici (via /auth/confirm) SANS consommer son jeton : les
// messageries qui pré-ouvrent les liens pour les analyser le rendaient
// inutilisable avant même que le destinataire clique. Le jeton n'est vérifié
// qu'au clic sur le bouton — un POST vers /auth/confirm, qu'aucun analyseur
// n'envoie.
//
// Le formulaire recopie dans un champ caché le double jeton que /auth/confirm
// a posé en cookie (lib/jeton-confirmation.ts) : sans lui, le POST est refusé.
// Sans cookie (navigateur qui les refuse, page ouverte hors du lien), on ne
// montre pas un bouton qui échouerait : on repasse par /auth/confirm.
//
// L'adresse de la page porte le jeton : ni indexation, ni référent transmis,
// ni cache (next.config.ts pose `Cache-Control: no-store` sur /auth/*).
export const metadata: Metadata = {
  title: "Accéder à votre compte — Gerimmo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

type Params = { token_hash?: string; type?: string; next?: string };

export default async function PageConfirmerLien({ searchParams }: { searchParams: Promise<Params> }) {
  const { token_hash: jeton, type, next: brut } = await searchParams;
  const next = destinationSure(brut);
  const motDePasse = next === "/nouveau-mot-de-passe";
  const inscription = type === "signup";
  const confirmation = (await cookies()).get(COOKIE_CONFIRMATION)?.value ?? "";

  const relance = new URLSearchParams();
  if (jeton) relance.set("token_hash", jeton);
  if (type) relance.set("type", type);
  relance.set("next", next);

  return (
    <CoquilleAuth
      promesse="La gestion locative, tenue au carré."
      sousPromesse="Baux, quittances, régularisations, rapports de gestion et interventions — pour les agences, les propriétaires bailleurs, leurs locataires et les artisans."
      mention="Un seul compte, tous vos espaces"
      titre={inscription ? "Confirmez votre adresse" : motDePasse ? "Votre mot de passe" : "Accéder à votre compte"}
      chapo={
        jeton && type
          ? inscription
            ? "Votre lien est prêt. Cliquez sur le bouton pour confirmer votre adresse et ouvrir votre compte."
            : motDePasse
              ? "Votre lien est prêt. Cliquez sur le bouton pour choisir votre mot de passe : il sera demandé à chaque connexion."
              : "Votre lien est prêt. Cliquez sur le bouton pour continuer."
          : undefined
      }
    >
      <Card>
        <CardContent className="pt-6">
          {jeton && type && confirmation ? (
            <form method="post" action="/auth/confirm" className="space-y-4">
              <input type="hidden" name="token_hash" value={jeton} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="confirmation" value={confirmation} />
              <Button type="submit" className="w-full">
                {inscription ? "Confirmer mon adresse" : motDePasse ? "Choisir mon mot de passe" : "Continuer"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Ce lien ne sert qu’une fois et reste valable pour une durée limitée.
              </p>
            </form>
          ) : jeton && type ? (
            <div className="space-y-4">
              <p role="alert" className="rounded-md border-l-4 border-warning bg-warning-soft p-3 text-sm text-warning-soft-foreground">
                Cette page a besoin d’un cookie de sécurité qui manque. Rouvrez le lien pour continuer ; si le
                message revient, autorisez les cookies pour ce site.
              </p>
              <Button className="w-full" nativeButton={false} render={<a href={`/auth/confirm?${relance}`}>Rouvrir le lien</a>} />
            </div>
          ) : (
            <div className="space-y-4">
              <p role="alert" className="rounded-md border-l-4 border-warning bg-warning-soft p-3 text-sm text-warning-soft-foreground">
                Ce lien est incomplet. Ouvrez-le directement depuis l’e-mail reçu, ou demandez-en un nouveau.
              </p>
              <Button
                className="w-full"
                nativeButton={false}
                render={<Link href="/mot-de-passe-oublie">Recevoir un nouveau lien</Link>}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </CoquilleAuth>
  );
}
