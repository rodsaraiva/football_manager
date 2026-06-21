import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Pressable, Text } from 'react-native';
import { ConfirmProvider, useConfirm } from '@/components/kit/useConfirm';

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <Pressable
      testID="go"
      onPress={async () => onResult(await confirm({ title: 'Vender?', message: 'Tem certeza?' }))}
    >
      <Text>go</Text>
    </Pressable>
  );
}

async function renderHarness(onResult: (v: boolean) => void): Promise<{ root: Root; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<ConfirmProvider><Harness onResult={onResult} /></ConfirmProvider>);
  });
  return { root, container };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => root.unmount());
  container.remove();
}

function clickTestId(id: string) {
  const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

describe('useConfirm', () => {
  it('resolve true ao confirmar', async () => {
    const onResult = jest.fn();
    const { root, container } = await renderHarness(onResult);
    await act(async () => { clickTestId('go'); });
    await act(async () => { clickTestId('confirm-yes'); });
    expect(onResult).toHaveBeenCalledWith(true);
    cleanup(root, container);
  });

  it('resolve false ao cancelar', async () => {
    const onResult = jest.fn();
    const { root, container } = await renderHarness(onResult);
    await act(async () => { clickTestId('go'); });
    await act(async () => { clickTestId('confirm-no'); });
    expect(onResult).toHaveBeenCalledWith(false);
    cleanup(root, container);
  });

  it('lança erro claro se usado sem provider', () => {
    function Bare() { useConfirm(); return null; }
    const container = document.createElement('div');
    document.body.appendChild(container);
    expect(() => {
      act(() => { createRoot(container).render(<Bare />); });
    }).toThrow(/ConfirmProvider/);
    container.remove();
  });
});
