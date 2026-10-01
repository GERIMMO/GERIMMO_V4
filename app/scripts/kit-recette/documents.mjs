// Les pièces fictives du kit : diagnostics, pièces d'identité, bulletins,
// factures… Toutes portent le filigrane « SPÉCIMEN » et un pied rouge ; elles
// n'ont aucune valeur et ne reproduisent aucun document officiel.
import { CSS_POLICES, EUR, NB, calculerAmortissement, echapper, ecrireFichier, htmlVersPdf } from "./commun.mjs";

const CSS_DOC = `${CSS_POLICES}
@page { size: A4; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font: 10.5pt/1.45 "Liberation Sans", Arial, sans-serif; color: #1f2937; position: relative; }
h1 { font-size: 17pt; margin: 0 0 10px; color: #111827; }
.entete { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid #1f2937; margin-bottom: 14px; }
.emetteur { display: flex; gap: 10px; align-items: flex-start; }
.pastille { width: 44px; height: 44px; border-radius: 8px; background: #1d4ed8; color: #fff; font-weight: 700; font-size: 15pt; display: flex; align-items: center; justify-content: center; flex: none; }
.pastille.gris { background: #475569; }
.pastille.vert { background: #047857; }
.pastille.rouge { background: #b91c1c; }
.emetteur small, .droite small { color: #4b5563; display: block; }
.droite { text-align: right; }
.droite b { font-size: 12pt; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; }
th, td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: left; vertical-align: top; }
th { background: #f1f5f9; font-weight: 700; }
td.n, th.n { text-align: right; white-space: nowrap; }
tr.total td { font-weight: 700; background: #f8fafc; }
.cle td:first-child { background: #f8fafc; font-weight: 700; width: 34%; }
.bloc { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; margin: 10px 0; }
.deux { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.note { color: #6b7280; font-size: 9pt; }
.signature { font-family: "Great Vibes", cursive; font-size: 24pt; color: #1e3a8a; margin: 14px 0 0; }
.filigrane { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-32deg); color: rgba(190, 24, 24, 0.13); font-weight: 900; font-size: 58pt; letter-spacing: 3px; text-align: center; line-height: 1.1; white-space: nowrap; pointer-events: none; }
.filigrane small { display: block; font-size: 26pt; letter-spacing: 2px; }
h2 { font-size: 12.5pt; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #cbd5e1; }
.dpe { margin: 6px 0; }
.dpe .barre { display: flex; align-items: center; margin: 3px 0; height: 20px; }
.dpe .barre span { color: #fff; font-weight: 700; font-size: 9pt; padding: 0 8px; height: 20px; line-height: 20px; clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%); }
.dpe .barre b { margin-left: 10px; font-size: 10.5pt; }
.copie { display: inline-block; border: 1px solid #1d4ed8; color: #1d4ed8; border-radius: 4px; padding: 1px 8px; font-size: 9pt; margin-bottom: 8px; }
`;

const PIED = `<div style="width:100%;font:7.5pt 'Liberation Sans',Arial,sans-serif;color:#b91c1c;display:flex;justify-content:space-between;padding:0 14mm;">
<span>Document FICTIF créé pour la recette de Gerimmo — sans aucune valeur — ne pas utiliser hors de la recette</span>
<span style="color:#6b7280"><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;

function page(corps, titre) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title><style>${CSS_DOC}</style></head>
<body><div class="filigrane">SPÉCIMEN — DOCUMENT<small>RECETTE GERIMMO — SANS VALEUR</small></div>${corps}</body></html>`;
}

export async function pdfDocument(chemin, titre, corps) {
  await htmlVersPdf(page(corps, titre), chemin, { pied: PIED });
}

function entete({ initiales, couleur = "", nom, sousTitre, lignes = [], droiteTitre, droiteLignes = [] }) {
  return `<div class="entete"><div class="emetteur"><div class="pastille ${couleur}">${initiales}</div><div><b>${nom}</b> ${sousTitre ? `<span class="note">${sousTitre}</span>` : ""}${lignes.map((l) => `<small>${l}</small>`).join("")}</div></div>
<div class="droite"><b>${droiteTitre}</b>${droiteLignes.map((l) => `<small>${l}</small>`).join("")}</div></div>`;
}

