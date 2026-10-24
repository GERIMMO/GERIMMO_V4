/**
 * Plan de conformité du 23/10/2026, R49 : l'archive complète d'un espace (lib/zip.ts, lib/export-complet*.ts, route
 * /agence/[orgId]/export-complet). Sans base : la base, le stockage et la session sont des doublures. Aucune adresse réelle.
 */
import { crc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { creerZip, nomZipSur } from "../src/lib/zip";
import { celluleCsv, tableEnCsv, construireExportComplet, lienExportComplet, supprimerExportsExpires, TAILLE_MAX_EXPORT_OCTETS } from "../src/lib/export-complet-serveur";
import { identiteRecenteConfirmee } from "../src/lib/export-complet";

/** Relit une archive ZIP par son répertoire central : noms, contenus, sommes de contrôle vérifiées. */
function lireZip(zip: Buffer): Map<string, Buffer> {
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(fin).toBeGreaterThan(-1);
  const nombre = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  const entrees = new Map<string, Buffer>();
  for (let i = 0; i < nombre; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const methode = zip.readUInt16LE(p + 10);
    const somme = zip.readUInt32LE(p + 16);
    const taille = zip.readUInt32LE(p + 20);
    const longueurNom = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const nom = zip.subarray(p + 46, p + 46 + longueurNom).toString("utf8");
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const donnees = zip.subarray(debut, debut + taille);
    const brut = methode === 8 ? inflateRawSync(donnees) : Buffer.from(donnees);
    expect(crc32(brut) >>> 0).toBe(somme);
    entrees.set(nom, brut);
    p += 46 + longueurNom + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return entrees;
}

describe("archive ZIP et CSV", () => {
  it("une archive relisible : noms UTF-8, contenus compressés ou rangés, sommes de contrôle justes", () => {
    const binaire = new Uint8Array([0, 255, 1, 2, 3]);
    const zip = creerZip([{ nom: "LISEZ-MOI.txt", contenu: "Données « personnelles » ".repeat(50) }, { nom: "fichiers/pièce.pdf", contenu: binaire }]);
    const lu = lireZip(zip);
    expect([...lu.keys()]).toEqual(["LISEZ-MOI.txt", "fichiers/pièce.pdf"]);
    expect(lu.get("LISEZ-MOI.txt")!.toString("utf8")).toBe("Données « personnelles » ".repeat(50));
    expect([...lu.get("fichiers/pièce.pdf")!]).toEqual([0, 255, 1, 2, 3]);
  });

  it("aucun nom d'entrée ne sort de l'archive (« .. », racine, barres inverses)", () => {
    expect(nomZipSur("../../etc/passwd")).toBe("etc/passwd");
    expect(nomZipSur("/abs\\chemin/./x.pdf")).toBe("abs/chemin/x.pdf");
    expect(() => nomZipSur("../")).toThrow();
  });

  it("CSV : texte protégé contre les formules, nombres négatifs intacts, guillemets et objets", () => {
    expect(celluleCsv("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(celluleCsv(-780.5)).toBe("-780.5");
    expect(celluleCsv(null)).toBe("");
    expect(celluleCsv({ a: 1 })).toBe('"{""a"":1}"');
    expect(celluleCsv("ligne;deux")).toBe("\"ligne;deux\"");
    const csv = tableEnCsv([{ id: "1", nom: "Dupont" }, { id: "2", ville: "Paris" }]);
    expect(csv).toBe("﻿id;nom;ville\r\n1;Dupont;\r\n2;;Paris\r\n");
  });

  it("identité confirmée : second facteur, ou mot de passe saisi depuis moins de quinze minutes", () => {
    const maintenant = Date.UTC(2026, 9, 24, 10, 0, 0);
    const s = Math.floor(maintenant / 1000);
    expect(identiteRecenteConfirmee({ aal: "aal2" }, maintenant)).toBe(true);
    expect(identiteRecenteConfirmee({ aal: "aal1", amr: [{ method: "password", timestamp: s - 600 }] }, maintenant)).toBe(true);
    expect(identiteRecenteConfirmee({ aal: "aal1", amr: [{ method: "password", timestamp: s - 1000 }] }, maintenant)).toBe(false);
    expect(identiteRecenteConfirmee({ aal: "aal1", amr: [{ method: "otp", timestamp: s - 10 }] }, maintenant)).toBe(false);
    expect(identiteRecenteConfirmee({ aal: "aal1", amr: [{ method: "password", timestamp: s + 3600 }] }, maintenant)).toBe(false);
    expect(identiteRecenteConfirmee(null, maintenant)).toBe(false);
  });
});

const ORG = "44444444-4444-4444-8444-444444444444";
const EXPORT = "55555555-5555-4555-8555-555555555555";
const COMPTE = "66666666-6666-4666-8666-666666666666";

function fausseBase(o: { prise?: boolean; fichiers?: { chemin: string; taille: number }[]; ligne?: Record<string, unknown>; titulaire?: boolean } = {}) {
  const rpc: { nom: string; args: Record<string, unknown> }[] = [];
  const depots: { compartiment: string; chemin: string; contenu: Buffer }[] = [];
  const retraits: string[][] = [];
  const signatures: { chemin: string; duree: number }[] = [];
  const ligne = o.ligne ?? { id: EXPORT, organisation_id_export: ORG, demande_par: COMPTE, statut: "en_cours" };
  const db = {
    rpc: async (nom: string, args: Record<string, unknown>) => {
      rpc.push({ nom, args });
      if (nom === "prendre_export_complet") return { data: o.prise ?? true, error: null };
      if (nom === "export_complet_donnees") return { data: {
        organizations: [{ id: ORG, name: "Espace d'essai" }],
        persons: [{ id: "p1", nom: "=Locataire", email: "locataire@example.invalid" }],
        documents: [{ id: "d1", type: "piece_identite", storage_path: `${ORG}/pieces/p.pdf` }, { id: "d2", type: "bail", storage_path: `${ORG}/bail.pdf` }],
      }, error: null };
      if (nom === "export_complet_compte") return { data: { compte: { id: COMPTE, email: "titulaire@example.invalid" }, acceptations_conditions: [] }, error: null };
      if (nom === "export_complet_fichiers") return { data: o.fichiers ?? [{ chemin: `${ORG}/pieces/p.pdf`, taille: 3 }], error: null };
      if (nom === "exports_complets_a_supprimer") return { data: [{ id: EXPORT, chemin: `${ORG}/${EXPORT}.zip` }], error: null };
      return { data: null, error: null };
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q, eq: () => q, in: () => q, limit: () => q,
        single: async () => ({ data: table === "exports_complets" ? ligne : null, error: null }),
        maybeSingle: async () => ({ data: o.titulaire === false ? null : { id: "m1" }, error: null }),
      });
      return q;
    },
    storage: {
      from: (compartiment: string) => ({
        download: async (chemin: string) => ({ data: new Blob([new Uint8Array([7, 8, 9])]), error: chemin ? null : { message: "x" } }),
        upload: async (chemin: string, contenu: Buffer) => { depots.push({ compartiment, chemin, contenu }); return { data: {}, error: null }; },
        remove: async (chemins: string[]) => { retraits.push(chemins); return { data: [], error: null }; },
        createSignedUrl: async (chemin: string, duree: number) => { signatures.push({ chemin, duree }); return { data: { signedUrl: "https://stockage.example.invalid/signe" }, error: null }; },
      }),
    },
  };
  return { db: db as never, rpc, depots, retraits, signatures };
}

describe("préparation de l'archive", () => {
  it("un CSV par table, le compte, tous les fichiers ; déposée dans le compartiment privé ; pièces sensibles relevées", async () => {
    const b = fausseBase();
    expect(await construireExportComplet(b.db, EXPORT)).toMatchObject({ ok: true, fichiers: 1, tables: 3 });
    expect(b.depots).toHaveLength(1);
    expect(b.depots[0]).toMatchObject({ compartiment: "exports-complets", chemin: `${ORG}/${EXPORT}.zip` });
    const lu = lireZip(b.depots[0].contenu);
    expect([...lu.keys()].sort()).toEqual(["LISEZ-MOI.txt", "compte.json", "donnees/documents.csv", "donnees/organizations.csv", "donnees/persons.csv", "fichiers/pieces/p.pdf"]);
    expect([...lu.get("fichiers/pieces/p.pdf")!]).toEqual([7, 8, 9]);
    expect(lu.get("donnees/persons.csv")!.toString("utf8")).toContain("'=Locataire");
    const fin = b.rpc.find((r) => r.nom === "terminer_export_complet")!.args;
    expect(fin).toMatchObject({ p_export: EXPORT, p_fichiers: 1, p_tables: 3, p_pieces: ["d1"], p_erreur: null });
    expect(fin.p_empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it("déjà prise par une autre passe : rien ; trop volumineuse : échec écrit, rien de déposé", async () => {
    const prise = fausseBase({ prise: false });
    expect(await construireExportComplet(prise.db, EXPORT)).toBeNull();
    expect(prise.rpc.map((r) => r.nom)).toEqual(["prendre_export_complet"]);
    const grosse = fausseBase({ fichiers: [{ chemin: `${ORG}/video.mp4`, taille: TAILLE_MAX_EXPORT_OCTETS + 1 }] });
    expect(await construireExportComplet(grosse.db, EXPORT)).toMatchObject({ ok: false });
    expect(grosse.depots).toEqual([]);
    expect(grosse.rpc.find((r) => r.nom === "terminer_export_complet")!.args.p_erreur).toMatch(/400 Mo/);
  });

  it("ménage : l'archive de plus de sept jours est retirée du stockage, puis marquée", async () => {
    const b = fausseBase();
    expect(await supprimerExportsExpires(b.db, async () => {})).toEqual({ supprimes: 1, echecs: 0 });
    expect(b.retraits).toEqual([[`${ORG}/${EXPORT}.zip`]]);
    expect(b.rpc.find((r) => r.nom === "export_complet_supprime")!.args).toEqual({ p_export: EXPORT });
  });
});

describe("lien de téléchargement", () => {
  const prete = { chemin: `${ORG}/${EXPORT}.zip`, statut: "pret", demande_par: COMPTE, organisation_id_export: ORG, expire_le: new Date(Date.now() + 86_400_000).toISOString() };

  it("pour le seul demandeur, toujours titulaire de l'espace : journalisé, puis lien signé de 24 h", async () => {
    const b = fausseBase({ ligne: prete });
    expect(await lienExportComplet(b.db, { exportId: EXPORT, accountId: COMPTE, orgId: ORG })).toEqual({ url: "https://stockage.example.invalid/signe" });
    expect(b.rpc.find((r) => r.nom === "export_complet_telecharge")!.args).toEqual({ p_export: EXPORT, p_account: COMPTE });
    expect(b.signatures).toEqual([{ chemin: `${ORG}/${EXPORT}.zip`, duree: 86_400 }]);
  });

  it("refus : autre compte, autre espace, plus titulaire, archive expirée — et rien n'est journalisé ni signé", async () => {
    for (const [cas, base, p] of [
      ["autre compte", fausseBase({ ligne: prete }), { exportId: EXPORT, accountId: ORG, orgId: ORG }],
      ["autre espace", fausseBase({ ligne: prete }), { exportId: EXPORT, accountId: COMPTE, orgId: EXPORT }],
      ["plus titulaire", fausseBase({ ligne: prete, titulaire: false }), { exportId: EXPORT, accountId: COMPTE, orgId: ORG }],
      ["expirée", fausseBase({ ligne: { ...prete, expire_le: new Date(Date.now() - 1000).toISOString() } }), { exportId: EXPORT, accountId: COMPTE, orgId: ORG }],
    ] as const) {
      expect(await lienExportComplet(base.db, p), cas).toHaveProperty("erreur");
      expect(base.signatures, cas).toEqual([]);
      expect(base.rpc.some((r) => r.nom === "export_complet_telecharge"), cas).toBe(false);
    }
  });
});
