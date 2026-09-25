/**
 * Les notifications sortantes (25/09) : ce que chaque message dit, à qui, et
 * qu'un rappel ne part qu'une fois.
 *
 * On ne teste pas la mise en forme : on teste que le message nomme le geste
 * attendu et l'endroit où le faire, qu'il parle avec le nom de l'organisation
 * (jamais « Gerimmo » au locataire), qu'il n'imprime pas de HTML venu de la
 * saisie, et que le filtre des rappels refuse le second envoi.
 */
import { describe, expect, it } from "vitest";
import {
  cleRappel,
  clesDejaTracees,
  DELAIS_RAPPEL,
  echeanceAtteinte,
  extrait,
  gabaritNotification,
  messageCreneauxAChoisir,
  messageDevisDemande,
  messageDevisRecu,
  messageIncidentUrgent,
  messageMissionAnnulee,
  messageMissionConfiee,
  messageMissionRefusee,
  messagePieceDemandee,
  messageRappelGeste,
  messageRendezVousFixe,
  messageReponseGestionnaire,
  messageSignatureDemandee,
  rappelsDus,
  ROLE_RAPPEL,
  type TypeRappel,
} from "@/lib/notifications";

const AGENCE = "Cabinet Martin";
const LIEN = "https://exemple.fr/ou-agir";