// ── Diagnostics ─────────────────────────────────────────────────────────────
const CLASSES = [
  ["A", "≤ 70", "#0b8043", 34],
  ["B", "71 à 110", "#4caf50", 42],
  ["C", "111 à 180", "#8bc34a", 50],
  ["D", "181 à 250", "#ffeb3b", 58],
  ["E", "251 à 330", "#ffb300", 66],
  ["F", "331 à 420", "#fb8c00", 74],
  ["G", "> 420", "#e53935", 82],
];
const CONSO = { A: [55, 3], B: [92, 6], C: [150, 9], D: [212, 11], E: [290, 21], F: [380, 46], G: [460, 72] };
const COUTS = { A: [280, 390], B: [420, 580], C: [690, 950], D: [980, 1360], E: [1340, 1820], F: [1760, 2390], G: [2150, 2920] };

/**
 * Un diagnostic du cabinet fictif. `type` : dpe | erp | elec | gaz | crep |
 * amiante | amiantePC ; `bien` décrit le logement ; `copie` ajoute la mention
 * « Copie de secours » (contenu différent, donc accepté comme nouveau fichier).
 */
export async function pdfDiagnostic(chemin, { type, cabinet, numero, bien, realise, expire, classe, copie = false, perime = false }) {
  const titres = {
    dpe: ["Diagnostic de performance énergétique (logement)", "DPE"],
    erp: ["État des risques et pollutions (ERP)", "ERP"],
    elec: ["État de l'installation intérieure d'électricité", "ÉLECTRICITÉ"],
    gaz: ["État de l'installation intérieure de gaz", "GAZ"],
    crep: ["Constat de risque d'exposition au plomb (CREP)", "CREP"],
    amiante: ["Repérage amiante — dossier amiante parties privatives (DAPP)", "DAPP"],
    amiantePC: ["Repérage amiante — dossier technique amiante (parties communes)", "DTA"],
  };
  const [titre, code] = titres[type];
  const validite = {
    dpe: `Jusqu'au ${expire} (10 ans)`,
    erp: perime ? `Expiré le ${expire} — 6 mois, à renouveler à chaque nouveau bail` : "6 mois — à renouveler à chaque nouveau bail",
    elec: `Jusqu'au ${expire} (6 ans en location)`,
    gaz: `Jusqu'au ${expire} (6 ans en location)`,
    crep: "Illimitée : aucune concentration ≥ 1 mg/cm²",
    amiante: "Illimitée en l'absence d'amiante",
    amiantePC: "Illimitée en l'absence d'amiante",
  }[type];
  let corps = `${copie ? '<span class="copie">Copie de secours</span>' : ""}<h1>${titre}</h1>
${entete({ initiales: cabinet.initiales, nom: cabinet.nom, sousTitre: "(cabinet fictif)", lignes: [cabinet.adresse, `SIRET ${cabinet.siret}`], droiteTitre: code, droiteLignes: [`N° ${numero}`, `Établi le ${realise}`] })}
<table class="cle"><tr><td>Bien</td><td>${bien.designation}<br>${bien.adresse}</td></tr>
<tr><td>Année de construction</td><td>${bien.annee}</td></tr>
<tr><td>Opérateur</td><td>${cabinet.operateur} — Certification fictive n° ${cabinet.certification}</td></tr>
<tr><td>Validité</td><td>${validite}</td></tr></table>`;

  if (type === "dpe") {
    const [kwh, co2] = CONSO[classe];
    const [c1, c2] = COUTS[classe];
    corps += `<table class="cle"><tr><td>Surface habitable</td><td>${bien.surface}</td></tr>
<tr><td>Chauffage / eau chaude</td><td>${bien.chauffage}</td></tr>
<tr><td>Classe énergie</td><td><b style="font-size:13pt">${classe}</b></td></tr>
<tr><td>Classe climat (GES)</td><td><b>${co2 <= 6 ? "A" : co2 <= 11 ? "B" : co2 <= 30 ? "C" : co2 <= 50 ? "D" : "E"}</b></td></tr>
<tr><td>Estimation des coûts annuels</td><td>entre ${c1} € et ${c2} € par an (prix de l'énergie de référence)</td></tr></table>
<h2>Étiquette (valeurs fictives)</h2><div class="dpe">${CLASSES.map(([l, p, c, w]) => `<div class="barre"><span style="background:${c};width:${w}mm">${l} <small>${p}</small></span>${l === classe ? `<b>◀ ${kwh} kWh/m²/an · ${co2} kg CO₂/m²/an</b>` : ""}</div>`).join("")}</div>
<p class="note">Numéro fictif : il ne figure dans aucune base publique. Ce spécimen sert à renseigner la fiche du lot et à tester les règles liées à la classe énergie.</p>`;
  } else if (type === "erp") {
    corps += `<p class="note">Valeurs FICTIVES, saisies pour les essais : elles ne décrivent pas la situation réelle de la commune.</p>
<table><tr><th>Risque ou information</th><th>Situation déclarée</th></tr>
<tr><td>Plan de prévention des risques naturels</td><td>Non concerné</td></tr>
<tr><td>Plan de prévention des risques technologiques</td><td>Non concerné</td></tr>
<tr><td>Zone de sismicité</td><td>Zone 1 — très faible</td></tr>
<tr><td>Potentiel radon</td><td>Catégorie 1</td></tr>
<tr><td>Retrait-gonflement des argiles</td><td>Exposition ${bien.argiles ?? "moyenne"}</td></tr>
<tr><td>Secteur d'information sur les sols</td><td>Non concerné</td></tr>
<tr><td>Recul du trait de côte</td><td>Non concerné</td></tr>
<tr><td>Sinistre indemnisé (catastrophe naturelle) pendant l'occupation du bailleur</td><td>Aucun</td></tr></table>
<p>Établi le ${realise}</p><p class="signature">Le bailleur</p><p class="note">Le bailleur ou son mandataire — déclaration fictive</p>`;
  } else if (type === "elec") {
    corps += `<h2>Synthèse</h2><p>L'installation intérieure d'électricité ne comporte aucune anomalie nécessitant une intervention immédiate. ${bien.elecInfo ? "Un point d'information est noté ci-dessous." : ""}</p>
<table><tr><th>Point de contrôle</th><th>Constat</th></tr>
<tr><td>Appareil général de commande et de protection</td><td>Présent, accessible</td></tr>
<tr><td>Dispositif différentiel 30 mA</td><td>Présent sur l'ensemble des circuits</td></tr>
<tr><td>Liaison équipotentielle salle d'eau</td><td>Conforme</td></tr>
${bien.elecInfo ? `<tr><td>Information</td><td>${bien.elecInfo}</td></tr>` : ""}</table>`;
  } else if (type === "gaz") {
    corps += `<h2>Synthèse</h2><p>L'installation ne comporte aucune anomalie. Chaudière murale entretenue (dernière attestation d'entretien : ${bien.entretienChaudiere}).</p>
<table><tr><th>Appareil</th><th>Constat</th></tr>
<tr><td>Chaudière murale gaz naturel (production chauffage + eau chaude)</td><td>Conforme</td></tr>
<tr><td>Tuyauterie fixe et robinet de commande</td><td>Conforme</td></tr>
<tr><td>Ventilation du local</td><td>Conforme</td></tr></table>`;
  } else if (type === "crep") {
    corps += `<h2>Conclusion</h2><p>Absence de revêtement contenant du plomb à une concentration supérieure ou égale au seuil de 1 mg/cm². Aucune situation de risque de saturnisme ni de dégradation du bâti relevée.</p>
<table><tr><th>Unités de diagnostic mesurées</th><th>Mesures</th><th>Classement</th></tr>
<tr><td>Menuiseries, plinthes, murs</td><td>${bien.mesuresPlomb ?? 52} mesures, maximum 0,2 mg/cm²</td><td>Classe 0</td></tr></table>`;
  } else if (type === "amiante") {
    corps += `<h2>Conclusion</h2><p>Il n'a pas été repéré de matériaux et produits contenant de l'amiante dans les parties privatives visitées (listes A et B).</p>
<table><tr><th>Local visité</th><th>Matériaux examinés</th><th>Résultat</th></tr>
<tr><td>Séjour</td><td>Dalles de sol, enduits</td><td>Absence</td></tr>
<tr><td>Cuisine</td><td>Faïence, colles</td><td>Absence</td></tr>
<tr><td>Salle d'eau</td><td>Conduits, joints</td><td>Absence</td></tr></table>`;
  } else if (type === "amiantePC") {
    corps += `<h2>Conclusion</h2><p>Il n'a pas été repéré de matériaux et produits contenant de l'amiante dans les parties communes visitées (listes A et B).</p>
<table><tr><th>Local visité</th><th>Matériaux examinés</th><th>Résultat</th></tr>
<tr><td>Hall et cage d'escalier</td><td>Enduits, dalles, faux plafonds</td><td>Absence</td></tr>
<tr><td>Locaux techniques</td><td>Calorifugeages, conduits</td><td>Absence</td></tr>
<tr><td>Façades et toiture</td><td>Plaques, joints</td><td>Absence</td></tr></table>`;
  }
  await pdfDocument(chemin, titre, corps);
}

