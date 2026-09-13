// Fabrique le kit de test : faux documents en PDF et fausses photos.
//
// TOUT CE QUI SORT D'ICI EST MARQUÉ « SPÉCIMEN » EN GRAND, EN TRAVERS, SUR
// CHAQUE PAGE. Ce sont des pièces de recette : elles servent à éprouver les
// écrans de dépôt, la GED, les alertes de pièce expirée. Elles ne doivent
// ressembler à un document officiel ni de près ni de loin — les numéros sont
// volontairement hors format, et chaque page porte la mention « document
// fictif, sans valeur légale ». Un jeu de test qui pourrait passer pour une
// vraie pièce d'identité serait un jeu de test dangereux.
//
//   node kit-de-test/fabriquer.mjs
//
// Dépend du Chromium déjà installé pour Playwright.

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.join(process.cwd(), "kit-de-test");
const DOCS = path.join(RACINE, "documents");
const PHOTOS = path.join(RACINE, "photos");

const STYLE = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: "DejaVu Sans", Arial, sans-serif; color: #1b2430;
    font-size: 12px; line-height: 1.5; position: relative; background: #fff;
  }
  .page { padding: 28mm 22mm; min-height: 297mm; position: relative; overflow: hidden; }
  .filigrane {
    position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center; pointer-events: none;
  }
  .filigrane span {
    transform: rotate(-32deg); font-size: 86px; font-weight: 800; letter-spacing: 10px;
    color: rgba(200, 40, 40, 0.13); white-space: nowrap;
  }
  .avertissement {
    border: 2px solid #c22; background: #fdecec; color: #8a1c1c;
    padding: 10px 14px; font-weight: 700; margin-bottom: 22px; font-size: 12.5px;
  }
  h1 { font-size: 21px; margin: 0 0 2px; }
  .sous { color: #5b6672; margin: 0 0 22px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th, td { border: 1px solid #c9d1d9; padding: 7px 9px; text-align: left; vertical-align: top; }
  th { background: #eef2f6; width: 42%; font-weight: 600; }
  .total td { background: #eef2f6; font-weight: 700; }
  .pied {
    position: absolute; left: 22mm; right: 22mm; bottom: 16mm;
    border-top: 1px solid #c9d1d9; padding-top: 8px; color: #6b7684; font-size: 10.5px;
  }
  .encadre { border: 1px solid #c9d1d9; padding: 12px 14px; margin: 14px 0; background: #f7f9fb; }
  .grille2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  .etiq { color: #6b7684; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }
  .val { font-weight: 600; }
`;

function page(titre, sousTitre, corps) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLE}</style></head>
  <body><div class="page">
    <div class="filigrane"><span>SPÉCIMEN</span></div>
    <div class="avertissement">
      DOCUMENT FICTIF — SANS VALEUR LÉGALE. Pièce de recette Gerimmo, fabriquée
      pour éprouver les écrans. Toute personne, société ou référence y figurant
      est inventée.
    </div>
    <h1>${titre}</h1>
    <p class="sous">${sousTitre}</p>
    ${corps}
    <div class="pied">
      Gerimmo — jeu de recette · document fictif · aucune valeur probante ·
      ne pas diffuser hors des essais
    </div>
  </div></body></html>`;
}

const ligne = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;

// ── Les trois dossiers locataires ────────────────────────────────────────
const LOCATAIRES = [
  {
    cle: "moreau-sofia",
    civilite: "Madame", prenom: "Sofia", nom: "MOREAU",
    naissance: "14/03/1991", lieuNaissance: "Lyon (69)",
    nationalite: "Française",
    adresse: "8 rue des Capucines, 69003 Lyon",
    emploi: "Chargée de clientèle", employeur: "Librairie du Rhône",
    contrat: "CDI depuis le 02/05/2022",
    brut: "2 480,00", net: "1 932,00",
    iban: "FR76 9999 9999 9999 9999 9999 991",
    revenuFiscal: "21 640",
  },
  {
    cle: "benali-karim",
    civilite: "Monsieur", prenom: "Karim", nom: "BENALI",
    naissance: "27/09/1986", lieuNaissance: "Marseille (13)",
    nationalite: "Française",
    adresse: "22 boulevard Ney, 13005 Marseille",
    emploi: "Technicien de maintenance", employeur: "Atelier Sud Technique",
    contrat: "CDI depuis le 15/01/2019",
    brut: "2 960,00", net: "2 305,00",
    iban: "FR76 9999 9999 9999 9999 9999 992",
    revenuFiscal: "27 180",
  },
  {
    cle: "nguyen-lea",
    civilite: "Madame", prenom: "Léa", nom: "NGUYEN",
    naissance: "05/06/1997", lieuNaissance: "Nantes (44)",
    nationalite: "Française",
    adresse: "3 impasse des Tilleuls, 44000 Nantes",
    emploi: "Développeuse", employeur: "Atlantique Logiciels",
    contrat: "CDI depuis le 01/09/2023 — période d'essai terminée",
    brut: "3 420,00", net: "2 664,00",
    iban: "FR76 9999 9999 9999 9999 9999 993",
    revenuFiscal: "31 420",
  },
];

// ── Les trois biens ──────────────────────────────────────────────────────
const BIENS = [
  {
    cle: "lilas",
    nom: "Résidence des Lilas", type: "Appartement",
    adresse: "12 rue des Lilas", cp: "69003", ville: "Lyon",
    annee: "1998", surface: "46", pieces: "2", etage: "2",
    dpe: "D", ges: "C", conso: "212", emission: "31",
    proprietaire: "Alice DUPONT",
  },
  {
    cle: "voltaire",
    nom: "Immeuble Voltaire", type: "Immeuble",
    adresse: "5 rue Voltaire", cp: "13005", ville: "Marseille",
    annee: "1972", surface: "68", pieces: "3", etage: "4",
    dpe: "E", ges: "D", conso: "287", emission: "44",
    proprietaire: "SCI MARCHAND",
  },
  {
    cle: "tilleuls",
    nom: "Maison des Tilleuls", type: "Maison",
    adresse: "17 allée des Tilleuls", cp: "44000", ville: "Nantes",
    annee: "2011", surface: "92", pieces: "4", etage: "—",
    dpe: "B", ges: "A", conso: "88", emission: "9",
    proprietaire: "Marc NGUYEN",
  },
];

// ── Les trois propriétaires ──────────────────────────────────────────────
const PROPRIETAIRES = [
  {
    cle: "dupont-alice", nom: "Alice DUPONT", forme: "Personne physique",
    adresse: "44 avenue Jean Jaurès, 69007 Lyon",
    email: "alice.dupont@exemple-test.fr", telephone: "06 00 00 00 11",
    iban: "FR76 9999 9999 9999 9999 9999 881", quotePart: "100 %",
  },
  {
    cle: "sci-marchand", nom: "SCI MARCHAND", forme: "SCI — société civile immobilière",
    adresse: "9 cours Pierre Puget, 13006 Marseille",
    email: "contact@sci-marchand-test.fr", telephone: "06 00 00 00 22",
    iban: "FR76 9999 9999 9999 9999 9999 882", quotePart: "100 %",
  },
  {
    cle: "nguyen-marc", nom: "Marc NGUYEN", forme: "Personne physique",
    adresse: "3 impasse des Tilleuls, 44000 Nantes",
    email: "marc.nguyen@exemple-test.fr", telephone: "06 00 00 00 33",
    iban: "FR76 9999 9999 9999 9999 9999 883", quotePart: "50 % (indivision)",
  },
];

const MOIS = ["juin 2026", "juillet 2026", "août 2026"];

function documents() {
  const out = [];

  for (const l of LOCATAIRES) {
    const qui = `${l.civilite} ${l.prenom} ${l.nom}`;

    // Pièce d'identité — volontairement AUSTÈRE : un tableau de faits, pas
    // une reproduction de carte. On teste un dépôt de fichier, pas un titre.
    out.push([`${l.cle}-piece-identite.pdf`, page(
      "Attestation d'identité (pièce de recette)",
      "Tient lieu de « pièce d'identité » dans les essais — ce n'est PAS un titre d'identité.",
      `<table>
        ${ligne("Civilité, prénom, nom", qui)}
        ${ligne("Né(e) le", `${l.naissance} à ${l.lieuNaissance}`)}
        ${ligne("Nationalité", l.nationalite)}
        ${ligne("Domicile déclaré", l.adresse)}
        ${ligne("Numéro de pièce", "TEST-0000-0000 (format volontairement invalide)")}
        ${ligne("Délivrée le", "01/01/2020 — expire le 01/01/2030")}
      </table>
      <div class="encadre">
        Aucune administration n'a délivré ce document. Il ne comporte ni photographie,
        ni bande MRZ, ni élément de sécurité, et ne peut être présenté à quiconque.
      </div>`)]);

    // Trois bulletins de salaire
    MOIS.forEach((mois, i) => {
      out.push([`${l.cle}-bulletin-salaire-${i + 1}.pdf`, page(
        `Bulletin de paie — ${mois}`,
        `${qui} · ${l.employeur} · ${l.emploi}`,
        `<table>
          ${ligne("Salarié(e)", qui)}
          ${ligne("Emploi", `${l.emploi} — ${l.contrat}`)}
          ${ligne("Employeur", `${l.employeur} (entreprise fictive)`)}
          ${ligne("Période", mois)}
          ${ligne("Salaire brut", `${l.brut} €`)}
          ${ligne("Cotisations salariales", "— (non détaillées, document de recette)")}
        </table>
        <table><tr class="total"><th>Net à payer</th><td>${l.net} €</td></tr></table>
        <div class="encadre">
          Document de recette. Les montants sont inventés et cohérents entre eux
          pour éprouver les contrôles de solvabilité, rien de plus.
        </div>`)]);
    });

    out.push([`${l.cle}-avis-imposition.pdf`, page(
      "Avis d'impôt sur le revenu (pièce de recette)",
      `${qui} · revenus 2025`,
      `<table>
        ${ligne("Déclarant", qui)}
        ${ligne("Adresse", l.adresse)}
        ${ligne("Revenu fiscal de référence", `${l.revenuFiscal} €`)}
        ${ligne("Nombre de parts", "1")}
        ${ligne("Numéro fiscal", "00 00 000 000 000 (format volontairement invalide)")}
        ${ligne("Référence de l'avis", "TEST-RECETTE-0000")}
      </table>
      <div class="encadre">
        Ce document n'émane pas de la DGFiP et ne peut servir à aucune démarche.
      </div>`)]);

    out.push([`${l.cle}-justificatif-domicile.pdf`, page(
      "Justificatif de domicile (pièce de recette)",
      `${qui} · facture d'électricité fictive`,
      `<table>
        ${ligne("Titulaire du contrat", qui)}
        ${ligne("Adresse desservie", l.adresse)}
        ${ligne("Période", "août 2026")}
        ${ligne("Montant", "64,20 €")}
        ${ligne("Fournisseur", "Énergie Fictive SAS (société inventée)")}
      </table>`)]);

    out.push([`${l.cle}-attestation-assurance.pdf`, page(
      "Attestation d'assurance habitation (pièce de recette)",
      `${qui} · multirisque habitation`,
      `<table>
        ${ligne("Assuré(e)", qui)}
        ${ligne("Risque couvert", l.adresse)}
        ${ligne("Garantie", "Multirisque habitation — responsabilité locative")}
        ${ligne("Numéro de contrat", "TEST-MRH-000000")}
        ${ligne("Valable du", "01/09/2026 au 31/08/2027")}
        ${ligne("Assureur", "Assurances Fictives Mutuelles (société inventée)")}
      </table>
      <div class="encadre">
        Utilisez aussi la version PÉRIMÉE (<em>-perimee.pdf</em>) pour voir
        l'alerte « attestation expirée » se poser toute seule.
      </div>`)]);

    // La même, périmée : c'est elle qui déclenche l'alerte.
    out.push([`${l.cle}-attestation-assurance-perimee.pdf`, page(
      "Attestation d'assurance habitation — PÉRIMÉE (pièce de recette)",
      `${qui} · à déposer pour éprouver l'alerte de pièce expirée`,
      `<table>
        ${ligne("Assuré(e)", qui)}
        ${ligne("Risque couvert", l.adresse)}
        ${ligne("Numéro de contrat", "TEST-MRH-000001")}
        ${ligne("Valable du", "01/09/2024 au <strong>31/08/2025</strong> — expirée")}
        ${ligne("Assureur", "Assurances Fictives Mutuelles (société inventée)")}
      </table>`)]);

    out.push([`${l.cle}-rib.pdf`, page(
      "Relevé d'identité bancaire (pièce de recette)",
      qui,
      `<table>
        ${ligne("Titulaire", qui)}
        ${ligne("IBAN", `<code>${l.iban}</code>`)}
        ${ligne("BIC", "TESTFRPPXXX")}
        ${ligne("Banque", "Banque Fictive de l'Ouest (établissement inventé)")}
      </table>
      <div class="encadre">
        IBAN volontairement hors format : sa clé de contrôle est fausse, aucun
        virement ne peut l'atteindre.
      </div>`)]);
  }

  for (const b of BIENS) {
    out.push([`${b.cle}-dpe.pdf`, page(
      "Diagnostic de performance énergétique (pièce de recette)",
      `${b.nom} — ${b.adresse}, ${b.cp} ${b.ville}`,
      `<table>
        ${ligne("Bien", `${b.type} — ${b.surface} m², ${b.pieces} pièces`)}
        ${ligne("Adresse", `${b.adresse}, ${b.cp} ${b.ville}`)}
        ${ligne("Année de construction", b.annee)}
        ${ligne("Classe énergie", `<strong>${b.dpe}</strong> — ${b.conso} kWh/m²/an`)}
        ${ligne("Classe climat", `<strong>${b.ges}</strong> — ${b.emission} kg CO₂/m²/an`)}
        ${ligne("Numéro ADEME", "0000-TEST-0000000 (format volontairement invalide)")}
        ${ligne("Réalisé le", "12/03/2026 — valable 10 ans")}
      </table>
      <div class="encadre">
        Aucun diagnostiqueur certifié n'a établi ce document.
      </div>`)]);

    out.push([`${b.cle}-etat-risques.pdf`, page(
      "État des risques et pollutions — ERP (pièce de recette)",
      `${b.nom} — ${b.adresse}, ${b.cp} ${b.ville}`,
      `<table>
        ${ligne("Commune", b.ville)}
        ${ligne("Plan de prévention des risques", "Aucun (donnée fictive)")}
        ${ligne("Zone de sismicité", "1 — très faible (donnée fictive)")}
        ${ligne("Radon", "Catégorie 1 (donnée fictive)")}
        ${ligne("Établi le", "12/03/2026 — valable 6 mois")}
      </table>`)]);
  }

  for (const p of PROPRIETAIRES) {
    out.push([`proprietaire-${p.cle}-rib.pdf`, page(
      "Relevé d'identité bancaire — propriétaire (pièce de recette)",
      `${p.nom} · ${p.forme}`,
      `<table>
        ${ligne("Titulaire", p.nom)}
        ${ligne("Forme", p.forme)}
        ${ligne("Adresse", p.adresse)}
        ${ligne("IBAN", `<code>${p.iban}</code>`)}
        ${ligne("BIC", "TESTFRPPXXX")}
      </table>
      <div class="encadre">IBAN volontairement hors format.</div>`)]);
  }

  // Un mandat de gestion vierge, à déposer sur la fiche mandat
  out.push(["mandat-de-gestion-signe.pdf", page(
    "Mandat de gestion locative (pièce de recette)",
    "À déposer dans l'écran Mandats — contenu fictif",
    `<table>
      ${ligne("Mandant", "Alice DUPONT (personne fictive)")}
      ${ligne("Mandataire", "Agence Alpha (agence fictive)")}
      ${ligne("Objet", "Gestion locative du lot « Appartement T2 — 12 rue des Lilas »")}
      ${ligne("Honoraires", "7 % des sommes encaissées")}
      ${ligne("Durée", "1 an à compter du 01/09/2026, renouvelable")}
      ${ligne("Signé le", "28/08/2026")}
    </table>
    <div class="encadre">
      Ce document ne comporte aucune signature réelle et n'engage personne.
    </div>`)]);

  return out;
}

// Photos d'incident : des vignettes lisibles, pas des photographies.
function photos() {
  const carte = (titre, legende, fond) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <style>
      body { margin:0; width:900px; height:675px; display:flex; flex-direction:column;
             align-items:center; justify-content:center; background:${fond};
             font-family:"DejaVu Sans",Arial,sans-serif; color:#10202e; position:relative; }
      h1 { font-size:46px; margin:0 0 10px; text-align:center; padding:0 40px; }
      p { font-size:21px; color:#3d5165; margin:0; text-align:center; padding:0 60px; }
      .tag { position:absolute; top:26px; left:26px; background:#c22; color:#fff;
             font-weight:800; letter-spacing:2px; padding:8px 16px; font-size:16px; }
      .bas { position:absolute; bottom:26px; font-size:15px; color:#64778a; }
    </style></head><body>
    <span class="tag">PHOTO FICTIVE</span>
    <h1>${titre}</h1><p>${legende}</p>
    <span class="bas">Gerimmo — jeu de recette · image fabriquée, aucun lieu réel</span>
  </body></html>`;

  return [
    ["incident-fuite-evier.png", carte("Fuite sous l'évier", "Cuisine — signalement locataire", "#dce9f2")],
    ["incident-volet-bloque.png", carte("Volet roulant bloqué", "Séjour — signalement locataire", "#f2ead9")],
    ["incident-chaudiere.png", carte("Chaudière en défaut", "Cellier — signalement locataire", "#f2dcdc")],
    ["edl-sejour.png", carte("Séjour", "État des lieux — mur nord", "#e7efe4")],
    ["edl-cuisine.png", carte("Cuisine", "État des lieux — plan de travail", "#eee9f2")],
  ];
}

const nav = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await nav.newContext();
const p = await ctx.newPage();

let n = 0;
for (const [nom, html] of documents()) {
  await p.setContent(html, { waitUntil: "load" });
  await p.pdf({ path: path.join(DOCS, nom), format: "A4", printBackground: true });
  n++;
}

for (const [nom, html] of photos()) {
  await p.setViewportSize({ width: 900, height: 675 });
  await p.setContent(html, { waitUntil: "load" });
  await p.screenshot({ path: path.join(PHOTOS, nom) });
  n++;
}

await nav.close();

// La fiche de saisie, à côté des pièces.
const fiche = [
  "# Les dossiers à saisir",
  "",
  "Tout est inventé. Les IBAN, numéros fiscaux et numéros de pièce sont",
  "volontairement hors format : rien ici ne peut servir ailleurs que dans les essais.",
  "",
  "## Trois propriétaires",
  "",
  "| Nom | Forme | Adresse | E-mail | Téléphone | IBAN | Quote-part |",
  "|---|---|---|---|---|---|---|",
  ...PROPRIETAIRES.map((o) =>
    `| ${o.nom} | ${o.forme} | ${o.adresse} | ${o.email} | ${o.telephone} | \`${o.iban}\` | ${o.quotePart} |`),
  "",
  "## Trois biens",
  "",
  "| Référence | Type | Adresse | CP | Ville | Année | Surface | Pièces | Étage | DPE | GES | Propriétaire |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...BIENS.map((b) =>
    `| ${b.nom} | ${b.type} | ${b.adresse} | ${b.cp} | ${b.ville} | ${b.annee} | ${b.surface} m² | ${b.pieces} | ${b.etage} | ${b.dpe} | ${b.ges} | ${b.proprietaire} |`),
  "",
  "## Trois locataires",
  "",
  "| Nom | Né(e) le | Domicile | Emploi | Employeur | Net mensuel | Revenu fiscal | IBAN |",
  "|---|---|---|---|---|---|---|---|",
  ...LOCATAIRES.map((l) =>
    `| ${l.civilite} ${l.prenom} ${l.nom} | ${l.naissance} | ${l.adresse} | ${l.emploi} | ${l.employeur} | ${l.net} € | ${l.revenuFiscal} € | \`${l.iban}\` |`),
  "",
  "## Les pièces de chaque locataire",
  "",
  "Pour chacun des trois : pièce d'identité, **trois** bulletins de salaire,",
  "avis d'imposition, justificatif de domicile, attestation d'assurance,",
  "la **même attestation périmée** (pour voir l'alerte se poser), et un RIB.",
  "",
].join("\n");
fs.writeFileSync(path.join(RACINE, "donnees", "dossiers.md"), fiche);

console.log(`${n} pièces fabriquées dans kit-de-test/`);
