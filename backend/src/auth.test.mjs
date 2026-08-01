import assert from 'node:assert/strict';
import test from 'node:test';

import { trustedProxyEmailIsAllowed } from './auth.ts';

const proxyRequest = {
  authenticatedEmail: 'mkerns5@student.umgc.edu',
  suppliedProxySecret: 'shared-secret',
  configuredProxySecret: 'shared-secret',
};

test('trusted proxy authorization fails closed when the email allowlist is missing', () => {
  assert.equal(trustedProxyEmailIsAllowed({ ...proxyRequest, configuredAllowedEmails: undefined }), false);
});

test('trusted proxy authorization fails closed when the email allowlist is empty', () => {
  assert.equal(trustedProxyEmailIsAllowed({ ...proxyRequest, configuredAllowedEmails: ' , ' }), false);
});

test('trusted proxy authorization rejects an email outside the allowlist', () => {
  assert.equal(trustedProxyEmailIsAllowed({
    ...proxyRequest,
    authenticatedEmail: 'intruder@example.com',
    configuredAllowedEmails: 'mkerns5@student.umgc.edu',
  }), false);
});

test('trusted proxy authorization accepts a normalized email in the allowlist', () => {
  assert.equal(trustedProxyEmailIsAllowed({
    ...proxyRequest,
    authenticatedEmail: ' MKERNS5@STUDENT.UMGC.EDU ',
    configuredAllowedEmails: 'other@example.com, mkerns5@student.umgc.edu',
  }), true);
});
