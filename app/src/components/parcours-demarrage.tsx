import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * « Par où je commence ? » — le chemin du compte au premier bail.
 *
 * Une organisation qui vient d'ouvrir arrive sur un tableau de bord à zéro.
 * Entre le premier bien et le premier loyer appelé il y a cinq gestes, chacun
 * gardé par une règle qui refuse tant que le précédent n'a pas eu lieu : la
 * détention à 100 %, le DPE en habitation, les mentions obligatoires du bail.
 * Celui qui découvre le produit les rencontrait une par une, sous forme de
 * refus. Ce bloc les met dans l'ordre, dit où l'on en est, et n'ouvre QU'UNE
 * porte à la fois — la suivante.
 *
 * Il DISPARAÎT dès que les cinq étapes sont faites : un guide qui reste après
 * coup devient un reproche.
 */

type Etape = {
  etape: string;
  faite: boolean;
  detail: string | null;
  lot_id: string | null;
  bien_id: string | null;
};

const LIBELLES: Record<string, { titre: string; geste: string }> = {
  identite: { titre: "Votre identité", geste: "Compléter le profil" },
  bien: { titre: "Un premier bien", geste: "Ajouter un bien" },
  lot_pret: { titre: "Un lot en état d'être loué", geste: "Lever ce qui bloque" },
  locataire: { titre: "Un locataire", geste: "Créer sa fiche" },
  bail: { titre: "Le bail", geste: "Créer le bail" },
};

function lien(orgId: string, e: Etape): string {
  switch (e.etape) {
    case "identite":
      return `/agence/${orgId}/profil`;
    case "bien":
      return `/agence/${orgId}/parc/nouveau`;
    case "locataire":
      return `/agence/${orgId}/personnes#creer-fiche`;
    case "lot_pret":
    case "bail":
      // Le formulaire de création d'un bail vit sur la fiche du lot, section
      // « Baux & état des lieux » — c'est l'unique porte d'entrée du produit.
      return e.bien_id && e.lot_id
        ? `/agence/${orgId}/parc/${e.bien_id}/lots/${e.lot_id}#baux`
        : `/agence/${orgId}/parc`;
    default:
      return `/agence/${orgId}/parc`;
  }
}

export async function ParcoursDemarrage({
  supabase,
  orgId,
}: {
  supabase: SupabaseClient;
  orgId: string;
}) {
  const { data, error } = await supabase.rpc("parcours_demarrage", { p_org: orgId });
  // Une lecture tombée ne doit pas se déguiser en parcours terminé : on
  // n'affiche rien plutôt que d'annoncer une fin qu'on n'a pas constatée.
  if (error) return null;

  const etapes = (data ?? []) as Etape[];
  if (etapes.length === 0 || etapes.every((e) => e.faite)) return null;

  const faites = etapes.filter((e) => e.faite).length;
  const suivante = etapes.find((e) => !e.faite);

  return (
    <section className="loc-carte border-l-4 border-l-[var(--or)]" aria-labelledby="parcours-titre">
      <div className="entete-carte">
        <h3 id="parcours-titre">Mettre votre premier lot en location</h3>
        <span className="mono-discret">
          {faites} / {etapes.length}
        </span>
      </div>

      <ol className="mt-1 space-y-0">
        {etapes.map((e) => {
          const libelle = LIBELLES[e.etape];
          const courante = suivante?.etape === e.etape;
          return (
            <li
              key={e.etape}
              className="flex items-start gap-3 border-b border-[var(--filet)] py-3 last:border-0"
            >
              <span
                aria-hidden
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] ${
                  e.faite
                    ? "bg-[var(--encre)] text-[var(--or)]"
                    : courante
                      ? "border-2 border-[var(--or)] text-[var(--encre)]"
                      : "border border-[var(--filet)] text-[var(--texte-secondaire)]"
                }`}
              >
                {e.faite ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-sm ${e.faite ? "text-[var(--texte-secondaire)]" : "font-medium"}`}>
                    {libelle?.titre ?? e.etape}
                  </span>
                  <span className="sr-only">{e.faite ? "— fait" : "— à faire"}</span>
                </span>
                {e.detail && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{e.detail}</span>
                )}
                {courante && (
                  <Link href={lien(orgId, e)} className="btn-or mt-2.5">
                    {libelle?.geste ?? "Continuer"}
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs text-muted-foreground">
        Une fois le bail actif, le loyer s&apos;appelle seul le 1ᵉʳ de chaque
        mois et la quittance suit l&apos;encaissement — vous n&apos;aurez plus
        rien à lancer.
      </p>
    </section>
  );
}
