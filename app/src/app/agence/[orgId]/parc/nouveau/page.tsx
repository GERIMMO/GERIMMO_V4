import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { FormulaireBien } from "../formulaire-bien";
import { euros, offreParticulier, parPeriode, type Periodicite } from "@/lib/tarifs";

export const metadata = { title: "Nouveau bien — Gerimmo" };

export default async function PageNouveauBien(
  props: PageProps<"/agence/[orgId]/parc/nouveau">
) {
  const { orgId } = await props.params;
  const { supabase, role, estProprietaire } = await verifierAccesEspace(orgId);

  // Le bailleur doit être identifiable AVANT de saisir un bien (recette de
  // production du 27/09) : l'action refuse la création tant que l'adresse et
  // l'e-mail du propriétaire manquent, parce qu'ils le désignent dans les
  // documents. On le dit ici, avant le formulaire, et non après l'envoi.
  let manquants: string[] = [];
  // Grille du 28/09/2026 : au-delà de la capacité payée, le prix du bien
  // suivant se montre AVANT le formulaire, et se confirme sur « Mon abonnement ».
  let depassement: { capacite: number; apres: number; offre: ReturnType<typeof offreParticulier>; periodicite: Periodicite } | null = null;
  if (role === "proprietaire_direct") {
    const [{ data: etatBrut }, { data: paiementBrut }] = await Promise.all([
      supabase.rpc("etat_abonnement", { p_org: orgId }),
      supabase.rpc("mon_abonnement", { p_org: orgId }),
    ]);
    const cap = ((etatBrut ?? []) as { unites_a_couvrir: number | null; unites_souscrites: number | null }[])[0];
    const per = ((paiementBrut ?? []) as { periodicite: Periodicite }[])[0]?.periodicite ?? "mensuel";
    if (cap && cap.unites_souscrites !== null && (cap.unites_a_couvrir ?? 0) + 1 > cap.unites_souscrites) {
      const apres = (cap.unites_a_couvrir ?? 0) + 1;
      depassement = { capacite: cap.unites_souscrites, apres, offre: offreParticulier(apres, per), periodicite: per };
    }
    const { data: profil } = await supabase.from("organizations")
      .select("address_line1,postal_code,city,email_contact")
      .eq("id", orgId).maybeSingle();
    manquants = [
      !profil?.address_line1 || !profil.postal_code || !profil.city ? "votre adresse" : null,
      !profil?.email_contact ? "votre e-mail de contact" : null,
    ].filter((m): m is string => m !== null);
  }

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-7">
      {/* Le retour « ← Parent » au-dessus de l'en-tête, nommé comme l'entrée
          du menu (25/09 : aucun retour, ni fil ni flèche). */}
      <Link
        href={`/agence/${orgId}/parc`}
        className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
      >
        ← {estProprietaire ? "Mes lots" : "Parc de l'agence"}
      </Link>
      <div className="entete-page">
        <div>
        <p className="dossier-surtitre">Votre patrimoine, bien organisé</p>
        <h1>Ajouter une location</h1>
        <p className="mt-2 text-sm text-muted-foreground">Commencez votre dossier de location par l’adresse et les caractéristiques du bien.</p>
        </div>
      </div>
      {depassement && (
        <div className="loc-carte mb-4 border-l-4 border-l-[var(--or)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Votre formule couvre {depassement.capacite} bien{depassement.capacite > 1 ? "s" : ""}.
            </b>{" "}
            <span className="text-muted-foreground">
              Un bien de plus demande {depassement.offre.biensSupplementaires > 0 ? "un bien supplémentaire" : `la formule ${depassement.offre.formule.nom}`}{" "}
              — {euros(depassement.offre.montantCents)} TTC {parPeriode(depassement.periodicite)}. Rien ne change sans
              votre accord : le nouveau montant, sa date d&apos;effet et le prorata vous sont présentés avant confirmation.
            </span>
          </p>
          <div className="mt-3">
            <Link href={`/agence/${orgId}/abonnement?biens=${depassement.apres}`} className="btn-or">
              Voir et confirmer le nouveau montant
            </Link>
          </div>
        </div>
      )}
      {manquants.length > 0 ? (
        <div className="vide-guide">
          <p className="titre">Complétez d&apos;abord votre profil</p>
          <p className="explication">
            Il manque {manquants.join(" et ")}. Ils vous désignent comme
            bailleur dans le bail, les quittances et les avis d&apos;échéance :
            sans eux, le bien ne peut pas être créé.
          </p>
          <div className="geste">
            <Link href={`/agence/${orgId}/profil`} className="btn-or">
              Compléter mon profil
            </Link>
          </div>
        </div>
      ) : (
      <FormulaireBien orgId={orgId} guide />
      )}
    </main>
  );
}
