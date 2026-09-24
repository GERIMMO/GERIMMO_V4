import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { chargerQuittancementDuMois } from "@/lib/quittancement-du-mois";
import { eur, moisEnFrancais } from "@/lib/ged";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuittancementMois } from "../comptabilite/quittancement-mois";

// L'onglet dit l'écran, comme ses voisins (24/09 : il n'affichait que
// « Gerimmo »).
export const metadata = { title: "Loyers & charges — Gerimmo" };

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
  // Un mois sans appel n'est pas un mois réussi : rien n'était dû. Les tuiles
  // restent neutres et la carte des impayés se tait (24/09).
  const moisVide = lignes.length === 0;
  // Un seul mot par rôle pour la même destination, celui du menu et du titre
  // de /parc : « Mes lots » pour le propriétaire, « Mon portefeuille » pour
  // l'agent — jamais « le parc » qu'ils ne lisent nulle part (24/09).
  const libelleParc = estProprietaire
    ? "Ouvrir mes lots"
    : role === "agent"
      ? "Ouvrir mon portefeuille"
      : "Ouvrir le parc";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        {/* La marge sous l'en-tête est celle de `.entete-page`, commune à
            l'espace : plus de mb-4 / mb-6 posés page par page (24/09). */}
        <div className="entete-page">
          <h1>Loyers &amp; charges</h1>
          <span className="mono-discret">
            {portefeuille ? "Mon portefeuille · " : ""}
            {moisEnFrancais(mois)}
          </span>
        </div>
        {/* L'introduction parle à chaque rôle, et le texte du lien reprend le
            titre de la page qu'il ouvre (24/09) : l'agent ne connaît pas « la
            comptabilité » et n'a pas la clôture ; le propriétaire n'a ni
            journal ni écritures, il a un livre. Les charges, qui avaient leur
            carte vide en bas d'écran, tiennent ici en une phrase. */}
        <p className="text-sm text-muted-foreground">
          Ce que chaque locataire doit ce mois-ci, ce qui est encaissé, ce qui reste — et les
          gestes : encaisser, envoyer les quittances, relancer.{" "}
          {estProprietaire ? (
            <>
              L&apos;historique de vos recettes et dépenses est dans{" "}
              <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret">
                le livre recettes-dépenses
              </Link>
              .
            </>
          ) : role === "agent" ? (
            <>
              Le journal et les rapports de gestion sont dans{" "}
              <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret">
                Écritures &amp; rapports de gestion
              </Link>
              .
            </>
          ) : (
            <>
              Le journal, les écritures et la clôture vivent dans{" "}
              <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret">
                la comptabilité
              </Link>
              .
            </>
          )}{" "}
          Les appels de charges se saisissent sur le lot, la régularisation annuelle sur le
          bail.{" "}
          <Link href={`/agence/${orgId}/parc`} className="lien-discret">
            {libelleParc} →
          </Link>
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
          {/* Les tuiles de la charte (`.kpi`), comme la Comptabilité et la
              fiche bail : un seul dessin de chiffres dans l'espace (24/09). La
              couleur dit ce qu'on compte ; un mois sans appel reste neutre. Le
              mois est déjà dans la mention d'en-tête : « Appelé ce mois » ne se
              plie plus sur trois lignes au téléphone. */}
          <section className="grille-kpi" aria-label="Le mois en chiffres">
            <div className={`kpi ${moisVide ? "" : "bleu"}`}>
              <span className="eyebrow">Appelé ce mois</span>
              <span className="chiffre montant mt-1 block">{eur(appele)}</span>
              <span className="block text-xs text-muted-foreground">
                {lignes.length} terme{lignes.length > 1 ? "s" : ""} de loyer
              </span>
            </div>
            <div className={`kpi ${moisVide ? "" : "vert"}`}>
              <span className="eyebrow">Encaissé</span>
              <span className="chiffre montant mt-1 block">{eur(encaisse)}</span>
              <span className="block text-xs text-muted-foreground">
                {moisVide
                  ? "aucun terme ce mois-ci"
                  : `${nbRegles} sur ${lignes.length} réglé${nbRegles > 1 ? "s" : ""} en entier`}
              </span>
            </div>
            <div className={`kpi ${reste > 0 ? "rouge" : moisVide ? "" : "vert"}`}>
              <span className="eyebrow">Reste dû</span>
              <span className="chiffre montant mt-1 block">{eur(reste)}</span>
              <span className="block text-xs text-muted-foreground">
                {moisVide
                  ? "rien n’était dû"
                  : impayes.length === 0
                    ? "rien à relancer"
                    : `${impayes.length} locataire${impayes.length > 1 ? "s" : ""} à relancer`}
              </span>
            </div>
          </section>

          {!moisVide ? (
            // L'en-tête et le corps viennent du composant, posés directement
            // dans la carte comme ceux des cartes voisines (24/09).
            <Card>
              <QuittancementMois
                orgId={orgId}
                mois={mois}
                moisLabel={moisEnFrancais(mois)}
                lignes={lignes}
                proprietaire={estProprietaire}
              />
            </Card>
          ) : (
            // Même gabarit que les autres cartes de l'écran (CardHeader /
            // CardTitle) : plus de titre dans un CardContent « pt-5 » et de
            // bande vide au-dessus (24/09).
            <Card>
              <CardHeader>
                <CardTitle>Aucun appel de loyer ce mois-ci</CardTitle>
                <CardDescription>
                  Le cycle mensuel crée les appels le 1ᵉʳ du mois pour chaque bail actif ; sans
                  bail actif, il n&rsquo;y a rien à quittancer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* L'état vide mène au geste qui le remplit : un bail se crée
                    depuis la fiche d'un lot. */}
                <Link
                  href={`/agence/${orgId}/parc`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {libelleParc}
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Sans appel ce mois-ci, la carte d'état vide dit déjà qu'il n'y a
              rien à encaisser : « tout est encaissé » y mentait (24/09). */}
          {!moisVide && (
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
                    <li key={l.appel_id}>
                      {/* La relance se fait sur le bail, section des loyers :
                          le lien le dit et y mène directement — et c'est TOUT
                          le rang qui se clique, pas ces trois mots (retour du
                          24/09 : « je veux que tout le carré soit cliquable »). */}
                      <Link
                        href={`/agence/${orgId}/baux/${l.bail_id}#loyers`}
                        className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2.5 hover:bg-[var(--survol)]"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{l.locataire ?? "Locataire"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {l.lot_nom} · reste {eur(Number(l.montant_du) - Number(l.montant_couvert))}
                            {l.dette_anterieure_reste ? ` · dette antérieure ${eur(Number(l.dette_anterieure_reste))}` : ""}
                          </span>
                        </span>
                        <span className="lien-discret">Relancer sur le bail →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          )}
        </>
      )}
    </main>
  );
}
