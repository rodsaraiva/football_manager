// expo-sqlite não roda em jsdom — as telas só importam o módulo via database-store;
// o DB real usado nos testes é injetado por wrapBetterSqlite, então o mock só precisa existir.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({})),
}));

// react-native-svg: stub leve que renderiza nada (evita parsing de assets nativos).
jest.mock('react-native-svg', () => {
  const React = require('react');
  const Stub = (props: Record<string, unknown>) => React.createElement('svg', props, props.children as React.ReactNode);
  return new Proxy({ default: Stub }, { get: () => Stub });
});

// reanimated: usa o mock oficial.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// @react-navigation/native: as telas usam useFocusEffect; stub para chamar o effect uma vez.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const React = require('react');
  return {
    ...actual,
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, []),
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
    useRoute: () => ({ params: {} }),
  };
});

// Silencia o aviso de act() do RN em testes de smoke.
jest.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
  if (typeof msg === 'string' && msg.includes('not wrapped in act')) return;
  // eslint-disable-next-line no-console
  (console as unknown as { _error?: (m?: unknown) => void })._error?.(msg);
});