describe("le gabarit commun", () => {
  it("échappe tout ce qui vient de la saisie, titre et lien compris", () => {
    const html = gabaritNotification({
      titre: "<script>x</script>",
      prenom: "Ma<rc>",
      lignes: ["Un & deux"],
      action: { libelle: "Aller", lien: 'https://exemple.fr/?a="b"' },
      emetteur: AGENCE,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Ma&lt;rc&gt;");
    expect(html).toContain("Un &amp; deux");
    expect(html).toContain("&quot;b&quot;");
  });

  it("sans adresse de site, il dit le geste sans promettre un clic", () => {
    const html = gabaritNotification({ titre: "T", lignes: [], action: { libelle: "Choisir un créneau", lien: null }, emetteur: AGENCE });
    expect(html).not.toContain("href=");
    expect(html).toContain("Choisir un créneau");
    expect(html).toContain("connectez-vous à votre espace");
  });

  it("signe du nom de l'organisation", () => {
    expect(gabaritNotification({ titre: "T", lignes: [], emetteur: AGENCE })).toContain(`— ${AGENCE}`);
  });
});

describe("chaque message nomme le geste et le lien", () => {
  const cas: { nom: string; m: { sujet: string; html: string }; geste: RegExp }[] = [
    { nom: "devis demandé", m: messageDevisDemande({ emetteur: AGENCE, categorie: "plomberie_canalisation", ville: "Lyon", numero: "INC-001", lien: LIEN }), geste: /Répondre/ },
    { nom: "mission confiée", m: messageMissionConfiee({ emetteur: AGENCE, categorie: "plomberie_canalisation", adresse: "9 rue X, 69001 Lyon", numero: "INC-001", lien: LIEN }), geste: /Accepter ou refuser/ },
    { nom: "rendez-vous fixé (artisan)", m: messageRendezVousFixe({ destinataire: "artisan", emetteur: AGENCE, categorie: "plomberie_canalisation", debut: "2026-07-06T07:00:00Z", fin: "2026-07-06T09:00:00Z", adresse: "9 rue X", artisan: "Plomberie Durand", lien: LIEN }), geste: /Voir le rendez-vous/ },
    { nom: "mission annulée", m: messageMissionAnnulee({ emetteur: AGENCE, categorie: "plomberie_canalisation", numero: "INC-001", motif: "Réglé par le syndic", lien: LIEN }), geste: /Voir le dossier/ },
    { nom: "créneaux à choisir", m: messageCreneauxAChoisir({ emetteur: AGENCE, prenom: "Marc", categorie: "plomberie_canalisation", artisan: "Plomberie Durand", nbCreneaux: 3, lien: LIEN }), geste: /Choisir un créneau/ },
    { nom: "réponse du gestionnaire", m: messageReponseGestionnaire({ emetteur: AGENCE, prenom: "Marc", lien: LIEN }), geste: /Lire la réponse/ },
    { nom: "pièce demandée", m: messagePieceDemandee({ emetteur: AGENCE, prenom: "Marc", libelle: "RIB", relance: false, lien: LIEN }), geste: /Déposer la pièce/ },
    { nom: "signature demandée", m: messageSignatureDemandee({ emetteur: AGENCE, prenom: "Marc", titreDocument: "Bail — 9 rue X", lien: LIEN }), geste: /Voir le document/ },
    { nom: "incident urgent", m: messageIncidentUrgent({ emetteur: AGENCE, numero: "INC-001", categorie: "plomberie_canalisation", lot: "Lot 3", piece: "Cuisine", description: "Fuite sous l'évier", lien: LIEN }), geste: /Ouvrir le dossier/ },
    { nom: "devis reçu", m: messageDevisRecu({ emetteur: AGENCE, artisan: "Plomberie Durand", montantCents: 45000, numero: "INC-001", categorie: "plomberie_canalisation", lien: LIEN }), geste: /Voir le devis/ },
    { nom: "mission refusée", m: messageMissionRefusee({ emetteur: AGENCE, artisan: "Plomberie Durand", motif: "Trop loin", numero: "INC-001", categorie: "plomberie_canalisation", lien: LIEN }), geste: /Réaffecter/ },
  ];

  for (const c of cas) {
    it(`${c.nom} : sujet non vide, lien présent, geste nommé, catégorie lisible`, () => {
      expect(c.m.sujet.length).toBeGreaterThan(5);
      expect(c.m.html).toContain(`href="${LIEN}"`);
      expect(c.m.html).toMatch(c.geste);
      // Le slug technique ne se lit jamais tel quel.
      expect(c.m.html).not.toContain("plomberie_canalisation");
      expect(c.m.sujet).not.toContain("plomberie_canalisation");
    });
  }

  it("les sujets sont tous distincts", () => {
    expect(new Set(cas.map((c) => c.m.sujet)).size).toBe(cas.length);
  });
});

describe("marque blanche et discrétion", () => {
  const versLeLocataire = [
    messageCreneauxAChoisir({ emetteur: AGENCE, prenom: "Marc", categorie: "plomberie_canalisation", artisan: "Plomberie Durand", nbCreneaux: 1, lien: LIEN }),
    messageReponseGestionnaire({ emetteur: AGENCE, prenom: "Marc", lien: LIEN }),
    messagePieceDemandee({ emetteur: AGENCE, prenom: "Marc", libelle: "RIB", relance: true, lien: LIEN }),
    messageSignatureDemandee({ emetteur: AGENCE, prenom: "Marc", titreDocument: "Bail", lien: LIEN }),
    messageRendezVousFixe({ destinataire: "locataire", emetteur: AGENCE, prenom: "Marc", categorie: "plomberie_canalisation", debut: "2026-07-06T07:00:00Z", fin: null, adresse: null, artisan: "Plomberie Durand", lien: LIEN }),
    messageRappelGeste({ type: "creneau_non_choisi", emetteur: AGENCE, prenom: "Marc", categorie: "plomberie_canalisation", jours: 3, lien: LIEN }),
    messageRappelGeste({ type: "piece_demandee", emetteur: AGENCE, prenom: "Marc", libelle: "RIB", jours: 7, lien: LIEN }),
  ];

  it("aucun message au locataire ne dit « Gerimmo » : c'est l'organisation qui parle", () => {
    for (const m of versLeLocataire) {
      expect(m.sujet + m.html).not.toMatch(/gerimmo/i);
      expect(m.html).toContain(AGENCE);
      expect(m.html).toContain("Bonjour Marc");
    }
  });

  it("la réponse du gestionnaire n'embarque pas le texte : il se lit dans l'espace", () => {
    const m = messageReponseGestionnaire({ emetteur: AGENCE, prenom: "Marc", lien: LIEN });
    expect(m.html).toMatch(/dans votre espace/);
    expect(m.sujet).toBe(`${AGENCE} vous a répondu`);
  });

  it("le rendez-vous se dit à l'heure de Paris, à l'artisan comme au locataire", () => {
    const base = { emetteur: AGENCE, categorie: "plomberie_canalisation", debut: "2026-07-06T07:00:00Z", fin: "2026-07-06T09:00:00Z", adresse: "9 rue X", artisan: "Plomberie Durand", lien: LIEN };
    const a = messageRendezVousFixe({ ...base, destinataire: "artisan" });
    const l = messageRendezVousFixe({ ...base, destinataire: "locataire", prenom: "Marc" });
    expect(a.sujet).toBe("Rendez-vous fixé — lundi 6 juillet de 09 h 00 à 11 h 00");
    expect(l.sujet).toBe(a.sujet);
    // L'artisan doit venir : l'adresse. Le locataire doit être là : l'intervenant.
    expect(a.html).toContain("9 rue X");
    expect(a.html).not.toContain("Bonjour Marc");
    expect(l.html).toContain("Plomberie Durand");
    expect(l.html).toMatch(/permettre l(&#39;|')accès/);
  });

  it("l'incident urgent : sujet en majuscules qui dit le lieu et le dossier, description tronquée", () => {
    const longue = "x".repeat(500);
    const m = messageIncidentUrgent({ emetteur: AGENCE, numero: "INC-042", categorie: "plomberie_canalisation", lot: "Lot 3", piece: null, description: longue, lien: LIEN });
    expect(m.sujet).toMatch(/^URGENT — /);
    expect(m.sujet).toContain("Lot 3");
    expect(m.sujet).toContain("INC-042");
    expect(m.html).not.toContain(longue);
    expect(m.html).toContain("…");
  });

  it("le devis reçu affiche le montant en euros, jamais en centimes", () => {
    const m = messageDevisRecu({ emetteur: AGENCE, artisan: "Plomberie Durand", montantCents: 45000, numero: "INC-001", categorie: "plomberie_canalisation", lien: LIEN });
    expect(m.sujet).toContain("450,00");
    expect(m.sujet).not.toContain("45000");
  });

  it("extrait : nettoie les blancs et tronque avec une ellipse", () => {
    expect(extrait("  a\n\nb  ")).toBe("a b");
    expect(extrait("abcdef", 4)).toBe("abc…");
    expect(extrait(null)).toBe("");
  });
});

describe("les rappels de gestes", () => {
  it("les quatre délais et rôles sont ceux de l'audit (P2-7)", () => {
    expect(DELAIS_RAPPEL).toEqual({ creneau_non_choisi: 3, mission_non_acceptee: 2, piece_demandee: 7, devis_non_chiffre: 3 });
    expect(ROLE_RAPPEL).toEqual({ creneau_non_choisi: "locataire", mission_non_acceptee: "artisan", piece_demandee: "locataire", devis_non_chiffre: "artisan" });
  });

  it("chaque type a son propre texte, et ne dit pas « Gerimmo »", () => {
    const types: TypeRappel[] = ["creneau_non_choisi", "mission_non_acceptee", "piece_demandee", "devis_non_chiffre"];
    const messages = types.map((type) => messageRappelGeste({ type, emetteur: AGENCE, prenom: "Marc", categorie: "plomberie_canalisation", libelle: "RIB", jours: DELAIS_RAPPEL[type], lien: LIEN }));
    expect(new Set(messages.map((m) => m.sujet)).size).toBe(4);
    for (const m of messages) {
      expect(m.sujet + m.html).not.toMatch(/gerimmo/i);
      expect(m.html).toContain(`href="${LIEN}"`);
    }
    expect(messages[0].html).toContain("depuis 3 jours");
    expect(messages[1].html).toContain("depuis 2 jours");
    expect(messages[2].html).toContain("RIB");
    expect(messages[3].sujet).toMatch(/devis/i);
  });

  it("l'échéance se compte en jours pleins", () => {
    const maintenant = new Date("2026-09-25T06:00:00Z");
    expect(echeanceAtteinte("2026-09-22T06:00:00Z", 3, maintenant)).toBe(true);
    expect(echeanceAtteinte("2026-09-22T06:00:01Z", 3, maintenant)).toBe(false);
    expect(echeanceAtteinte("n'importe quoi", 3, maintenant)).toBe(false);
  });

  it("la clé lie le type et l'objet : deux rappels de types différents sur un même objet restent possibles", () => {
    expect(cleRappel("piece_demandee", "abc")).toBe("piece_demandee:abc");
    expect(cleRappel("creneau_non_choisi", "abc")).not.toBe(cleRappel("mission_non_acceptee", "abc"));
  });

  it("idempotence : ce qui est tracé ne repart pas, un objet ne part qu'une fois par passe", () => {
    const tracees = clesDejaTracees([
      { details: { cle: "piece_demandee:p1" } },
      { details: "pas un objet" },
      { details: null },
      { details: { autre: 1 } },
    ]);
    expect([...tracees]).toEqual(["piece_demandee:p1"]);

    const candidats = [
      { cle: "piece_demandee:p1", n: 1 },
      { cle: "creneau_non_choisi:i1", n: 2 }, // trois créneaux de la même intervention
      { cle: "creneau_non_choisi:i1", n: 3 },
      { cle: "creneau_non_choisi:i1", n: 4 },
      { cle: "devis_non_chiffre:s1", n: 5 },
    ];
    const dus = rappelsDus(candidats, tracees);
    expect(dus.map((d) => d.n)).toEqual([2, 5]);
    // Une seconde passe, une fois ces deux-là tracés, ne renvoie rien.
    const apres = new Set([...tracees, ...dus.map((d) => d.cle)]);
    expect(rappelsDus(candidats, apres)).toEqual([]);
  });
});
