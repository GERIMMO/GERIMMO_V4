import { RACINE_AGENCE } from "@/lib/racine-espace";
import { CHAMPS_ETAPE_BAIL } from "@/lib/champs-etape-bail";
import { champsManquantsBail } from "@/lib/reperes-bail";

/** Liens communs au contrôle du dossier et aux erreurs de génération. */
export function cibleChampBail(champ: string, orgId: string, racine: string = RACINE_AGENCE): { href: string; etape: string } {
  const cle = champ.trim();
  const champContrat = cle.replace(/^bail\./, "");
  const versChamp = (nom: string) => {
    const etape = Object.entries(CHAMPS_ETAPE_BAIL).find(([, champs]) => (champs as readonly string[]).includes(nom))?.[0];
    return etape ? { href: `#parcours-${nom}`, etape } : null;
  };
  const directe = versChamp(champContrat);
  if (directe) return directe;
  if (champContrat === "locataire_principal") return { href: "#titre-locataires-bail", etape: "personnes" };

  // Les libellés issus du PDF utilisent les mêmes correspondances que les
  // pastilles. Une clé précise du récapitulatif peut aussi viser son champ.
  const connus = [...champsManquantsBail([cle])];
  // Le modèle meublé emploie encore ce libellé générique pour la naissance.
  if (/^jj\/mm\/aaaa$/i.test(cle)) return { href: "#titre-locataires-bail", etape: "personnes" };
  const bailConnu = connus.find(c => c.startsWith("bail."));
  if (bailConnu) {
    const cible = versChamp(bailConnu.slice(5));
    if (cible) return cible;
  }
  const personnes = new Set(connus.filter(c => /^(proprietaire|locataire|garant)\./.test(c)).map(c => c.split(".")[0]));
  if (personnes.size > 1) return { href: "#completer-personnes", etape: "personnes" };
  const nature = personnes.values().next().value ?? cle.split(".")[0];
  if (/^(proprietaire|propriétaire|bailleur|proprietaires|propriétaires)$/.test(nature)) return { href: "#titre-proprietaires-bail", etape: "personnes" };
  if (/^(locataire|locataires)$/.test(nature)) return { href: "#titre-locataires-bail", etape: "personnes" };
  if (/^(garant|garants)$/.test(nature)) return { href: "#titre-garants-bail", etape: "personnes" };
  if (cle === "personnes") return { href: "#completer-personnes", etape: "personnes" };
  if (/^bien(?:\.|$)|^bâtiment$/.test(cle)) return { href: "#completer-bien", etape: "logement" };
  if (cle === "lot.equipements") return { href: "#completer-equipements", etape: "logement" };
  if (/^lot(?:\.|$)|^logement$/.test(cle)) return { href: "#completer-lot", etape: "logement" };
  if (cle === "chambre.plafond") return { href: "#loyer-plafond-colocation", etape: "loyer" };
  if (/^chambre(?:\.|$)/.test(cle)) return { href: "#completer-chambres", etape: "logement" };
  if (/^diagnostic(?:\.|$)/.test(cle)) return { href: "#completer-dpe", etape: "documents" };
  const champsLogement = new Set([
    "identifiant fiscal du logement", "autres parties du logement",
    "chauffage du logement", "eau chaude du logement", "locaux privatifs du logement",
  ]);
  if (champsLogement.has(champ.trim().toLocaleLowerCase("fr"))) {
    return { href: "#completer-lot", etape: "logement" };
  }
  const vers = (href: string, etape: string) => ({ href, etape });
  if (/^(commune|adresse du mandataire)$|carte et CCI|garantie financière|siret/i.test(champ)) return vers(`${racine}/${orgId}/profil`, "personnes");
  if (/Date d[’']entrée/i.test(champ)) return vers("#parcours-date_debut", "bail");
  if (/date prévue/i.test(champ)) return vers("#parcours-date_conclusion_prevue", "bail");
  if (/inventaire du mobilier/i.test(champ)) return vers("#inventaire", "documents");
  if (/jour du mois|jour d[’']échéance|montant mensuel|montant convenu|loyer \+ charges/i.test(champ)) return vers("#etape-bail-4", "loyer");
  if (/personne physique|naissance|jj\/mm|domicile ou siège|adresse actuelle|nom.*prénom|nom du colocataire|adresse électronique/i.test(champ)) return vers("#completer-personnes", "personnes");
  if (/durée réduite/i.test(champ)) return vers("#complements-resiliation", "clauses");
  if (/application des loyers de référence|servitude/i.test(champ)) return vers("#complements-conditions", "clauses");
  // Les références en €/m² concernent le loyer, pas la surface du logement.
  if (/loyer de référence|complément de loyer/i.test(champ)) return vers("#etape-bail-6", "clauses");
  if (/précédente location|précédent loyer|dernier loyer|dernier versement|dernière révision|loyer de référence|complément de loyer/i.test(champ)) return vers("#complements-precedent", "loyer");
  if (/honoraires|plafond de location|plafond état des lieux/i.test(champ)) return vers("#complements-honoraires", "loyer");
  if (/classe DPE/i.test(champ)) return vers("#completer-dpe", "documents");
  if (/dépenses annuelles|prix de l’énergie/i.test(champ)) return vers("#complements-energie", "documents");
  if (/fixation|indice|IRL|trimestre|paiement|virement|domicile du bailleur|libre, plafonnement/i.test(champ)) return vers("#complements-paiement", "loyer");
  if (/^montant$|travaux|clauses particulières/i.test(champ)) return vers("#complements-travaux", "clauses");
  if (/loyer maximum du logement/i.test(champ)) return vers("#loyer-plafond-colocation", "loyer");
  if (/chambre|surface privative|volume privatif|espaces partagés|équipements privatifs/i.test(champ)) return vers("#completer-chambres", "logement");
  if (/cuisine équipée|équipements du logement/i.test(champ)) return vers("#completer-equipements", "logement");
  if (/hall|fibre|construction|1949|adresse complète/i.test(champ)) return vers("#completer-bien", "logement");
  if (/m²|^nombre$|le cas échéant|cave|individuel ou collectif/i.test(champ)) return vers("#completer-lot", "logement");
  return vers("#complements-conditions", "clauses");
}
