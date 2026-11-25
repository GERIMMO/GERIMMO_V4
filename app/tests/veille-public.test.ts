import {expect,it} from 'vitest';
import {texteVeillePourPublic} from '@/lib/veille-public';
it('préserve une information dédiée au locataire',()=>expect(texteVeillePourPublic('Vérifiez votre DPE',['locataire'],'locataire',false)).toBe('Vérifiez votre DPE'));
it('ne transforme pas une consigne SQL en tâche locataire',()=>expect(texteVeillePourPublic('Exécuter la migration SQL',['locataire'],'locataire',true)).not.toContain('SQL'));
// Lot 47 : le renvoi disait « écrivez à votre gestionnaire », faux pour le locataire d'un propriétaire qui gère lui-même ;
// la page publique ne connaît pas l'espace, elle renvoie donc à la messagerie de l'espace, sans nommer de gestionnaire.
it('ne mélange pas les actions de plusieurs profils',()=>{
  const texte=texteVeillePourPublic('Agences : modifier les calculs',['agence','locataire'],'locataire',true);
  expect(texte).not.toContain('Agences');
  expect(texte).toContain('posez la question depuis la messagerie de votre espace');
  expect(texte).not.toContain('gestionnaire');
});
