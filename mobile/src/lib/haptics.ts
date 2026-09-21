import * as Haptics from 'expo-haptics'

async function safeHaptic(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch {
    // Haptics are best-effort (Expo Go, simulators, or devices without a
    // haptics motor). Never let feedback break the action it confirms.
  }
}

export function lightHaptic(): void {
  void safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
}

export function mediumHaptic(): void {
  void safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
}

export function successHaptic(): void {
  void safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
}

export function errorHaptic(): void {
  void safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))
}
