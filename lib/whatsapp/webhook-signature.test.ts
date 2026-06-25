import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaWebhookSignature } from "./webhook-signature";

// The verifier takes the App Secret explicitly (it's resolved from the
// per-account WhatsApp config / env by the caller), so these tests are
// fully self-contained — no environment juggling required.
const TEST_SECRET = "unit-test-meta-app-secret";

function signedHeader(body: string, secret: string = TEST_SECRET): string {
  const hex = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

describe("verifyMetaWebhookSignature", () => {
  it("accepts a request signed with the correct secret", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    expect(
      verifyMetaWebhookSignature(body, signedHeader(body), TEST_SECRET),
    ).toBe(true);
  });

  it("rejects a signature computed with a different secret", () => {
    const body = "{}";
    expect(
      verifyMetaWebhookSignature(body, signedHeader(body, "wrong"), TEST_SECRET),
    ).toBe(false);
  });

  it("rejects when the body has been tampered with after signing", () => {
    const original = '{"entry":[]}';
    const header = signedHeader(original);
    const tampered = '{"entry":[{"id":"injected"}]}';
    expect(verifyMetaWebhookSignature(tampered, header, TEST_SECRET)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyMetaWebhookSignature("anything", null, TEST_SECRET)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", () => {
    const body = "{}";
    const hex = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(body)
      .digest("hex");
    expect(verifyMetaWebhookSignature(body, hex, TEST_SECRET)).toBe(false);
    expect(verifyMetaWebhookSignature(body, `sha512=${hex}`, TEST_SECRET)).toBe(
      false,
    );
  });

  it("rejects a header of the wrong length without throwing", () => {
    // timingSafeEqual would throw on length mismatch — the guard inside
    // the verifier should catch this and return false instead.
    expect(verifyMetaWebhookSignature("{}", "sha256=tooshort", TEST_SECRET)).toBe(
      false,
    );
  });

  describe("fail-closed when secret is missing", () => {
    it("rejects even a correctly-formed signature when no secret is configured", () => {
      const body = "{}";
      // Sign with a real secret, but verify with none configured — the
      // verifier must reject because it cannot authenticate the payload.
      const header = signedHeader(body, TEST_SECRET);
      expect(verifyMetaWebhookSignature(body, header, null)).toBe(false);
      expect(verifyMetaWebhookSignature(body, header, "")).toBe(false);
      expect(verifyMetaWebhookSignature(body, header, undefined)).toBe(false);
    });
  });
});
