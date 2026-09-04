import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eur } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { Card, CardContent } from "@/components/ui/card";
import { IndicateurLien } from "@/components/ui/indicateur-lien";

// « Ce qui vient de se passer » (maquette v3) : les derniers événements du
// portefeuille, tirés des tables métier elles-mêmes — un encaissement, un
// état des lieux signé, un rapport envoyé, un incident déclaré.

type Evenement = {
  cle: string;
  ts: string;
  titre: string;
  detail: string;
  initiales: string;
  href: string;
};

type PersonneCourte = { nom: string; prenom: string | null };
type BailEmbed = UnOuPlusieurs<{
  id: string;
  locataire: UnOuPlusieurs<PersonneCourte>;
  lot: UnOuPlusieurs<{ nom: string }>;
}>;

const initialesDe = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join("") || "◇";

// Moins de 24 h : l'événement porte la pastille « Nouveau »
const estRecent = (ts: string) => Date.now() - new Date(ts).getTime() < 24 * 3600000;

function tempsRelatif(ts: string): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 3600000));
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  if (h < 48) return "hier";
  return `il y a ${Math.round(h / 24)} j`;
}

export async function FilActivite({
  supabase,
  orgId,
}: {
  supabase: SupabaseClient;
  orgId: string;
}) {
  const [{ data: encaissements }, { data: edls }, { data: rapports }, { data: incidents }] =
    await Promise.all([
      supabase
        .from("encaissements")
        .select(
          "id, montant, created_at, bail:baux!encaissements_bail_id_fkey(id, locataire:persons!baux_locataire_meme_org_fk(nom, prenom), lot:lots!baux_lot_meme_org_fk(nom))"
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("etats_des_lieux")
        .select(
          "id, type, signe_le, bail:baux!edl_bail_meme_org_fk(id, locataire:persons!baux_locataire_meme_org_fk(nom, prenom), lot:lots!baux_lot_meme_org_fk(nom))"
        )
        .eq("organization_id", orgId)
        .not("signe_le", "is", null)
        .order("signe_le", { ascending: false })
        .limit(3),
      supabase
        .from("rapports_gestion")
        .select("id, mois, envoye_le, net, mandat:mandats(person:persons(nom, prenom))")
        .eq("organization_id", orgId)
        .not("envoye_le", "is", null)
        .order("envoye_le", { ascending: false })
        .limit(3),
      supabase
        .from("incidents")
        .select("id, numero, categorie, description, created_at, lot:lots!incidents_lot_meme_org_fk(nom)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  const evenements: Evenement[] = [];

  for (const e of (encaissements ?? []) as {
    id: string;
    montant: number;
    created_at: string;
    bail: BailEmbed;
  }[]) {
    const bail = premier(e.bail);
    const loc = bail ? premier(bail.locataire) : null;
    const lot = bail ? premier(bail.lot) : null;
    const nom = loc ? nomComplet(loc) : "Un locataire";
    evenements.push({
      cle: `enc-${e.id}`,
      ts: e.created_at,
      titre: `${nom} a réglé ${eur(Number(e.montant))}`,
      detail: `${lot?.nom ?? "Lot"} · encaissement imputé, quittance au solde`,
      initiales: initialesDe(nom),
      href: bail ? `/agence/${orgId}/baux/${bail.id}` : `/agence/${orgId}/comptabilite`,
    });
  }

  for (const e of (edls ?? []) as {
    id: string;
    type: string;
    signe_le: string;
    bail: BailEmbed;
  }[]) {
    const bail = premier(e.bail);
    const loc = bail ? premier(bail.locataire) : null;
    const lot = bail ? premier(bail.lot) : null;
    const nom = loc ? nomComplet(loc) : "—";
    evenements.push({
      cle: `edl-${e.id}`,
      ts: e.signe_le,
      titre: `État des lieux ${e.type === "sortie" ? "de sortie" : "d'entrée"} signé — ${nom}`,
      detail:
        e.type === "sortie"
          ? `${lot?.nom ?? "Lot"} · le décompte de restitution peut se préparer`
          : `${lot?.nom ?? "Lot"} · grille figée, annexée au bail`,
      initiales: initialesDe(nom),
      href: bail ? `/agence/${orgId}/baux/${bail.id}/edl/${e.id}` : `/agence/${orgId}/parc`,
    });
  }

  for (const r of (rapports ?? []) as {
    id: string;
    mois: string;
    envoye_le: string;
    net: number | null;
    mandat: UnOuPlusieurs<{ person: UnOuPlusieurs<PersonneCourte> }>;
  }[]) {
    const mandat = premier(r.mandat);
    const mandant = mandat ? premier(mandat.person) : null;
    const nom = mandant ? nomComplet(mandant) : "un mandant";
    const mois = new Date(r.mois).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    evenements.push({
      cle: `rap-${r.id}`,
      ts: r.envoye_le,
      titre: `Rapport de gestion de ${mois} envoyé à ${nom}`,
      detail:
        r.net != null ? `Versement de ${eur(Number(r.net))} à enregistrer` : "Versement à suivre",
      initiales: initialesDe(nom),
      href: `/agence/${orgId}/comptabilite`,
    });
  }

  for (const i of (incidents ?? []) as {
    id: string;
    numero: string;
    categorie: string;
    description: string;
    created_at: string;
    lot: UnOuPlusieurs<{ nom: string }>;
  }[]) {
    const lot = premier(i.lot);
    evenements.push({
      cle: `inc-${i.id}`,
      ts: i.created_at,
      titre: `Incident déclaré — ${i.description.length > 60 ? `${i.description.slice(0, 57)}…` : i.description}`,
      detail: `${i.numero} · ${lot?.nom ?? "lot"}`,
      initiales: "⚠",
      href: `/agence/${orgId}/incidents/${i.id}`,
    });
  }

  const recents = evenements
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, 5);
  if (recents.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <div className="entete-carte">
          <h3 className="text-[1.05rem]">Ce qui vient de se passer</h3>
          <span className="mono-discret">En direct</span>
        </div>
        <div className="divide-y divide-border">
          {recents.map((e) => (
            <Link key={e.cle} href={e.href} className="rang !border-l-0 !px-0">
              <span className="avatar shrink-0">{e.initiales}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-medium">{e.titre}</b>
                <span className="block truncate text-xs text-muted-foreground">{e.detail}</span>
              </span>
              {estRecent(e.ts) && (
                <span className="puce puce-rouge shrink-0">Nouveau</span>
              )}
              <span className="mono-discret shrink-0 whitespace-nowrap">
                {tempsRelatif(e.ts).toUpperCase()}
              </span>
              <IndicateurLien />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
