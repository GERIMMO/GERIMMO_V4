import { expect, it } from "vitest";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { CHAMPS_ETAPE_BAIL, ETAPES_BAIL, indexEtapeBail } from "@/lib/champs-etape-bail";
it.each([
  ["identifiant fiscal du logement", "logement", "#completer-lot"],
  ["autres parties du logement", "logement", "#completer-lot"],
  ["chauffage du logement", "logement", "#completer-lot"],
  ["eau chaude du logement", "logement", "#completer-lot"],
  ["locaux privatifs du logement", "logement", "#completer-lot"],
  ["jour du mois", "loyer", "#parcours-jour_echeance"],
  ["Jour d’échéance du loyer", "loyer", "#parcours-jour_echeance"],
  ["commune de naissance", "personnes", "#titre-locataires-bail"],
  ["adresse complète, étage, porte", "logement", "#completer-bien"],
  ["loyer de référence €/m²", "clauses", "#parcours-loyer_reference"],
  ["loyer de référence majoré €/m²", "clauses", "#parcours-loyer_reference_majore"],
  ["justification du complément de loyer", "clauses", "#parcours-complement_justification"],
  ["en m²", "logement", "#completer-lot"],
  ["cuisine équipée, sanitaires, placards…", "logement", "#completer-equipements"],
  ["classe DPE du logement", "documents", "#completer-dpe"],
  ["hall, ascenseur, local vélos…", "logement", "#completer-bien"],
  ["fibre, câble, TNT…", "logement", "#completer-bien"],
  ["existence de la servitude de résidence principale à vérifier", "clauses", "#parcours-servitude_residence_principale"],
  ["application des loyers de référence à vérifier", "clauses", "#parcours-encadrement_loyer"],
  ["libre, plafonnement, réévaluation après travaux…", "loyer", "#parcours-fixation_loyer"],
  ["domicile du bailleur, virement…", "loyer", "#parcours-lieu_paiement"],
  ["valeur de l'indice", "loyer", "#parcours-irl_valeur"],
  ["ex. 2e trimestre 2026", "loyer", "#parcours-irl_trimestre"],
  ["événement précis justifiant une durée réduite", "clauses", "#parcours-duree_reduite_evenement"],
  ["Date d’entrée du bail", "bail", "#parcours-date_debut"],
  ["montant mensuel", "loyer", "#parcours-loyer_hc"],
  ["montant", "clauses", "#parcours-travaux_recents_montant"],
  ["dépenses annuelles minimales du DPE", "documents", "#parcours-dpe_depenses_min"],
  ["année(s) des prix de l’énergie du DPE", "documents", "#parcours-dpe_annees_reference"],
  ["volume privatif", "logement", "#completer-chambres"],
  ["honoraires état des lieux — locataire", "loyer", "#parcours-honoraires_edl_locataire"],
  ["commune", "personnes", "/agence/org/profil"],
])("oriente %s vers le formulaire qui enregistre la donnée", (champ, etape, href) => {
  expect(cibleChampBail(champ, "org")).toEqual({etape, href});
  if(href.startsWith("#"))expect(indexEtapeBail(href)).toBe(ETAPES_BAIL.findIndex(e=>e.id===etape));
});

it("donne une cible exacte pour chaque champ de saisie, avec ou sans préfixe bail", () => {
  for(const [etape,champs] of Object.entries(CHAMPS_ETAPE_BAIL))for(const champ of champs){
    const attendu={href:`#parcours-${champ}`,etape};
    expect(cibleChampBail(champ,"org")).toEqual(attendu);
    expect(cibleChampBail(`bail.${champ}`,"org")).toEqual(attendu);
    expect(indexEtapeBail(attendu.href)).toBe(ETAPES_BAIL.findIndex(e=>e.id===etape));
  }
});

it.each([
  ["bail.locataire_principal","#titre-locataires-bail",1],
  ["proprietaire.nom","#titre-proprietaires-bail",1],
  ["locataire.date_naissance","#titre-locataires-bail",1],
  ["garant.email","#titre-garants-bail",1],
  ["bien.address_line1","#completer-bien",2],
  ["lot.chauffage","#completer-lot",2],
  ["lot.equipements","#completer-equipements",2],
  ["chambre.nom","#completer-chambres",2],
  ["diagnostic.classe_dpe","#completer-dpe",4],
  ["adresse électronique","#completer-personnes",1],
  ["jj/mm/aaaa","#titre-locataires-bail",1],
] as const)("oriente aussi la correction connue %s vers sa rubrique",(champ,href,index)=>{
  expect(cibleChampBail(champ,"org").href).toBe(href);
  expect(indexEtapeBail(href)).toBe(index);
});

it("ignore une ancre de champ inconnue ou mal encodée",()=>{
  expect(indexEtapeBail("#parcours-loyer_inconnu")).toBe(-1);
  expect(indexEtapeBail("#parcours-%E0%A4%A")).toBe(-1);
  expect(indexEtapeBail("#parcours-date%5Fdebut")).toBe(0);
});

it.each(["#annexes-attendues", "#assurances-bail"])("ouvre l’étape documents pour %s", ancre => {
  expect(indexEtapeBail(ancre)).toBe(4);
});