// ── Pièces des personnes ────────────────────────────────────────────────────
export async function pdfPieceIdentite(chemin, p) {
  await pdfDocument(chemin, "Pièce d'identité — spécimen", `<h1>Pièce d'identité — spécimen de recette</h1>
<p>Ce spécimen tient lieu de pièce d'identité pour les essais de Gerimmo. Il ne reproduit aucun titre officiel et n'a aucune valeur.</p>
<div class="bloc"><table class="cle"><tr><td>Nom</td><td>${p.nom}</td></tr><tr><td>Prénom(s)</td><td>${p.prenom}</td></tr>
<tr><td>Né(e) le</td><td>${p.naissance}</td></tr><tr><td>À</td><td>${p.lieuNaissance}</td></tr>
<tr><td>Numéro du spécimen</td><td>SPEC-${p.prenom.slice(0, 3).toUpperCase()}-${p.naissance.slice(-4)}-RCT</td></tr>
<tr><td>Valable jusqu'au</td><td>${p.validiteIdentite ?? "31/12/2034"}</td></tr></table>
<p class="note">Recto et verso sont réunis sur cette page : un seul fichier suffit au dépôt.</p></div>
<p style="text-align:center;color:#b91c1c;font-weight:700;letter-spacing:2px;margin-top:30px">SPÉCIMEN — NE PAS UTILISER HORS RECETTE</p>`);
}

