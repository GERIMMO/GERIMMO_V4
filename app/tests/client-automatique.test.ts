import { expect, it, vi } from 'vitest';
import { protegerClientAutomatique } from '../src/lib/client-automatique';

it('un arrêt entre deux écritures empêche le second effet sans annuler le premier', async () => {
  const update = vi.fn().mockResolvedValue({ id: 'sub_test' });
  let arrete = false;
  const controle = vi.fn(async () => { if (arrete) throw new Error('arrêt'); });
  const client = protegerClientAutomatique({ subscriptions: { update } }, controle);
  await client.subscriptions.update('sub_test', { quantity: 2 });
  arrete = true;
  await expect(client.subscriptions.update('sub_test', { quantity: 3 })).rejects.toThrow('arrêt');
  expect(update).toHaveBeenCalledTimes(1);
  expect(controle).toHaveBeenCalledTimes(2);
});

it('une panne du contrôle bloque un avoir et conserve les lectures et leur contexte', async () => {
  const createBalanceTransaction = vi.fn();
  const customers = { id: 'contexte', retrieve() { return this.id; }, createBalanceTransaction };
  const client = protegerClientAutomatique({ customers }, async () => { throw new Error('indisponible'); });
  expect(client.customers.retrieve()).toBe('contexte');
  await expect(client.customers.createBalanceTransaction('cus_test', {})).rejects.toThrow('indisponible');
  expect(createBalanceTransaction).not.toHaveBeenCalled();
});

it('la pagination de lecture garde son itérateur et les échéanciers sont contrôlés', async () => {
  const controle = vi.fn(async () => {});
  const client = protegerClientAutomatique({
    taxRates: { async *list() { yield { id: 'tx_test' }; } },
    subscriptionSchedules: { create: vi.fn(async () => ({ id: 'sched_test' })), update: vi.fn(async () => ({})) },
  }, controle);
  const taux = [];
  for await (const t of client.taxRates.list()) taux.push(t.id);
  expect(taux).toEqual(['tx_test']);
  expect(controle).not.toHaveBeenCalled();
  await client.subscriptionSchedules.create();
  await client.subscriptionSchedules.update();
  expect(controle).toHaveBeenCalledTimes(2);
});
