import {expect,it} from 'vitest';
import {texteVeillePourPublic} from '@/lib/veille-public';
it('préserve une information dédiée au locataire',()=>expect(texteVeillePourPublic('Vérifiez votre DPE',['locataire'],'locataire',false)).toBe('Vérifiez votre DPE'));
it('ne transforme pas une consigne SQL en tâche locataire',()=>expect(texteVeillePourPublic('Exécuter la migration SQL',['locataire'],'locataire',true)).not.toContain('SQL'));
it('ne mélange pas les actions de plusieurs profils',()=>expect(texteVeillePourPublic('Agences : modifier les calculs',['agence','locataire'],'locataire',true)).toContain('gestionnaire'));
