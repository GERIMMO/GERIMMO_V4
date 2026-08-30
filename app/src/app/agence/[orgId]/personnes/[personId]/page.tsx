import Link from "next/link";
import { formaterDate } from "@/lib/ged";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { TYPES_PIECE_DOSSIER, statutEcheancePiece } from "@/lib/dossier";
import { ETATS_MANDAT, COULEURS_ETAT_MANDAT } from "@/lib/baux";
import { nomComplet, initiales } from "@/lib/roles-personnes";
import {
  FormulairePiece,
  FormulaireNouvelleVersion,
  BoutonValiderAttestation,
} from "./formulaire-piece";
import { FormulaireIdentite, BoutonArchiverPersonne } from "./formulaire-identite";
import {
  FormulaireMandat,
  FormulaireLigneMandat,
  BoutonsEtatMandat,
  BoutonRetirerLigne,
} from "./formulaire-mandat";
import { FormulaireInvitation } from "./formulaire-invitation";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";

export const metadata = { title: "Fiche personne — Gerimmo" };

export default async function PagePersonne(
  props: PageProps<"/agence/[orgId]/personnes/[personId]">
) {
  const { orgId, personId } = await props.params;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);

  const { data: personne } = await supabase
    .from("persons")
    .select("id, nom, prenom, email, telephone, date_naissance, account_id")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!personne) notFound();

  // Quatre lectures indépendantes — un seul aller-retour
  const [
    // Pièces courantes du dossier (versioning : seules les non remplacées)
    { data: pieces },
    // Versions antérieures (recette 13/08) : l'historique reste consultable —
    // on remonte la chaîne remplace_id de chaque pièce courante.
    { data: liensDossier },
    // Lots détenus par la personne (affichés sur la fiche, recette 14/08 —
    // et base des mandats)
    { data: detentions },
    // Mandats de la personne
    { data: mandats },
  ] = await Promise.all([
    supabase.rpc("dossier_personne", { p_person: personId }),
    supabase
      .from("document_liens")
      .select("document_id")
      .eq("organization_id", orgId)
      .eq("entite", "personne")
      .eq("entite_id", personId),
    supabase
      .from("detentions")
      .select("lot_id, quote_part, date_debut")
      .eq("organization_id", orgId)
      .eq("person_id", personId)
      .is("date_fin", null),
    supabase
      .from("mandats")
      .select("id, etat, date_rapport, seuil_delegation")
      .eq("organization_id", orgId)
      .eq("person_id", personId)
      .order("created_at"),
  ]);

  // Perf 30/08 : ce qui ne dépend que de la première vague part en parallèle
  // (documents du dossier, lots détenus avec leur bien, lignes de mandats,
  // lots déjà couverts) — 8 allers-retours en cascade sont devenus 3 vagues.
  const idsDossier = (liensDossier ?? []).map((l) => l.document_id);
  const lotIds = [...new Set((detentions ?? []).map((d) => d.lot_id))];
  const mandatIds = (mandats ?? []).map((m) => m.id);
  type LotAvecBien = { id: string; nom: string; bien_id: string; bien: UnOuPlusieurs<{ nom: string }> };
  const [{ data: tousDocs }, { data: lots }, { data: lignesCouvrantes }, { data: lignes }] =
    await Promise.all([
      idsDossier.length
        ? supabase.from("documents").select("id, titre, remplace_id, created_at").in("id", idsDossier)
        : Promise.resolve({ data: [] }),
      lotIds.length
        ? supabase
            .from("lots")
            .select("id, nom, bien_id, bien:biens!lots_bien_id_fkey(nom)")
            .in("id", lotIds)
        : Promise.resolve({ data: [] }),
      // Lots déjà couverts par un mandat non résilié (le sien ou celui d'un
      // co-détenteur) : inutile de les proposer, la base les refuserait (RM-5.1.3).
      lotIds.length
        ? supabase
            .from("mandat_lignes")
            .select("lot_id, mandat:mandats!inner(etat)")
            .eq("organization_id", orgId)
            .in("lot_id", lotIds)
            .is("date_fin", null)
        : Promise.resolve({ data: [] }),
      // Lignes des mandats
      mandatIds.length
        ? supabase
            .from("mandat_lignes")
            .select("id, mandat_id, lot_id, taux_honoraires, date_fin")
            .in("mandat_id", mandatIds)
        : Promise.resolve({ data: [] }),
    ]);
  type DocVersion = { id: string; titre: string | null; remplace_id: string | null; created_at: string };
  const docParId = new Map(((tousDocs ?? []) as DocVersion[]).map((d) => [d.id, d]));
  const versionsAnterieures = (documentId: string) => {
    const chaine: DocVersion[] = [];
    let courant = docParId.get(documentId);
    while (courant?.remplace_id && chaine.length < 50) {
      const precedent = docParId.get(courant.remplace_id);
      if (!precedent) break;
      chaine.push(precedent);
      courant = precedent;
    }
    return chaine;
  };

  const lotsDetenus = ((lots ?? []) as unknown as LotAvecBien[]);
  const lotsOptions = lotsDetenus.map((l) => ({
    id: l.id,
    libelle: `${premier(l.bien)?.nom ?? ""} · ${l.nom}`,
  }));
  const lotsCouverts = new Set(
    ((lignesCouvrantes ?? []) as { lot_id: string; mandat: UnOuPlusieurs<{ etat: string }> }[])
      .filter((l) => premier(l.mandat)?.etat !== "resilie")
      .map((l) => l.lot_id)
  );
  const lotsProposables = lotsOptions.filter((o) => !lotsCouverts.has(o.id));

  // Libellés des lots cités par les mandats — y compris ceux dont la détention
  // est close (un mandat résilié reste lisible : taux ET lots, recette 13/08).
  const lotsManquantsIds = [...new Set((lignes ?? []).map((l) => l.lot_id))].filter(
    (id) => !lotsOptions.some((o) => o.id === id)
  );
  const { data: lotsManquantsBrut } = lotsManquantsIds.length
    ? await supabase
        .from("lots")
        .select("id, nom, bien_id, bien:biens!lots_bien_id_fkey(nom)")
        .in("id", lotsManquantsIds)
    : { data: [] };
  const lotsManquants = ((lotsManquantsBrut ?? []) as unknown as LotAvecBien[]);
  const libelleLot = (id: string) => {
    const option = lotsOptions.find((l) => l.id === id);
    if (option) return option.libelle;
    const lot = lotsManquants.find((l) => l.id === id);
    return lot ? `${premier(lot.bien)?.nom ?? ""} · ${lot.nom}` : id.slice(0, 8);
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <Link
          href={`/agence/${orgId}/personnes`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Personnes
        </Link>
        <div className="mt-1 flex items-center gap-3">
          {/* Même avatar que la liste des personnes, en plus grand (46 px) */}
          <span aria-hidden className="avatar" style={{ width: 46, height: 46, fontSize: 14 }}>
            {initiales(personne.nom, personne.prenom)}
          </span>
          <div className="min-w-0">
            <h1>{nomComplet(personne)}</h1>
            <p className="text-sm text-muted-foreground">
              {[personne.email, personne.telephone].filter(Boolean).join(" · ") || "Aucun contact"}
              {personne.date_naissance ? ` · né(e) le ${formaterDate(personne.date_naissance)}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <FormulaireIdentite
            orgId={orgId}
            personId={personId}
            nom={personne.nom}
            prenom={personne.prenom}
            email={personne.email}
            telephone={personne.telephone}
            dateNaissance={personne.date_naissance}
          />
          <BoutonArchiverPersonne orgId={orgId} personId={personId} />
        </div>
      </div>

      {/* Détentions en cours : la fiche montre ce que la personne possède
          (recette 14/08 — l'assistant crée la détention, la fiche l'affiche) */}
      {(detentions ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lots détenus</CardTitle>
            <CardDescription>
              Les quote-parts se règlent sur la fiche du lot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {(detentions ?? []).map((d) => (
                <li key={d.lot_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{libelleLot(d.lot_id)}</span>
                  <span className="text-muted-foreground">
                    {Number(d.quote_part)} % · depuis le {formaterDate(d.date_debut)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Accès locataire : invitation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accès locataire</CardTitle>
          <CardDescription>
            Donnez à cette personne l&apos;accès à son espace (dépôt d&apos;attestation,
            suivi) via une invitation par email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireInvitation
            orgId={orgId}
            personId={personId}
            email={personne.email}
            dejaInvite={Boolean(personne.account_id)}
          />
        </CardContent>
      </Card>

      {/* Dossier : pièces versionnées */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pièces justificatives</CardTitle>
          <CardDescription>
            Les pièces suivent la personne dans l&apos;agence. Chaque nouveau dépôt
            d&apos;un même type crée une version — l&apos;ancienne est conservée.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(pieces ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune pièce déposée. Ajoutez ci-dessous les justificatifs (identité, revenus, assurance).</p>
          ) : (
            <ul className="divide-y divide-border">
              {(pieces ?? []).map(
                (p: {
                  document_id: string;
                  type: string;
                  titre: string | null;
                  expire_le: string | null;
                  verifie_le: string | null;
                }) => {
                  const anciennes = versionsAnterieures(p.document_id);
                  // Recette 21/08 : l'échéance de l'attestation est enfin
                  // visible côté agence, avec son état de vérification.
                  const echeancePiece = statutEcheancePiece(p.expire_le);
                  const estAttestation = p.type === "attestation_assurance";
                  return (
                    <li key={p.document_id} className="py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="badge-statut text-muted-foreground">
                          {TYPES_PIECE_DOSSIER[p.type] ?? p.type}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {p.titre || "Sans titre"}
                          {anciennes.length > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              v{anciennes.length + 1}
                            </span>
                          )}
                        </span>
                        {echeancePiece && (
                          <span className={`text-xs ${echeancePiece.classe}`}>
                            {echeancePiece.texte}
                          </span>
                        )}
                        {estAttestation &&
                          (p.verifie_le ? (
                            <span className="puce puce-loue">Validée</span>
                          ) : (
                            <span className="puce puce-prep">À vérifier</span>
                          ))}
                        <Link
                          href={`/agence/${orgId}/documents/${p.document_id}/fichier`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          Ouvrir
                        </Link>
                        {estAttestation && !p.verifie_le && (
                          <BoutonValiderAttestation
                            orgId={orgId}
                            personId={personId}
                            documentId={p.document_id}
                          />
                        )}
                      </div>
                      {anciennes.length > 0 && (
                        <details className="mt-1 pl-1 text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            Historique — {anciennes.length} version
                            {anciennes.length > 1 ? "s" : ""} antérieure
                            {anciennes.length > 1 ? "s" : ""} (conservée
                            {anciennes.length > 1 ? "s" : ""})
                          </summary>
                          <ul className="mt-1 space-y-0.5 pl-3">
                            {anciennes.map((v) => (
                              <li key={v.id}>
                                {v.titre || "Sans titre"} — déposée le{" "}
                                {formaterDate(v.created_at)} ·{" "}
                                <Link
                                  href={`/agence/${orgId}/documents/${v.id}/fichier`}
                                  className="underline underline-offset-2"
                                >
                                  ouvrir
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <details className="mt-1 pl-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">
                          Déposer une nouvelle version
                        </summary>
                        <FormulaireNouvelleVersion
                          orgId={orgId}
                          personId={personId}
                          remplaceId={p.document_id}
                          type={p.type}
                          titre={p.titre}
                        />
                      </details>
                    </li>
                  );
                }
              )}
            </ul>
          )}
          <FormulairePiece orgId={orgId} personId={personId} />
        </CardContent>
      </Card>

      {/* Mandats de gestion — un propriétaire direct n'en signe pas (S9a) */}
      {!estProprietaire && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mandats de gestion</CardTitle>
          <CardDescription>
            Un mandat porte sur des lots détenus par cette personne — chaque lot
            avec son propre taux d&apos;honoraires (défaut 7 %).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(mandats ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mandat de gestion. C&apos;est lui qui autorise l&apos;agence à gérer les lots de ce propriétaire et fixe les honoraires.</p>
          ) : (
            (mandats ?? []).map((m) => {
              const sesLignes = (lignes ?? []).filter((l) => l.mandat_id === m.id);
              // Un mandat résilié est historisé (recette 13/08) : grisé, plus
              // aucune action — le taux et les lots restent lisibles.
              const historise = m.etat === "resilie";
              return (
                <div
                  key={m.id}
                  className={`border border-border p-3 ${historise ? "bg-muted opacity-70" : ""}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={COULEURS_ETAT_MANDAT[m.etat] ?? "puce puce-grise"}>
                        {ETATS_MANDAT[m.etat] ?? m.etat}
                      </span>
                      {historise && (
                        <span className="text-xs text-muted-foreground">
                          Historisé — non modifiable
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        Rapport le {m.date_rapport} · seuil{" "}
                        {m.seuil_delegation ? `${m.seuil_delegation} €` : "500 € (défaut agence)"}
                      </span>
                    </div>
                    {!historise && (
                      <BoutonsEtatMandat
                        orgId={orgId}
                        personId={personId}
                        mandatId={m.id}
                        etat={m.etat}
                        nbLignesActives={sesLignes.filter((l) => !l.date_fin).length}
                      />
                    )}
                  </div>
                  {sesLignes.length > 0 && (
                    <ul className="mb-2 space-y-1 text-sm">
                      {sesLignes.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2">
                          <span>{libelleLot(l.lot_id)}</span>
                          <span className="flex items-center gap-2 text-muted-foreground">
                            {l.taux_honoraires} %{l.date_fin ? " (clos)" : ""}
                            {m.etat === "brouillon" && !l.date_fin && (
                              <BoutonRetirerLigne
                                orgId={orgId}
                                personId={personId}
                                mandatId={m.id}
                                ligneId={l.id}
                              />
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Recette 21/08 : les lots et taux se composent en brouillon
                      — signé, le mandat affiche le contenu du contrat, figé. */}
                  {m.etat === "brouillon" ? (
                    <FormulaireLigneMandat
                      orgId={orgId}
                      personId={personId}
                      mandatId={m.id}
                      lots={lotsProposables}
                      nbLotsDetenus={lotsOptions.length}
                    />
                  ) : (
                    !historise && (
                      <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                        Lots et taux figés — ils sont ceux du contrat signé.
                      </p>
                    )
                  )}
                </div>
              );
            })
          )}
          <FormulaireMandat orgId={orgId} personId={personId} />
        </CardContent>
      </Card>
      )}
    </main>
  );
}
