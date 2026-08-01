import assert from 'node:assert/strict';
import test from 'node:test';

import { trustedProxyEmailIsAllowed } from './auth.ts';

const ALLOWED_EMAIL = 'owner@example.com';

const proxyRequest = {
  authenticatedEmail: ALLOWED_EMAIL,
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
    configuredAllowedEmails: ALLOWED_EMAIL,
  }), false);
});

test('trusted proxy authorization accepts a normalized email in the allowlist', () => {
  assert.equal(trustedProxyEmailIsAllowed({
    ...proxyRequest,
    authenticatedEmail: ' OWNER@EXAMPLE.COM ',
    configuredAllowedEmails: `other@example.com, ${ALLOWED_EMAIL}`,
  }), true);
});

test('trusted proxy authorization fails closed when the configured secret is empty', () => {
  assert.equal(trustedProxyEmailIsAllowed({
    ...proxyRequest,
    configuredProxySecret: '',
    configuredAllowedEmails: ALLOWED_EMAIL,
  }), false);
});

test('trusted proxy authorization rejects an equal-length mismatched secret', () => {
  assert.equal(trustedProxyEmailIsAllowed({
    ...proxyRequest,
    suppliedProxySecret: 'wrong-secret!',
    configuredAllowedEmails: ALLOWED_EMAIL,
  }), false);
});

test('trusted proxy authorization rejects a different-length secret without throwing', () => {
  assert.doesNotThrow(() => trustedProxyEmailIsAllowed({
    ...proxyRequest,
    suppliedProxySecret: 'short',
    configuredAllowedEmails: ALLOWED_EMAIL,
  }));
  assert.equal(trustedProxyEmailIsAllowed({
    ...proxyRequest,
    suppliedProxySecret: 'short',
    configuredAllowedEmails: ALLOWED_EMAIL,
  }), false);
});