export async function pdfRib(chemin, p, ib, agence) {
  await pdfDocument(chemin, "Relevé d'identité bancaire — spécimen", `${entete({ initiales: "BF", nom: "Banque Fictive de Recette", lignes: [`Banque Fictive de Recette — agence ${agence}`], droiteTitre: "RELEVÉ D'IDENTITÉ BANCAIRE", droiteLignes: [] })}
<div class="bloc"><b>Titulaire du compte</b><br>${p.civilite} ${p.prenom} ${p.nom}<br>${p.adresse}<br>${p.cp} ${p.ville}</div>
<table><tr><th>Code banque</th><th>Code guichet</th><th>N° de compte</th><th>Clé RIB</th></tr>
<tr><td>${ib.banque}</td><td>${ib.guichet}</td><td>${ib.compte}</td><td>${ib.cleRib}</td></tr></table>
<table class="cle"><tr><td>IBAN</td><td><b>${ib.affiche}</b></td></tr><tr><td>BIC</td><td>RCTEFRPPXXX</td></tr></table>
<p class="note">Clés de contrôle justes mais banque fictive (code 99999) : aucun virement réel n'est possible vers ce compte.</p>`);
}

export async function pdfBulletin(chemin, { salarie, employeur, mois, moisLabel, paiementLe, brut }) {
  const sante = brut * 0.012, retraite = brut * 0.1105, chomage = brut * 0.0048, csgD = brut * 0.0668, csg = brut * 0.0285;
  const net = brut - sante - retraite - chomage - csgD - csg;
  const pas = net * (salarie.tauxPas ?? 0.045);
  const ligne = (l, b, m) => `<tr><td>${l}</td><td class="n">${b ?? ""}</td><td class="n">${m}</td></tr>`;
  await pdfDocument(chemin, `Bulletin de paie ${mois}`, `${entete({ initiales: employeur.initiales, couleur: "gris", nom: employeur.nom, sousTitre: `(${employeur.forme})`, lignes: [employeur.adresse, `SIRET ${employeur.siret} — NAF ${employeur.naf}`], droiteTitre: "BULLETIN DE PAIE", droiteLignes: [`Période : ${moisLabel}`, `Paiement le ${paiementLe}`] })}
<div class="bloc deux"><div><b>${salarie.civilite} ${salarie.prenom} ${salarie.nom}</b><br>${salarie.adresse}<br>${salarie.cp} ${salarie.ville}</div>
<div class="note">Emploi : ${salarie.emploi} (${salarie.contrat})<br>Convention : ${employeur.convention}<br>Matricule : ${salarie.matricule}</div></div>
<table><tr><th>Rubrique</th><th class="n">Base</th><th class="n">Montant</th></tr>
${ligne("Salaire de base", "151,67 h", EUR(brut))}
${ligne("Santé — complémentaire (part salariale)", null, "-" + EUR(sante))}
${ligne("Retraite de base et complémentaire", null, "-" + EUR(retraite))}
${ligne("Assurance chômage et autres contributions", null, "-" + EUR(chomage))}
${ligne("CSG déductible", null, "-" + EUR(csgD))}
${ligne("CSG/CRDS non déductibles", null, "-" + EUR(csg))}
<tr class="total"><td>Net à payer avant impôt sur le revenu</td><td></td><td class="n">${EUR(net)}</td></tr>
${ligne(`Impôt sur le revenu prélevé à la source (taux ${NB((salarie.tauxPas ?? 0.045) * 100, 1)} %)`, null, "-" + EUR(pas))}
<tr class="total"><td>NET PAYÉ (virement)</td><td></td><td class="n">${EUR(net - pas)}</td></tr></table>
<p class="note">Cumul imposable et détail des cotisations patronales omis : bulletin simplifié, fictif, pour les essais de dépôt de pièces.</p>`);
  return net - pas;
}

