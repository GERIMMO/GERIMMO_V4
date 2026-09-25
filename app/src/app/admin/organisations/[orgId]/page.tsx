import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { libelleRole, libelleStatutAdhesion, LIBELLES_STATUT_ORGANISATION } from "@/lib/libelles";
import { formaterDate } from "@/lib/ged";
import { familleOrganisation, initiales } from "@/lib/clients-supervision";

export const metadata = { title: "Client — Console Gerimmo" };

/**
 * LA FICHE D'UN CLIENT — agence ou propriétaire bailleur.
 *
 * Demande du porteur du projet, 19/09 : « lorsque je clique sur un des clients,
 * je veux voir sa fiche complétée avec un bouton pour entrer dans sa session ».
 *
 * L'écran d'avant portait deux cartes (adhésions, personnes) et rien d'autre :
 * ni l'adresse, ni le contact, ni le SIRET, ni où en est l'abonnement, ni le
 * parc — et aucun moyen d'entrer dans l'espace autrement qu'en repassant par
 * « Mes espaces ». Tout est ici, et l'entrée est un bouton.
 *
 * La traversée reste journalisée (RM-A1.11, `log_sa_access`) : consulter cette
 * fiche est déjà une traversée.
 */

type Adhesion = {
  id: string;
  role: string;
  status: string;
  account_id: string;
  account: { email: string } | null;
};

function Info({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="libelle-champ">{libelle}</dt>
      <dd className="text-sm text-[var(--corps)]">{children}</dd>
    </div>
  );
}

