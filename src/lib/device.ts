/** Staff workspaces are desktop-only (like the member-only native app), so
 * mobile browsers skip role selection and land straight in the member shell. */
export function isMobileDevice(userAgent?: string): boolean {
  const ua =
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)
}
