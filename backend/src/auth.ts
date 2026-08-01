import { timingSafeEqual } from 'node:crypto';
import { emailIsExplicitlyAllowed } from '../../shared/email-allowlist.js';

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

  return emailIsExplicitlyAllowed(authenticatedEmail, configuredAllowedEmails);
}
