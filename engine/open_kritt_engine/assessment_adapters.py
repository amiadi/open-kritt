"""Safety boundary for future assessment execution adapters.

This module is intentionally free of networking and device I/O. It provides the
immutable-snapshot checks an adapter must satisfy before an execution-capable
runner is introduced and keeps every action blocked today.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from types import MappingProxyType
from typing import Any, Protocol

BLOCKED_EXECUTION_REASON = "Assessment target execution is not enabled in this engine build."
APPROVABLE_RISK_CLASSES = frozenset({"passive", "safe_active"})
ASSESSMENT_CAPABILITIES = frozenset({"infrastructure", "web_application", "embedded"})


@dataclass(frozen=True)
class AssessmentExecutionDecision:
    """The policy result supplied to a future adapter runner."""

    allowed: bool
    reason: str


@dataclass(frozen=True)
class AssessmentPolicyReceipt:
    """Deterministic audit record for one frozen runner-policy evaluation."""

    adapter_id: str
    target: str
    evaluated_at: str
    allowed: bool
    reason: str
    request_digest: str


def serialize_policy_receipt(receipt: AssessmentPolicyReceipt) -> dict[str, str | bool]:
    """Return a JSON-safe policy receipt for durable audit storage or export."""

    return {
        "adapterId": receipt.adapter_id,
        "target": receipt.target,
        "evaluatedAt": receipt.evaluated_at,
        "allowed": receipt.allowed,
        "reason": receipt.reason,
        "requestDigest": receipt.request_digest,
    }


def parse_policy_receipt(value: Mapping[str, Any]) -> AssessmentPolicyReceipt | None:
    """Parse only complete, well-formed policy evidence; reject everything else."""

    adapter_id = value.get("adapterId")
    target = value.get("target")
    evaluated_at = value.get("evaluatedAt")
    allowed = value.get("allowed")
    reason = value.get("reason")
    request_digest = value.get("requestDigest")
    if (
        not isinstance(adapter_id, str)
        or not adapter_id.strip()
        or not isinstance(target, str)
        or not target.strip()
        or not isinstance(evaluated_at, str)
        or _as_datetime(evaluated_at) is None
        or not isinstance(allowed, bool)
        or allowed
        or not isinstance(reason, str)
        or not reason.strip()
        or not isinstance(request_digest, str)
        or len(request_digest) != 64
        or any(character not in "0123456789abcdef" for character in request_digest)
    ):
        return None
    return AssessmentPolicyReceipt(adapter_id, target, evaluated_at, allowed, reason, request_digest)


@dataclass(frozen=True)
class AssessmentAdapterContract:
    """Static identity and capability declaration for a future reviewed adapter.

    Contracts do not carry credentials, targets, or network clients. They are safe
    to register and validate while assessment execution remains disabled.
    """

    adapter_id: str
    supported_capabilities: frozenset[str]


@dataclass(frozen=True)
class AssessmentExecutionRequest:
    """Frozen inputs a future runner must submit through the policy boundary."""

    adapter: AssessmentAdapterContract
    action_snapshot: Mapping[str, Any]
    run_snapshot: Mapping[str, Any]
    target: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "action_snapshot", _freeze_snapshot(self.action_snapshot))
        object.__setattr__(self, "run_snapshot", _freeze_snapshot(self.run_snapshot))


class AssessmentAdapter(Protocol):
    """Pure planning contract; implementations must not perform target I/O."""

    contract: AssessmentAdapterContract

    def describe(self) -> Mapping[str, str]:
        """Return static adapter metadata without contacting a target."""

        ...


def _freeze_snapshot(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({key: _freeze_snapshot(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze_snapshot(item) for item in value)
    if isinstance(value, set):
        return frozenset(_freeze_snapshot(item) for item in value)
    return value


def adapter_assignment_decision(
    adapter: AssessmentAdapterContract, run: Mapping[str, Any]
) -> AssessmentExecutionDecision:
    """Validate a static adapter assignment without granting execution authority."""

    capability = run.get("capability")
    if not isinstance(adapter.adapter_id, str) or not adapter.adapter_id.strip():
        return AssessmentExecutionDecision(False, "Assessment adapter identity is required.")
    if not isinstance(capability, str) or capability not in ASSESSMENT_CAPABILITIES:
        return AssessmentExecutionDecision(False, "Assessment run has no supported capability.")
    if capability not in adapter.supported_capabilities:
        return AssessmentExecutionDecision(False, "Assessment adapter does not support this run capability.")
    return AssessmentExecutionDecision(False, BLOCKED_EXECUTION_REASON)


def adapter_execution_admission(
    request: AssessmentExecutionRequest, *, now: datetime | None = None
) -> AssessmentExecutionDecision:
    """Apply all static and immutable run gates through one fail-closed entry point."""

    adapter_decision = adapter_assignment_decision(request.adapter, request.run_snapshot)
    if adapter_decision.reason != BLOCKED_EXECUTION_REASON:
        return adapter_decision
    budget_decision = execution_budget_decision(request.action_snapshot, request.run_snapshot)
    if budget_decision.reason != BLOCKED_EXECUTION_REASON:
        return budget_decision
    return assessment_execution_decision(request.action_snapshot, request.run_snapshot, request.target, now=now)


def assessment_policy_receipt(
    request: AssessmentExecutionRequest, *, now: datetime | None = None
) -> AssessmentPolicyReceipt:
    """Return an auditable result bound to the canonical frozen request payload."""

    evaluated_at = (now or datetime.now(UTC)).astimezone(UTC)
    decision = adapter_execution_admission(request, now=evaluated_at)
    payload = {
        "action": _json_value(request.action_snapshot),
        "adapterId": request.adapter.adapter_id,
        "run": _json_value(request.run_snapshot),
        "target": request.target,
    }
    request_digest = sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return AssessmentPolicyReceipt(
        adapter_id=request.adapter.adapter_id,
        target=request.target,
        evaluated_at=evaluated_at.isoformat().replace("+00:00", "Z"),
        allowed=decision.allowed,
        reason=decision.reason,
        request_digest=request_digest,
    )


def policy_receipt_is_valid(
    receipt: AssessmentPolicyReceipt, request: AssessmentExecutionRequest, *, now: datetime | None = None
) -> bool:
    """Confirm a stored receipt exactly matches a fresh policy evaluation."""

    replay_time = now or _as_datetime(receipt.evaluated_at)
    return replay_time is not None and receipt == assessment_policy_receipt(request, now=replay_time)


def _json_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, frozenset)):
        return [_json_value(item) for item in value]
    return value


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def authorization_is_current(snapshot: Mapping[str, Any], now: datetime | None = None) -> bool:
    """Require a valid frozen authorization window, never a mutable source row."""

    valid_from = _as_datetime(snapshot.get("validFrom"))
    valid_until = _as_datetime(snapshot.get("validUntil"))
    current = (now or datetime.now(UTC)).astimezone(UTC)
    return bool(valid_from and valid_until and valid_from <= current < valid_until)


def target_is_in_scope(scope_snapshot: Mapping[str, Any], target: str) -> bool:
    """Allow exact targets only; exclusions always win and no wildcard expansion occurs."""

    normalized = target.strip()
    targets = scope_snapshot.get("targets")
    exclusions = scope_snapshot.get("exclusions")
    if not normalized or not isinstance(targets, (list, tuple)) or not isinstance(exclusions, (list, tuple)):
        return False
    allowed = {value.strip() for value in targets if isinstance(value, str)}
    denied = {value.strip() for value in exclusions if isinstance(value, str)}
    return normalized in allowed and normalized not in denied


def active_testing_is_approved(policy_snapshot: Mapping[str, Any]) -> bool:
    """Require an accountable, frozen approval for bounded safe-active work."""

    approval = policy_snapshot.get("active_testing")
    if not isinstance(approval, Mapping) or approval.get("allowed") is not True:
        return False
    return bool(
        isinstance(approval.get("approved_by"), str)
        and approval["approved_by"].strip()
        and isinstance(approval.get("approval_reference"), str)
        and approval["approval_reference"].strip()
    )


def execution_budget_decision(action: Mapping[str, Any], run: Mapping[str, Any]) -> AssessmentExecutionDecision:
    """Require a finite, frozen operation budget before any future adapter work."""

    policy = run.get("policySnapshot")
    budget = policy.get("execution_budget") if isinstance(policy, Mapping) else None
    if not isinstance(budget, Mapping):
        return AssessmentExecutionDecision(False, "Frozen execution budget is required.")
    maximum = budget.get("max_operations")
    requested = action.get("planned_operations")
    if (
        not isinstance(maximum, int)
        or isinstance(maximum, bool)
        or maximum < 1
        or not isinstance(requested, int)
        or isinstance(requested, bool)
        or requested < 1
    ):
        return AssessmentExecutionDecision(False, "Frozen execution budget is invalid.")
    if requested > maximum:
        return AssessmentExecutionDecision(False, "Assessment action exceeds the frozen execution budget.")
    return AssessmentExecutionDecision(False, BLOCKED_EXECUTION_REASON)


def assessment_execution_decision(
    action: Mapping[str, Any],
    run: Mapping[str, Any],
    target: str,
    *,
    now: datetime | None = None,
) -> AssessmentExecutionDecision:
    """Validate immutable policy gates then deny execution until adapters are reviewed."""

    if action.get("status") != "approved":
        return AssessmentExecutionDecision(False, "Assessment action is not approved.")
    if action.get("riskClassification") not in APPROVABLE_RISK_CLASSES:
        return AssessmentExecutionDecision(False, "Assessment action risk classification is not executable.")
    if action.get("riskClassification") == "safe_active":
        policy = run.get("policySnapshot")
        if not isinstance(policy, Mapping) or not active_testing_is_approved(policy):
            return AssessmentExecutionDecision(False, "Frozen active-testing approval is required for this action.")
    authorization = run.get("authorizationSnapshot")
    if not isinstance(authorization, Mapping) or not authorization_is_current(authorization, now):
        return AssessmentExecutionDecision(False, "Frozen assessment authorization is missing or expired.")
    scope = run.get("scopeSnapshot")
    if not isinstance(scope, Mapping) or not target_is_in_scope(scope, target):
        return AssessmentExecutionDecision(False, "Target is outside the frozen assessment scope.")
    return AssessmentExecutionDecision(False, BLOCKED_EXECUTION_REASON)
