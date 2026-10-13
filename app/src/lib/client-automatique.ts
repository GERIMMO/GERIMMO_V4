/** Contrôle chaque écriture du client Stripe employé par un traitement automatique.
 * Les lectures gardent notamment leurs itérateurs asynchrones. Un client employé
 * par un geste utilisateur n'est pas enveloppé par ce contrôle de mission.
 */
export function protegerClientAutomatique<T extends object>(client: T, avantEffet: () => Promise<void>): T {
  const cache = new WeakMap<object, object>();
  const ecriture = /^(create|update|del|cancel|release|expire|finalize|pay|send|confirm|attach|detach|archive|activate|deactivate|void|capture|refund|approve|reject|resume|pause|close|increment|apply|verify|mark)/;
  const envelopper = <O extends object>(objet: O): O => {
    const existant = cache.get(objet);
    if (existant) return existant as O;
    const proxy = new Proxy(objet, {
      get(cible, cle) {
        const valeur = Reflect.get(cible, cle, cible);
        if (typeof valeur === 'function') {
          if (typeof cle === 'string' && ecriture.test(cle)) {
            return async (...args: unknown[]) => {
              await avantEffet();
              return Reflect.apply(valeur, cible, args);
            };
          }
          return valeur.bind(cible);
        }
        return valeur && typeof valeur === 'object' ? envelopper(valeur) : valeur;
      },
    });
    cache.set(objet, proxy);
    return proxy;
  };
  return envelopper(client);
}
