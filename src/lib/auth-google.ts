/** Additional server-side intent gate for Better Auth, not Calendar consent.
 * The caller must still require the existing GOOGLE_OAUTH capability/credentials.
 * No hostname, credential presence or Calendar flag implies login intent.
 */
export function isGoogleSignInOptedIn(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.ENDVERA_GOOGLE_SIGN_IN_ENABLED === "ENABLED";
}
