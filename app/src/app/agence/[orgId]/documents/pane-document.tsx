import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  TYPES_DOCUMENT,
  dureeConservation,
  estARenouveler,
  formaterDate,
  visibiliteDocument,
} from "@/lib/ged";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { formaterTaille } from "@/lib/file-type";
import { nomComplet } from "@/lib/roles-personnes";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { Card, CardContent } from "@/components/ui/card";
import { ActionsDocument } from "./actions-document";
import { FormulaireRemplacer } from "./formulaire-remplacer";
import { FormulaireRattacher, type FichesRattachables } from "./formulaire-rattacher";

type Lien = { entite: string; entite_id: string };

type Doc = {
  id: string;
  type: string;
  titre: string | null;
  mime_type: string | null;
  taille_octets: number | null;
  created_at: string;
  expire_le: string | null;
  verifie_le: string | null;
  purged_at: string | null;
  remplace_id: string | null;
  liens: Lien[];
};

// La fiche d'une pièce, affichée dans la vue scindée (maquette pageDocument) :
// aperçu, rattachements, cycle de vie, remplacement avec historique.
// Composant serveur : il fait ses propres requêtes, comme le dossier incident.
export async function PaneDocument({
  orgId,
  documentId,
  lienFermer,
}: {
  orgId: string;
  documentId: string;
  lienFermer: string;
}) {
  const supabase = await createClient();

  const { data: docBrut } = await supabase
    .from("documents")
    .select(
      "id, type, titre, mime_type, taille_octets, created_at, expire_le, verifie_le, purged_at, remplace_id, liens:document_liens(entite, entite_id)"
    )
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const doc = docBrut as Doc | null;

  if (!doc) {
    return (
      <div className="vide">
        <p className="font-medium">Pièce introuvable.</p>
        <Link
          href={lienFermer}
          className="mt-1 inline-block text-sm text-[var(--bleu)] underline-offset-2 hover:underline"
        >
          Revenir à la vue d&apos;ensemble
        </Link>
      </div>
    );
  }

  // La version qui remplace celle-ci (si la pièce n'est plus courante), la
  // chaîne des versions antérieures, la règle de conservation, et les fiches
  // rattachables pour le formulaire — en parallèle.
  const [{ data: remplaceePar }, { data: regle }, { data: personnes }, { data: lots }, { data: bauxBruts }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id, titre, created_at")
        .eq("organization_id", orgId)
        .eq("remplace_id", doc.id)
        .maybeSingle(),
      supabase
        .from("retention_rules")
        .select("duree_mois, declencheur")
        .eq("data_type", `document:${doc.type}`)
        .maybeSingle(),
      supabase
        .from("persons")
        .select("id, nom, prenom")
        .eq("organization_id", orgId)
        .is("archived_at", null)
        .order("nom"),
      supabase
        .from("lots")
        .select("id, nom")
        .eq("organization_id", orgId)
        .order("nom"),
      supabase
        .from("baux")
        .select("id, etat, date_debut, locataire_principal, lot:lots(nom)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  // Versions antérieures : remonter la chaîne remplace_id (bornée — une pièce
  // se remplace rarement plus de quelques fois)
  const anterieures: { id: string; titre: string | null; created_at: string; purged_at: string | null }[] = [];
  let curseur = doc.remplace_id;
  for (let i = 0; curseur && i < 5; i++) {
    const { data: version } = await supabase
      .from("documents")
      .select("id, titre, created_at, purged_at, remplace_id")
      .eq("id", curseur)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!version) break;
    anterieures.push(version);
    curseur = version.remplace_id;
  }

  const nomsPersonnes = new Map((personnes ?? []).map((p) => [p.id, nomComplet(p)]));
  const nomsLots = new Map((lots ?? []).map((l) => [l.id, l.nom]));
  const baux = (bauxBruts ?? []) as {
    id: string;
    etat: string;
    date_debut: string | null;
    locataire_principal: string | null;
    lot: UnOuPlusieurs<{ nom: string }>;
  }[];
  const libelleBail = (b: (typeof baux)[number]) => {
    const morceaux = [`Bail ${premier(b.lot)?.nom ?? ""}`.trim()];
    if (b.locataire_principal && nomsPersonnes.has(b.locataire_principal)) {
      morceaux.push(nomsPersonnes.get(b.locataire_principal)!);
    } else if (b.date_debut) {
      morceaux.push(formaterDate(b.date_debut));
    }
    return morceaux.join(" · ");
  };
  const nomsBaux = new Map(baux.map((b) => [b.id, libelleBail(b)]));

  // Les numéros des incidents rattachés, seulement s'il y en a
  const idsIncidents = doc.liens.filter((l) => l.entite === "incident").map((l) => l.entite_id);
  const nomsIncidents = new Map<string, string>();
  if (idsIncidents.length > 0) {
    const { data: incidents } = await supabase
      .from("incidents")
      .select("id, numero")
      .in("id", idsIncidents);
    for (const i of incidents ?? []) nomsIncidents.set(i.id, `Incident ${i.numero}`);
  }

  const libelleLien = (l: Lien): string => {
    switch (l.entite) {
      case "organisation":
        return "Agence";
      case "personne":
        return nomsPersonnes.get(l.entite_id) ?? "Personne";
      case "lot":
        return `Lot ${nomsLots.get(l.entite_id) ?? ""}`.trim();
      case "bail":
        return nomsBaux.get(l.entite_id) ?? "Bail";
      case "incident":
        return nomsIncidents.get(l.entite_id) ?? "Incident";
      case "mandat":
        return "Mandat";
      default:
        return l.entite;
    }
  };

  const fiches: FichesRattachables = {
    personnes: (personnes ?? []).map((p) => ({ id: p.id, libelle: nomComplet(p) })),
    lots: (lots ?? []).map((l) => ({ id: l.id, libelle: l.nom })),
    baux: baux.map((b) => ({ id: b.id, libelle: libelleBail(b) })),
  };

  if (doc.purged_at) {
    return (
      <div className="space-y-3.5">
        <div className="entete-page">
          <div>
            <span className="eyebrow">
              {(TYPES_DOCUMENT[doc.type] ?? doc.type).toUpperCase()} · DÉPOSÉE LE{" "}
              {formaterDate(doc.created_at)}
            </span>
            <h2 className="mt-0.5 text-lg font-medium">{doc.titre ?? "Pièce purgée"}</h2>
          </div>
        </div>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">
              Document purgé le {formaterDate(doc.purged_at)} en application de sa
              règle de conservation (RGPD). Seule cette fiche de traçabilité
              subsiste.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fichier = `/agence/${orgId}/documents/${doc.id}/fichier`;
  const aRenouveler = estARenouveler(doc.expire_le);

  return (
    <div className="space-y-3.5">
      {remplaceePar && (
        <div className="rounded-lg border border-warning-soft bg-warning-soft/40 p-3 text-sm">
          Cette version a été remplacée le {formaterDate(remplaceePar.created_at)}.{" "}
          <Link
            href={`${lienFermer}${lienFermer.includes("?") ? "&" : "?"}sel=${remplaceePar.id}`}
            className="inline-flex items-center gap-1.5 text-[var(--bleu)] underline-offset-2 hover:underline"
          >
            Ouvrir la version courante
            <IndicateurLien />
          </Link>
        </div>
      )}

      <div className="entete-page">
        <div>
          <span className="eyebrow">
            {(TYPES_DOCUMENT[doc.type] ?? doc.type).toUpperCase()} · DÉPOSÉE LE{" "}
            {formaterDate(doc.created_at)}
          </span>
          <h2 className="font-heading mt-0.5 text-xl font-semibold text-[var(--encre)]">
            {doc.titre ?? "Sans titre"}
          </h2>
        </div>
        <span className={`puce ${aRenouveler ? "puce-rouge" : "puce-grise"}`}>
          {aRenouveler ? "à renouveler" : dureeConservation(regle?.duree_mois)}
        </span>
      </div>

      {/* Aperçu — servi par la route /fichier : droits revérifiés, accès tracé */}
      {doc.mime_type?.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fichier}
          alt={`Aperçu — ${doc.titre ?? "pièce"}`}
          className="max-h-96 w-full border border-border bg-[var(--ardoise)] object-contain"
        />
      ) : (
        <iframe
          src={fichier}
          title={`Aperçu — ${doc.titre ?? "pièce"}`}
          className="h-96 w-full border border-border bg-[var(--ardoise)]"
        />
      )}

      <div className="deux-col">
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-base font-medium">Rattachements</h3>
            <p className="mt-1.5 mb-3 text-sm text-muted-foreground">
              Cette pièce apparaît sur chacune de ces fiches. Elle n&apos;est
              stockée qu&apos;une fois.
            </p>
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              {doc.liens.map((l) => (
                <span key={`${l.entite}-${l.entite_id}`} className="puce puce-encre">
                  {libelleLien(l)}
                </span>
              ))}
            </div>
            <FormulaireRattacher orgId={orgId} documentId={doc.id} fiches={fiches} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-2 text-base font-medium">Cycle de vie</h3>
            <div className="ligne-info">
              <span>Type</span>
              <span>{TYPES_DOCUMENT[doc.type] ?? doc.type}</span>
            </div>
            <div className="ligne-info">
              <span>Conservation</span>
              <span>
                {regle
                  ? `${dureeConservation(regle.duree_mois)} — ${regle.declencheur.toLowerCase()}`
                  : "—"}
              </span>
            </div>
            <div className="ligne-info">
              <span>Visible par</span>
              <span>{visibiliteDocument(doc.type)}</span>
            </div>
            {doc.taille_octets != null && (
              <div className="ligne-info">
                <span>Taille</span>
                <span>{formaterTaille(doc.taille_octets)}</span>
              </div>
            )}
            {doc.expire_le && (
              <div className="ligne-info">
                <span>Expire le</span>
                <span>{formaterDate(doc.expire_le)}</span>
              </div>
            )}
            {doc.verifie_le && (
              <div className="ligne-info">
                <span>Validée le</span>
                <span>{formaterDate(doc.verifie_le)}</span>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-start gap-2">
              <ActionsDocument orgId={orgId} documentId={doc.id} titre={doc.titre} />
              {!remplaceePar && (
                <FormulaireRemplacer
                  orgId={orgId}
                  documentId={doc.id}
                  expireLe={doc.expire_le}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {anterieures.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-2 text-base font-medium">Versions antérieures</h3>
            <ul className="divide-y divide-border text-sm">
              {anterieures.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {v.titre ?? "Sans titre"}
                    <small className="ml-2 text-muted-foreground">
                      déposée le {formaterDate(v.created_at)}
                      {v.purged_at ? " · purgée" : ""}
                    </small>
                  </span>
                  {!v.purged_at && (
                    <Link
                      href={`${lienFermer}${lienFermer.includes("?") ? "&" : "?"}sel=${v.id}`}
                      aria-label={`Ouvrir la version « ${v.titre ?? "sans titre"} » du ${formaterDate(v.created_at)}`}
                      className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--bleu)] underline-offset-2 hover:underline"
                    >
                      Ouvrir
                      <IndicateurLien />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