export default async function PageAdminOrganisation(
  props: PageProps<"/admin/organisations/[orgId]">
) {
  const { orgId } = await props.params;
  const supabase = await createClient();

  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  // RM-A1.11 : la traversée super admin est journalisée (audit_log, 3 ans)
  await supabase.rpc("log_sa_access", {
    org: orgId,
    sa_action: "consultation_organisation",
  });

  const { data: organisation } = await supabase
    .from("organizations")
    .select(
      "id, name, status, type, essai_fin, created_at, address_line1, postal_code, city, telephone, email_contact, siret, carte_pro, garantie_financiere, tva_intracom, tva_franchise, code_parrainage"
    )
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) notFound();

  const [personnes, adhesionsLues, lots, baux, parrainages] = await Promise.all([
    supabase
      .from("persons")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("memberships")
      .select("id, role, status, account_id, account:accounts(email)")
      .eq("organization_id", orgId),
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .neq("etat", "archive"),
    supabase
      .from("baux")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("parrainages")
      .select(
        "parrain_organization_id, filleul_organization_id, parrain:organizations!parrainages_parrain_organization_id_fkey(name)"
      ),
  ]);

  const adhesions = (adhesionsLues.data ?? []) as unknown as Adhesion[];
  const lignesParrainage = (parrainages.data ?? []) as unknown as {
    parrain_organization_id: string;
    filleul_organization_id: string;
    parrain: { name: string } | null;
  }[];
  const filleuls = lignesParrainage.filter((p) => p.parrain_organization_id === orgId).length;
  const monParrain =
    lignesParrainage.find((p) => p.filleul_organization_id === orgId)?.parrain?.name ?? null;

  const famille = familleOrganisation(organisation.type);
  // Sept « Non renseignée » ne disent qu'une chose (audit 25/09, C12) : l'identité
  // n'est pas remplie. Une ligne le dit, avec le geste ; les champs remplis s'affichent.
  const champs: [string, string | null | undefined][] = [
    ["Adresse", [organisation.address_line1, [organisation.postal_code, organisation.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null],
    ["Email de contact", organisation.email_contact],
    ["Téléphone", organisation.telephone],
    ["SIRET", organisation.siret],
    ...(famille === "agence" ? ([["Carte professionnelle", organisation.carte_pro], ["Garantie financière", organisation.garantie_financiere]] as [string, string | null][]) : []),
    ["TVA", organisation.tva_franchise ? "Franchise en base" : organisation.tva_intracom],
  ];
  const renseignes = champs.filter(([, v]) => v);
  const manquants = champs.filter(([, v]) => !v).map(([l]) => l.toLowerCase());

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <Link href="/admin/clients" className="lien-discret text-sm">
        ← Tous les clients
      </Link>

      <div className="entete-page mt-2 mb-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="pastille-marque flex size-11 shrink-0 items-center justify-center rounded-full text-[15px]"
          >
            {initiales(organisation.name)}
          </span>
          {/* Le nom passe à la ligne au lieu d'être coupé (24/09). */}
          <div className="min-w-0">
            <h1 className="[overflow-wrap:anywhere] max-sm:text-2xl">{organisation.name}</h1>
            <p className="mono-discret sans-majuscules">
              {famille === "agence" ? "Agence de gestion" : "Propriétaire bailleur"} · cliente
              depuis le {formaterDate(organisation.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`puce ${
              organisation.status === "active"
                ? "puce-loue"
                : organisation.status === "essai"
                  ? "puce-prep"
                  : organisation.status === "suspendue"
                    ? "puce-rouge"
                    : "puce-grise"
            }`}
          >
            {LIBELLES_STATUT_ORGANISATION[organisation.status] ?? organisation.status}
          </span>
          {/* LE GESTE DEMANDÉ : entrer dans l'espace du client, depuis sa
              fiche. Il existait, mais seulement en repassant par « Mes
              espaces » et en retrouvant la bonne carte dans la liste. */}
          <Link href={`/agence/${orgId}`} className="btn-or">
            Entrer dans son espace
          </Link>
        </div>
      </div>

      <p className="mesure-lecture mb-6 text-sm text-[var(--texte-secondaire)]">
        Entrer dans un espace client donne accès à ses données réelles. Chaque
        traversée est inscrite au journal d&apos;audit, conservée trois ans
        {/* RM-A1.11 */} — y compris l&apos;ouverture de cette fiche.
      </p>

      <section className="loc-carte">
        <div className="entete-carte">
          <h3>Identité</h3>
          <Link href={`/agence/${orgId}/profil`} className="lien-discret text-[12.5px]">
            Ouvrir son profil →
          </Link>
        </div>
        {manquants.length > 0 && (
          <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--filet)] bg-[var(--filet-leger)] p-3 text-sm">
            <span>{renseignes.length === 0 ? "Identité non renseignée" : `À compléter : ${manquants.join(", ")}`}</span>
            <Link href={`/agence/${orgId}/profil`} className="btn-secondaire">Compléter</Link>
          </p>
        )}
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {renseignes.map(([libelle, valeur]) => <Info key={libelle} libelle={libelle}>{valeur}</Info>)}
          {/* La ligne ne sert que pour un essai (24/09) : ailleurs, elle
              répétait la puce de l'en-tête, au féminin sur « abonnement ». */}
          {organisation.status === "essai" && organisation.essai_fin && (
            <Info libelle="Abonnement">
              Essai jusqu&apos;au {formaterDate(organisation.essai_fin)}
            </Info>
          )}
        </dl>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="loc-carte">
          <div className="entete-carte">
            <h3>Son parc</h3>
          </div>
          <dl className="grid gap-3">
            <Info libelle="Lots gérés (base de facturation)">
              {lots.error ? "Indisponible" : (lots.count ?? 0)}
            </Info>
            <Info libelle="Baux">{baux.error ? "Indisponible" : (baux.count ?? 0)}</Info>
            <Info libelle="Fiches personnes">
              {personnes.error ? "Indisponible" : (personnes.count ?? 0)}
            </Info>
          </dl>
        </section>

        <section className="loc-carte">
          <div className="entete-carte">
            <h3>Parrainage</h3>
          </div>
          <dl className="grid gap-3">
            <Info libelle="Son code">
              <span className="montant tracking-wider">
                {organisation.code_parrainage ?? "—"}
              </span>
            </Info>
            {/* Une valeur absente ne se lit pas comme un nom (24/09). */}
            <Info libelle="Amenée par">
              {monParrain ?? <span className="text-[var(--texte-secondaire)]">Aucun parrain</span>}
            </Info>
            <Info libelle="Filleuls">
              {parrainages.error ? "Indisponible" : filleuls}
            </Info>
          </dl>
        </section>
      </div>

      <section className="loc-carte mt-4">
        <div className="entete-carte">
          <h3>Comptes rattachés</h3>
          <span className="mono-discret">
            {adhesionsLues.error ? "indisponibles" : adhesions.length}
          </span>
        </div>
        {adhesionsLues.error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            Les adhésions sont indisponibles. Rechargez la page.
          </p>
        ) : adhesions.length === 0 ? (
          <p className="text-sm text-[var(--texte-secondaire)]">
            Aucun compte rattaché : personne ne peut encore se connecter à cet
            espace.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--filet-leger)]">
            {adhesions.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium break-all">
                    {m.account?.email ?? "Adresse inconnue"}
                  </span>{" "}
                  <span className="text-[var(--texte-secondaire)]">
                    — {libelleRole(m.role)} (adhésion {libelleStatutAdhesion(m.status)})
                  </span>
                </span>
                {/* La fiche de débogage du compte (25/09) : état de connexion, rôles, journaux. */}
                <Link href={`/admin/comptes/${m.account_id}`} className="lien-discret whitespace-nowrap">
                  Fiche du compte →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
