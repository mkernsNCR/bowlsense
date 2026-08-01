export function emailIsExplicitlyAllowed(authenticatedEmail: string, configuredAllowedEmails?: string) {
  const email = authenticatedEmail.trim().toLowerCase();
  if (!email) return false;

  const allowedEmails = new Set(
    (configuredAllowedEmails || '')
      .split(',')
      .map((allowedEmail) => allowedEmail.trim().toLowerCase())
      .filter(Boolean),
  );

  return allowedEmails.size > 0 && allowedEmails.has(email);
}
