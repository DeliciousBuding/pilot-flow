import assert from "node:assert/strict";
import test from "node:test";
import { createWebhookVerifier, verifyFeishuWebhookSignature, verifyFeishuVerificationToken } from "../../../src/gateway/feishu/webhook-server.js";

test("verifyFeishuWebhookSignature validates Feishu SHA-256 signature with replay checks", () => {
  const body = "{\"type\":\"event_callback\"}";
  const timestamp = "1700000000";
  const nonce = "nonce-1";
  const encryptKey = "encrypt-key";
  const signature = "7b2a9431588ca617291fcbf3437f30362f12e413c896947b1315608515a2cd48";
  const seen = new Map<string, number>();

  assert.equal(verifyFeishuWebhookSignature({ timestamp, nonce, signature, encryptKey, body, nowMs: 1700000000_000, seenNonces: seen }), true);
  assert.equal(verifyFeishuWebhookSignature({ timestamp, nonce, signature, encryptKey, body, nowMs: 1700000000_000, seenNonces: seen }), false);
});

test("verifyFeishuVerificationToken reads v1 and v2 token locations", () => {
  assert.equal(verifyFeishuVerificationToken({ token: "t1" }, "t1"), true);
  assert.equal(verifyFeishuVerificationToken({ header: { token: "t2" } }, "t2"), true);
  assert.equal(verifyFeishuVerificationToken({ header: { token: "bad" } }, "t2"), false);
  assert.equal(verifyFeishuVerificationToken({}, ""), false);
});

test("createWebhookVerifier requires token, encrypt key, and nonce store", () => {
  assert.throws(() => createWebhookVerifier({ verificationToken: "", encryptKey: "k", seenNonces: new Map() }), /VERIFICATION_TOKEN/);
  assert.throws(() => createWebhookVerifier({ verificationToken: "t", encryptKey: "", seenNonces: new Map() }), /ENCRYPT_KEY/);

  const verifier = createWebhookVerifier({
    verificationToken: "token",
    encryptKey: "encrypt-key",
    seenNonces: new Map(),
    nowMs: () => 1700000000_000,
  });
  assert.equal(verifier.verifyToken({ header: { token: "token" } }), true);
});
