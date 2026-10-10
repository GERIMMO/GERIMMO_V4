/** Liens communs au contrôle du dossier et aux erreurs de génération. */
export function cibleChampBail(champ: string, orgId: string): { href: string; etape: string } {
  const vers = (href: string, etape: string) => ({ href, etape });
  if (/^(commune|adresse du mandataire)$|carte et CCI|garantie financière|siret/i.test(champ)) return vers(`/agence/${orgId}/profil`, "personnes");
  if (/Date d’entrée|date prévue/i.test(champ)) return vers("#etape-bail-1", "bail");
  if (/inventaire du mobilier/i.test(champ)) return vers("#inventaire", "documents");
  if (/jour du mois|jour d[’']échéance|montant mensuel|montant convenu|loyer \+ charges|trimestre/i.test(champ)) return vers("#etape-bail-4", "loyer");
  if (/personne physique|naissance|jj\/mm|domicile ou siège|adresse actuelle|nom.*prénom|nom du colocataire|adresse électronique/i.test(champ)) return vers("#completer-personnes", "personnes");
  if (/application des loyers de référence|servitude|durée réduite/i.test(champ)) return vers("#complements-conditions", "clauses");
  // Les références en €/m² concernent le loyer, pas la surface du logement.
  if (/loyer de référence|complément de loyer/i.test(champ)) return vers("#etape-bail-6", "clauses");
  if (/précédente location|précédent loyer|dernier loyer|dernier versement|dernière révision|loyer de référence|complément de loyer/i.test(champ)) return vers("#complements-precedent", "loyer");
  if (/honoraires|plafond de location|plafond état des lieux/i.test(champ)) return vers("#complements-honoraires", "loyer");
  if (/classe DPE/i.test(champ)) return vers("#completer-dpe", "documents");
  if (/dépenses annuelles|prix de l’énergie/i.test(champ)) return vers("#complements-energie", "documents");
  if (/fixation|indice|IRL|paiement|virement|domicile du bailleur|libre, plafonnement/i.test(champ)) return vers("#complements-paiement", "loyer");
  if (/^montant$|travaux|clauses particulières/i.test(champ)) return vers("#complements-travaux", "clauses");
  if (/loyer maximum du logement/i.test(champ)) return vers("#loyer-plafond-colocation", "loyer");
  if (/chambre|surface privative|volume privatif|espaces partagés|équipements privatifs/i.test(champ)) return vers("#completer-chambres", "logement");
  if (/cuisine équipée|équipements du logement/i.test(champ)) return vers("#completer-equipements", "logement");
  if (/hall|fibre|construction|1949|adresse complète/i.test(champ)) return vers("#completer-bien", "logement");
  if (/m²|^nombre$|le cas échéant|cave|individuel ou collectif/i.test(champ)) return vers("#completer-lot", "logement");
  return vers("#complements-conditions", "clauses");
}
