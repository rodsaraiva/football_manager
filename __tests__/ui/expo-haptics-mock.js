// Stub de expo-haptics p/ o projeto jsdom: a source é ESM (expo-modules-core) e não é
// transformada. No web triggerHaptic é no-op de qualquer forma; aqui só precisamos que
// o módulo exista.
module.exports = {
  __esModule: true,
  impactAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
};
