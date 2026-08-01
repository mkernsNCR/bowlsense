import { timingSafeEqual } from 'node:crypto';

export function secretsMatch(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

interface TrustedProxyAuthorization {
  authenticatedEmail: string;
  suppliedProxySecret: string;
  configuredProxySecret: string;
  configuredAllowedEmails?: string;
}

export function trustedProxyEmailIsAllowed({
  authenticatedEmail,
  suppliedProxySecret,
  configuredProxySecret,
  configuredAllowedEmails,
}: TrustedProxyAuthorization) {
  if (!configuredProxySecret || !secretsMatch(suppliedProxySecret, configuredProxySecret)) return false;

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
