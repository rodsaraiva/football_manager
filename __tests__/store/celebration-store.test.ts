import { useCelebrationStore } from '@/store/celebration-store';

beforeEach(() => { useCelebrationStore.getState().clear(); });

it('push adiciona com id estável (não Date.now) e dismiss remove', () => {
  const s = useCelebrationStore.getState();
  s.push({ kind: 'overall_up', titleKey: 'celebration.overall_up', detail: '+1' });
  s.push({ kind: 'trophy', titleKey: 'celebration.trophy' });
  const q = useCelebrationStore.getState().queue;
  expect(q).toHaveLength(2);
  expect(q[0].id).not.toBe(q[1].id);          // ids únicos
  expect(q[0].id).toBe('c1');                 // counter monotônico, determinístico
  expect(q[1].id).toBe('c2');
  useCelebrationStore.getState().dismiss('c1');
  expect(useCelebrationStore.getState().queue.map((c) => c.id)).toEqual(['c2']);
});

it('clear esvazia a fila', () => {
  const s = useCelebrationStore.getState();
  s.push({ kind: 'transfer', titleKey: 'celebration.transfer' });
  s.clear();
  expect(useCelebrationStore.getState().queue).toHaveLength(0);
});
