import { expect, it } from "vitest";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
it.each([
  ["jour du mois", "loyer", "#etape-bail-4"],
  ["Jour d’échéance du loyer", "loyer", "#etape-bail-4"],
  ["commune de naissance", "personnes", "#completer-personnes"],
  ["adresse complète, étage, porte", "logement", "#completer-bien"],
  ["loyer de référence €/m²", "clauses", "#etape-bail-6"],
  ["loyer de référence majoré €/m²", "clauses", "#etape-bail-6"],
  ["justification du complément de loyer", "clauses", "#etape-bail-6"],
  ["en m²", "logement", "#completer-lot"],
  ["cuisine équipée, sanitaires, placards…", "logement", "#completer-equipements"],
  ["classe DPE du logement", "documents", "#completer-dpe"],
  ["hall, ascenseur, local vélos…", "logement", "#completer-bien"],
  ["fibre, câble, TNT…", "logement", "#completer-bien"],
  ["existence de la servitude de résidence principale à vérifier", "clauses", "#complements-conditions"],
  ["application des loyers de référence à vérifier", "clauses", "#complements-conditions"],
  ["libre, plafonnement, réévaluation après travaux…", "loyer", "#complements-paiement"],
  ["domicile du bailleur, virement…", "loyer", "#complements-paiement"],
  ["valeur de l'indice", "loyer", "#complements-paiement"],
  ["ex. 2e trimestre 2026", "loyer", "#etape-bail-4"],
  ["Date d’entrée du bail", "bail", "#etape-bail-1"],
  ["montant mensuel", "loyer", "#etape-bail-4"],
  ["montant", "clauses", "#complements-travaux"],
  ["dépenses annuelles minimales du DPE", "documents", "#complements-energie"],
  ["année(s) des prix de l’énergie du DPE", "documents", "#complements-energie"],
  ["volume privatif", "logement", "#completer-chambres"],
  ["honoraires état des lieux — locataire", "loyer", "#complements-honoraires"],
  ["commune", "personnes", "/agence/org/profil"],
])("oriente %s vers le formulaire qui enregistre la donnée", (champ, etape, href) => {
  expect(cibleChampBail(champ, "org")).toEqual({etape, href});
});
