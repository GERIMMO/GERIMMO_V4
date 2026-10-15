// Le réglage de l'alerte e-mail du relais (D46-B) : les adresses, lues dans la variable du serveur
// GERIMMO_RELAIS_EMAILS. Le dépôt est public : aucune adresse réelle n'est écrite dans le code. Serveur seulement ;
// les écrans n'affichent que la forme masquée (`masquerAdresse`).
import "server-only";
import { lireAdressesRelais, type AdressesRelais } from "./relais-alerte";

export function adressesRelaisDuServeur(): AdressesRelais {
  return lireAdressesRelais(process.env.GERIMMO_RELAIS_EMAILS);
}
