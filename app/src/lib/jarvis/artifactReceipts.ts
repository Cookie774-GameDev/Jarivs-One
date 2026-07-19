/** @internal Deep-module composition type; never in a public barrel. */
export type CanonicalArtifactProducerId =
  | 'provider_response'
  | 'file_action_result'
  | 'terminal_exit'
  | 'plugin_result'
  | 'mcp_result'
  | 'schedule_result';

/** @internal Deep-module composition type; never in a public barrel. */
export type ArtifactReceiptBinding = {
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  artifactId: string;
  producerId: CanonicalArtifactProducerId;
  resultRef: string;
  artifactDigest: string;
  verifiedAt: number;
};

/** @internal Producer metadata before canonical artifact bytes are known. */
export type ArtifactPreDigestBinding = Omit<ArtifactReceiptBinding, 'artifactDigest'>;

const artifactVerificationReceiptBrand: unique symbol = Symbol(
  'jarvis.artifact-verification-receipt',
);
const verifiedArtifactBindingBrand: unique symbol = Symbol('jarvis.verified-artifact-binding');

/** @internal Deep-module composition type; never in a public barrel. */
export type ArtifactVerificationReceipt = Readonly<{
  receiptId: string;
  issuedAt: number;
  [artifactVerificationReceiptBrand]: true;
}>;

/** @internal Deep-module composition type; never in a public barrel. */
export type VerifiedArtifactBinding = Readonly<
  ArtifactReceiptBinding & {
    receiptId: string;
    issuedAt: number;
    [verifiedArtifactBindingBrand]: true;
  }
>;

/** @internal Deep-module composition type; never in a public barrel. */
export type VerifyAndBindReceiptInput = {
  receipt: ArtifactVerificationReceipt;
  binding: ArtifactReceiptBinding;
};

/** @internal Deep-module composition type; never in a public barrel. */
export type PrivateArtifactReceiptIssuer = {
  issueReceipt(binding: ArtifactReceiptBinding): ArtifactVerificationReceipt;
  verifyAndBindReceipt(input: VerifyAndBindReceiptInput): VerifiedArtifactBinding | null;
};

const PRODUCERS = new Set<CanonicalArtifactProducerId>([
  'provider_response',
  'file_action_result',
  'terminal_exit',
  'plugin_result',
  'mcp_result',
  'schedule_result',
]);

function stableText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function unixMilliseconds(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validBinding(value: ArtifactReceiptBinding): boolean {
  return (
    stableText(value.accountId) &&
    stableText(value.runId) &&
    stableText(value.requestId) &&
    Number.isSafeInteger(value.attemptNumber) &&
    value.attemptNumber > 0 &&
    stableText(value.artifactId) &&
    value.artifactId.startsWith('jart_') &&
    PRODUCERS.has(value.producerId) &&
    stableText(value.resultRef) &&
    stableText(value.artifactDigest) &&
    /^[a-f0-9]{64}$/i.test(value.artifactDigest) &&
    unixMilliseconds(value.verifiedAt)
  );
}

function exactBinding(left: ArtifactReceiptBinding, right: ArtifactReceiptBinding): boolean {
  return (
    left.accountId === right.accountId &&
    left.runId === right.runId &&
    left.requestId === right.requestId &&
    left.attemptNumber === right.attemptNumber &&
    left.artifactId === right.artifactId &&
    left.producerId === right.producerId &&
    left.resultRef === right.resultRef &&
    left.artifactDigest === right.artifactDigest &&
    left.verifiedAt === right.verifiedAt
  );
}

function copyBinding(value: ArtifactReceiptBinding): ArtifactReceiptBinding {
  return {
    accountId: value.accountId,
    runId: value.runId,
    requestId: value.requestId,
    attemptNumber: value.attemptNumber,
    artifactId: value.artifactId,
    producerId: value.producerId,
    resultRef: value.resultRef,
    artifactDigest: value.artifactDigest,
    verifiedAt: value.verifiedAt,
  };
}

/** @internal Imported only by artifactRuntimeInternals.ts and focused tests. */
export function createArtifactReceiptAuthority(input: {
  randomUUID: () => string;
  now: () => number;
}): PrivateArtifactReceiptIssuer {
  const issued = new WeakMap<ArtifactVerificationReceipt, ArtifactReceiptBinding>();

  return Object.freeze({
    issueReceipt(binding: ArtifactReceiptBinding): ArtifactVerificationReceipt {
      if (!validBinding(binding)) throw new Error('artifact_receipt_binding_invalid');
      const issuedAt = input.now();
      if (!unixMilliseconds(issuedAt)) throw new Error('artifact_receipt_timestamp_invalid');
      const uuid = input.randomUUID();
      if (!stableText(uuid)) throw new Error('artifact_receipt_id_invalid');
      const receiptValue = {
        receiptId: `jart_${uuid}`,
        issuedAt,
      } as ArtifactVerificationReceipt;
      Object.defineProperty(receiptValue, artifactVerificationReceiptBrand, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
      const receipt = Object.freeze(receiptValue);
      issued.set(receipt, Object.freeze(copyBinding(binding)));
      return receipt;
    },

    verifyAndBindReceipt({
      receipt,
      binding,
    }: VerifyAndBindReceiptInput): VerifiedArtifactBinding | null {
      const expected = issued.get(receipt);
      if (!expected) return null;
      issued.delete(receipt);
      if (!validBinding(binding) || !exactBinding(expected, binding)) return null;
      const verifiedValue = {
        ...copyBinding(binding),
        receiptId: receipt.receiptId,
        issuedAt: receipt.issuedAt,
      } as VerifiedArtifactBinding;
      Object.defineProperty(verifiedValue, verifiedArtifactBindingBrand, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
      return Object.freeze(verifiedValue);
    },
  });
}
