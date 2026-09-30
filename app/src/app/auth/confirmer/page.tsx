import type { Metadata } from "next";
import Link from "next/link";
import { CoquilleAuth } from "@/components/coquille-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { destinationSure } from "@/lib/destination-sure";

// LA PAGE D'UN LIEN REÇU PAR E-MAIL (30/09/2026).
//
// Le lien d'une invitation ou de « mot de passe oublié » mène ici (via
// /auth/confirm) SANS consommer son jeton : les messageries qui pré-ouvrent
// les liens pour les analyser le rendaient inutilisable avant même que le
// destinataire clique. Le jeton n'est vérifié qu'au clic sur le bouton — un
// POST vers /auth/confirm, qu'aucun analyseur n'envoie.
//
// L'adresse de la page porte le jeton : ni indexation, ni référent transmis.
export const metadata: Metadata = {
  title: "Accéder à votre compte — Gerimmo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Params = { token_hash?: string; type?: string; next?: string };

export default async function PageConfirmerLien({ searchParams }: { searchParams: Promise<Params> }) {
  const { token_hash: jeton, type, next: brut } = await searchParams;
  const next = destinationSure(brut);
  const motDePasse = next === "/nouveau-mot-de-passe";

  return (
    <CoquilleAuth
      promesse="La gestion locative, tenue au carré."
      sousPromesse="Baux, quittances, régularisations, rapports de gestion et interventions — pour les agences, les propriétaires bailleurs, leurs locataires et les artisans."
      mention="Un seul compte, tous vos espaces"
      titre={motDePasse ? "Votre mot de passe" : "Accéder à votre compte"}
      chapo={
        jeton && type
          ? motDePasse
            ? "Votre lien est prêt. Cliquez sur le bouton pour choisir votre mot de passe : il sera demandé à chaque connexion."
            : "Votre lien est prêt. Cliquez sur le bouton pour continuer."
          : undefined
      }
    >
      <Card>
        <CardContent className="pt-6">
          {jeton && type ? (
            <form method="post" action="/auth/confirm" className="space-y-4">
              <input type="hidden" name="token_hash" value={jeton} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <Button type="submit" className="w-full">
                {motDePasse ? "Choisir mon mot de passe" : "Continuer"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Ce lien ne sert qu’une fois et reste valable pour une durée limitée.
              </p>
            </form>
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
