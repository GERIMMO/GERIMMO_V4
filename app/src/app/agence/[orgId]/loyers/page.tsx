import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { chargerQuittancementDuMois } from "@/lib/quittancement-du-mois";
import { eur, moisEnFrancais } from "@/lib/ged";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconeTrait } from "@/components/icone-trait";
import { QuittancementMois } from "../comptabilite/quittancement-mois";

/**
 * LOYERS & CHARGES — l'écran du mois (refonte v4, phase D, validée le 19/09).
 *
 * Ce que chaque locataire doit ce mois-ci, ce qui est encaissé, ce qui reste,
 * et les gestes : encaisser, envoyer les quittances, relancer. C'est l'écran
 * qu'ouvre un gérant le 5 du mois. La comptabilité — journal, écritures,
 * clôture, rapports — vit sur son propre écran ; elle n'a plus à porter le
 * quittancement au milieu du livre.
 *
 * Même portée que la comptabilité : l'agent y lit son portefeuille, l'admin
 * et le propriétaire tout.
 */
export default async function PageLoyers({ params }: PageProps<"/agence/[orgId]/loyers">) {
  const { orgId } = await params;
  const { supabase, user, role, estProprietaire } = await verifierAccesEspace(orgId);
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  const dansPortefeuille = (lotId: string | null | undefined) =>
    !portefeuille || (lotId != null && portefeuille.has(lotId));
  const { mois, lignes, error } = await chargerQuittancementDuMois(supabase, orgId, dansPortefeuille);

  const appele = lignes.reduce((t, l) => t + Number(l.montant_du), 0);
  const encaisse = lignes.reduce((t, l) => t + Math.min(Number(l.montant_couvert), Number(l.montant_du)), 0);
  const reste = Math.max(0, appele - encaisse);
  const impayes = lignes.filter((l) => Number(l.montant_couvert) < Number(l.montant_du));
  const nbRegles = lignes.length - impayes.length;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <div className="entete-page mb-4">
          <h1>Loyers &amp; charges</h1>
          <span className="mono-discret">
            {portefeuille ? "Mon portefeuille · " : ""}
            {moisEnFrancais(mois)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Ce que chaque locataire doit ce mois-ci, ce qui est encaissé, ce qui reste — et les
          gestes : encaisser, envoyer les quittances, relancer. Le journal, les écritures et la
          clôture vivent dans{" "}
          <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret">
            {estProprietaire ? "le livre recettes-dépenses" : "la comptabilité"}
          </Link>
          .
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-5">
            <p className="err mb-0" role="alert">
              Impossible de lire le quittancement du mois — ce n&rsquo;est pas un mois sans
              appels de loyer, c&rsquo;est une lecture qui a échoué. Les encaissements restent
              accessibles depuis chaque bail.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="tuiles" aria-label="Le mois en chiffres">
            <div className="tuile accent">
              <span className="ico" aria-hidden><IconeTrait nom="euro" /></span>
              <span className="lib">Appelé en {moisEnFrancais(mois)}</span>
              <span className="val">{eur(appele)}</span>
              <span className="sous">
                {lignes.length} terme{lignes.length > 1 ? "s" : ""} de loyer
              </span>
            </div>
            <div className={`tuile ${reste === 0 && lignes.length > 0 ? "ok" : "neutre"}`}>
              <span className="ico" aria-hidden><IconeTrait nom="coche" /></span>
              <span className="lib">Encaissé</span>
              <span className="val">{eur(encaisse)}</span>
              <span className="sous">
                {nbRegles} sur {lignes.length} réglé{nbRegles > 1 ? "s" : ""} en entier
              </span>
            </div>
            <div className={`tuile ${reste > 0 ? "probleme" : "ok"}`}>
              <span className="ico" aria-hidden><IconeTrait nom="cloche" /></span>
              <span className="lib">Reste dû</span>
              <span className="val">{eur(reste)}</span>
              <span className="sous">
                {impayes.length === 0
                  ? "rien à relancer"
                  : `${impayes.length} locataire${impayes.length > 1 ? "s" : ""} à relancer`}
              </span>
            </div>
          </section>

          {lignes.length > 0 ? (
            <Card>
              <CardContent className="pt-5">
                <QuittancementMois
                  orgId={orgId}
                  mois={mois}
                  moisLabel={moisEnFrancais(mois)}
                  lignes={lignes}
                  proprietaire={estProprietaire}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-5">
                <p className="font-medium">Aucun appel de loyer ce mois-ci.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Le cycle mensuel crée les appels le 1ᵉʳ du mois pour chaque bail actif ; sans
                  bail actif, il n&rsquo;y a rien à quittancer.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Impayés à relancer</CardTitle>
              <CardDescription>
                Chaque terme non couvert, avec son reste. La relance se consigne sur le bail —
                elle vaut preuve.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {impayes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun impayé sur {moisEnFrancais(mois)} : tout est encaissé.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {impayes.map((l) => (
                    <li key={l.appel_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="font-medium">{l.locataire ?? "Locataire"}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.lot_nom} · reste {eur(Number(l.montant_du) - Number(l.montant_couvert))}
                          {l.dette_anterieure_reste ? ` · dette antérieure ${eur(Number(l.dette_anterieure_reste))}` : ""}
                        </p>
                      </div>
                      <Link href={`/agence/${orgId}/baux/${l.bail_id}`} className="lien-discret">
                        Relancer →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Charges</CardTitle>
              <CardDescription>
                Les appels de charges se saisissent sur le lot, la régularisation annuelle sur le
                bail : chaque décompte reste à côté de ce qu&rsquo;il concerne.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/agence/${orgId}/parc`} className="lien-discret">
                Ouvrir le parc →
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