export async function pdfAttestationEmployeur(chemin, { salarie, employeur, brut, date, signataire }) {
  await pdfDocument(chemin, "Attestation d'employeur", `${entete({ initiales: employeur.initiales, couleur: "gris", nom: employeur.nom, sousTitre: `(${employeur.forme})`, lignes: [employeur.adresse, `SIRET ${employeur.siret}`], droiteTitre: "Attestation d'employeur", droiteLignes: [] })}
<p>Je soussigné(e), responsable des ressources humaines de la société ${employeur.nom}, atteste que ${salarie.civilite} ${salarie.prenom} ${salarie.nom}, né(e) le ${salarie.naissance}, est employé(e) au sein de notre société en qualité de ${salarie.emploi} (${salarie.contrat}).</p>
<p>Contrat à durée indéterminée, période d'essai terminée, aucune procédure de licenciement ou de démission en cours. Rémunération brute mensuelle : ${EUR(brut)}.</p>
<p>Attestation délivrée à l'intéressé(e) pour faire valoir ce que de droit.</p>
<p>Fait le ${date}</p><p class="signature">${signataire}</p><p class="note">${signataire}<br>Responsable RH (personnage fictif)</p>`);
}

// ── Bail signé ──────────────────────────────────────────────────────────────
export async function pdfBailSigne(chemin, b) {
  await pdfDocument(chemin, "Contrat de location — exemplaire signé (spécimen)", `<span class="copie">Exemplaire du bailleur — spécimen de recette</span>
<h1>Contrat de location — logement vide (non meublé)</h1>
<p class="note">Soumis au titre Iᵉʳ de la loi n° 89-462 du 6 juillet 1989 · exemplaire signé (spécimen)</p>
<h2>I. Les parties</h2>
<p><b>Le bailleur :</b> ${b.bailleur}</p>
<p><b>Le locataire :</b> ${b.locataire}</p>
<h2>II. Le logement</h2>
<p>${b.logement}</p><ul>${b.equipements.map((e) => `<li>${e}</li>`).join("")}</ul>
<h2>III. Durée et prise d'effet</h2>
<p>Prise d'effet le ${b.priseEffet}, pour une durée de 3 ans, reconductible tacitement.</p>
<h2>IV. Conditions financières</h2>
<table class="cle"><tr><td>Loyer mensuel hors charges</td><td>${EUR(b.loyer)}</td></tr>
<tr><td>Provision pour charges (régularisation annuelle)</td><td>${EUR(b.charges)}</td></tr>
<tr><td>Total mensuel</td><td><b>${EUR(b.loyer + b.charges)}</b></td></tr>
<tr><td>Dépôt de garantie</td><td>${EUR(b.depot)}</td></tr>
<tr><td>Paiement</td><td>mensuel, d'avance, le 1ᵉʳ du mois</td></tr></table>
<p class="note">Révision annuelle selon l'indice de référence des loyers publié par l'INSEE. Annexes remises : notice d'information, dossier de diagnostic technique, état des lieux d'entrée.</p>
<div style="page-break-before:always"></div>
<h2>Signatures</h2>
<p>Fait à ${b.lieuSignature}, le ${b.dateSignature}, en autant d'exemplaires originaux que de parties.</p>
<div class="deux"><div class="bloc"><b>Le bailleur</b><br><span class="note">« Lu et approuvé »</span><p class="signature">${b.signatureBailleur}</p></div>
<div class="bloc"><b>Le locataire</b><br><span class="note">« Lu et approuvé »</span><p class="signature">${b.signatureLocataire}</p></div></div>
<p class="note">Chaque page du contrat original est paraphée par les parties. Ce spécimen résume le contrat que Gerimmo génère : il sert uniquement à tester le dépôt du bail signé.</p>`);
}

