const impactMock = jest.fn();
const notifyMock = jest.fn();
jest.mock('expo-haptics', () => ({
  impactAsync: (...a: unknown[]) => impactMock(...a),
  notificationAsync: (...a: unknown[]) => notifyMock(...a),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

let osValue = 'ios';
jest.mock('react-native', () => ({ Platform: { get OS() { return osValue; } } }));

import { triggerHaptic } from '@/motion/haptics';

beforeEach(() => { impactMock.mockClear(); notifyMock.mockClear(); osValue = 'ios'; });

it('enabled=false → no-op', () => {
  triggerHaptic('light', false);
  expect(impactMock).not.toHaveBeenCalled();
  expect(notifyMock).not.toHaveBeenCalled();
});

it('web → no-op mesmo com enabled', () => {
  osValue = 'web';
  triggerHaptic('success', true);
  expect(impactMock).not.toHaveBeenCalled();
  expect(notifyMock).not.toHaveBeenCalled();
});

it('native + enabled → chama o haptic correspondente', () => {
  triggerHaptic('light', true);
  expect(impactMock).toHaveBeenCalledTimes(1);
  triggerHaptic('success', true);
  expect(notifyMock).toHaveBeenCalledTimes(1);
});
