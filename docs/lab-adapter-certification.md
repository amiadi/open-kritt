# Lab-only adapter certification

No adapter may perform a target, network, firmware, device, exploit, or active-discovery operation in an open-kritt deployment until it completes this certification.

## Required evidence

1. **Adapter design record**: capability, action types, minimum privileges, explicit target syntax, exclusions, and failure states.
2. **Operation-boundary enforcement**: immutable scope, authorization-window, policy approval, risk classification, budget, cancellation, and deployment-mode checks immediately before every operation.
3. **Isolated lab tests**: disposable local test targets only; no public IPs, production credentials, customer data, or external provider fallback.
4. **Bounds tests**: concurrency, rate, byte, duration, operation-count, retry, and cancellation tests demonstrate that limits fail closed.
5. **Evidence controls**: canonical hashes, secret filtering, redaction tests, provenance receipts, and retention/deletion behavior.
6. **Independent review**: security owner and platform owner sign the reviewed adapter release record.
7. **Kill-switch rehearsal**: demonstrate operator cancellation, process restart recovery, and denial after authorization expiry.

## Release gate

The adapter is released only after all required evidence is stored with a versioned review record. Production enablement is separate from code merge and requires an explicit per-deployment configuration change. Until then, the adapter must declare `target_operations_enabled = false` and the reviewed runner must remain blocked.