// ── Pièces du propriétaire ──────────────────────────────────────────────────
export async function pdfAppelDeFonds(chemin, { syndic, destinataire, copro, lot, trimestre, emisLe, limite, postes }) {
  const total = postes.reduce((s, p) => s + p.montant, 0);
  const recup = postes.filter((p) => p.recuperable).reduce((s, p) => s + p.montant, 0);
  await pdfDocument(chemin, `Appel de fonds ${trimestre}`, `${entete({ initiales: "SF", couleur: "vert", nom: syndic.nom, sousTitre: "(syndic fictif)", lignes: [syndic.adresse, `SIRET ${syndic.siret}`], droiteTitre: "APPEL DE FONDS", droiteLignes: [trimestre, `Émis le ${emisLe}`] })}
<div class="bloc">${destinataire}</div>
<p><b>Copropriété :</b> ${copro}<br><b>Lot :</b> ${lot}</p>
<table><tr><th>Poste (budget voté)</th><th>Récupérable (indicatif)</th><th class="n">Quote-part du lot</th></tr>
${postes.map((p) => `<tr><td>${p.libelle}</td><td>${p.recuperable ? "Oui" : "Non"}</td><td class="n">${EUR(p.montant)}</td></tr>`).join("")}
<tr class="total"><td colspan="2">Total appelé</td><td class="n">${EUR(total)}</td></tr></table>
<p class="note">Dont part indiquée comme récupérable sur le locataire : <b>${EUR(recup)}</b> (indication du syndic fictif, à vérifier par le gestionnaire). Date limite de paiement : ${limite}.</p>`);
  return { total, recup };
}

export async function pdfTaxeFonciere(chemin, { proprietaire, bien, tfpb, teom, limite }) {
  await pdfDocument(chemin, "Avis de taxe foncière — spécimen", `<h1>Avis de taxe foncière 2026 — spécimen</h1>
<p class="note">Spécimen de recette : ne reproduit pas l'avis officiel ; les identifiants sont remplacés par « SPÉCIMEN ».</p>
<div class="bloc">${proprietaire}</div>
<p>Référence de l'avis : SPÉCIMEN<br>Date limite de paiement : ${limite}<br>Bien imposé : ${bien}</p>
<table><tr><th>Élément</th><th class="n">Montant</th></tr>
<tr><td>Taxe foncière sur les propriétés bâties (commune, intercommunalité)</td><td class="n">${EUR(tfpb)}</td></tr>
<tr><td>Taxe d'enlèvement des ordures ménagères (TEOM) — récupérable sur le locataire</td><td class="n">${EUR(teom)}</td></tr>
<tr class="total"><td>Montant à payer</td><td class="n">${EUR(tfpb + teom)}</td></tr></table>`);
}

export async function pdfAttestationPno(chemin, { assure, bien, contrat, cotisation, date }) {
  await pdfDocument(chemin, "Attestation d'assurance propriétaire non occupant", `${entete({ initiales: "MFE", nom: "Mutuelle Fictive de l'Essonne (MFE)", lignes: ["1 place des Garanties, 91000 Évry-Courcouronnes"], droiteTitre: "ATTESTATION D'ASSURANCE", droiteLignes: ["Propriétaire non occupant"] })}
<div class="bloc">${assure}</div>
<p>Contrat n° ${contrat} — bien assuré : ${bien}, du 01/01/2026 au 31/12/2026. Cotisation annuelle : ${EUR(cotisation)}.</p>
<table><tr><th>Garanties</th><th>Statut</th></tr>
<tr><td>Responsabilité civile propriétaire</td><td>Acquise</td></tr>
<tr><td>Dégâts des eaux, incendie (en complément de l'assurance de l'immeuble)</td><td>Acquise</td></tr>
<tr><td>Carence ou défaut d'assurance du locataire</td><td>Acquise</td></tr></table>
<p>Le ${date}</p><p class="signature">Service contrats</p><p class="note">Service contrats — Mutuelle Fictive de l'Essonne</p>`);
}

export async function pdfFacture(chemin, { fournisseur, numero, date, client, objet, lignes, tva = null, note = "" }) {
  const total = lignes.reduce((s, l) => s + l.montant, 0);
  const ht = tva == null ? null : total / (1 + tva);
  await pdfDocument(chemin, `Facture ${numero}`, `${entete({ initiales: fournisseur.initiales, couleur: "gris", nom: fournisseur.nom, sousTitre: "(entreprise fictive)", lignes: [fournisseur.adresse], droiteTitre: `FACTURE N° ${numero}`, droiteLignes: [`Date : ${date}`] })}
<div class="bloc">${client}</div><p><b>Objet :</b> ${objet}</p>
<table><tr><th>Désignation</th><th class="n">Montant TTC</th></tr>
${lignes.map((l) => `<tr><td>${l.libelle}</td><td class="n">${EUR(l.montant)}</td></tr>`).join("")}
${ht == null ? "" : `<tr><td>Total HT</td><td class="n">${EUR(ht)}</td></tr><tr><td>TVA ${NB(tva * 100, 0)} %</td><td class="n">${EUR(total - ht)}</td></tr>`}
<tr class="total"><td>Total TTC</td><td class="n">${EUR(total)}</td></tr></table>
${note ? `<p class="note">${note}</p>` : ""}`);
  return total;
}

export async function pdfAmortissement(chemin, { emprunteur, objet, capital, taux, dureeAns, debut, assurance }) {
  const { lignes, interets } = calculerAmortissement({ capital, taux, dureeAns, debut });
  await pdfDocument(chemin, "Tableau d'amortissement 2026", `${entete({ initiales: "BF", nom: "Banque Fictive de Recette", lignes: ["Service crédit immobilier"], droiteTitre: "TABLEAU D'AMORTISSEMENT", droiteLignes: ["Année 2026"] })}
<p><b>Emprunteur :</b> ${emprunteur}<br><b>Objet :</b> ${objet}<br>Capital emprunté : ${EUR(capital)} — Taux : ${NB(taux * 100, 2)} % — Durée : ${dureeAns} ans</p>
<table><tr><th>Échéance</th><th class="n">Mensualité</th><th class="n">Intérêts</th><th class="n">Capital amorti</th><th class="n">Capital restant</th></tr>
${lignes.map((l) => `<tr><td>${l.echeance}</td><td class="n">${EUR(l.mensualite)}</td><td class="n">${EUR(l.interets)}</td><td class="n">${EUR(l.amorti)}</td><td class="n">${EUR(l.restant)}</td></tr>`).join("")}</table>
<p><b>Intérêts payés en 2026 (à reporter en « intérêts d'emprunt ») : ${EUR(interets)}</b> — assurance emprunteur : ${EUR(assurance)}.</p>`);
  return interets;
}

export async function pdfFauxDocument(chemin) {
  await ecrireFichier(chemin, "Ceci n'est pas un PDF : un simple texte renommé en .pdf pour la recette de Gerimmo.\n");
}
