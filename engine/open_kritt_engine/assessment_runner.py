"""No-I/O lifecycle orchestration for reviewed assessment execution.

This is the engine-side control framework, not a target-operation implementation.
It records immutable policy receipts, enforces cooperative cancellation, accounts
for planned operations, and hashes local evidence. A blocked policy result never
invokes an adapter or performs network/device I/O.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

from .assessment_adapters import (
    BLOCKED_EXECUTION_REASON,
    AssessmentExecutionRequest,
    AssessmentPolicyReceipt,
    assessment_policy_receipt,
    serialize_policy_receipt,
)


@dataclass(frozen=True)
class AssessmentEvidence:
    """Locally supplied structured evidence and its canonical content digest."""

    kind: str
    payload: Mapping[str, Any]
    digest: str
    recorded_at: str


@dataclass(frozen=True)
class AssessmentExecutionEvent:
    """Append-only lifecycle event suitable for durable audit persistence."""

    event_type: str
    details: Mapping[str, Any]
    recorded_at: str


@dataclass
class ReviewedExecutionJob:
    """One bounded policy evaluation; target operations remain unavailable."""

    request: AssessmentExecutionRequest
    status: str = "queued"
    operations_accounted: int = 0
    cancellation_requested: bool = False
    policy_receipt: AssessmentPolicyReceipt | None = None
    evidence: list[AssessmentEvidence] = field(default_factory=list)
    events: list[AssessmentExecutionEvent] = field(default_factory=list)


def request_cancellation(job: ReviewedExecutionJob, actor: str, *, now: datetime | None = None) -> bool:
    """Request cancellation before a job begins; terminal jobs cannot change."""

    if not isinstance(actor, str) or not actor.strip() or job.status in {"blocked", "cancelled", "completed", "failed"}:
        return False
    job.cancellation_requested = True
    _record_event(job, "assessment_execution_cancellation_requested", {"actor": actor.strip()}, now=now)
    return True


def run_reviewed_execution(job: ReviewedExecutionJob, *, now: datetime | None = None) -> ReviewedExecutionJob:
    """Evaluate one job, recording a receipt and stopping before target activity."""

    if job.status != "queued":
        return job
    if job.cancellation_requested:
        job.status = "cancelled"
        _record_event(job, "assessment_execution_cancelled", {"operationsAccounted": 0}, now=now)
        return job

    job.status = "running"
    _record_event(job, "assessment_execution_started", {}, now=now)
    receipt = assessment_policy_receipt(job.request, now=now)
    job.policy_receipt = receipt
    _add_evidence(job, "policy_receipt", serialize_policy_receipt(receipt), now=now)
    if not receipt.allowed:
        job.status = "blocked"
        _record_event(
            job,
            "assessment_execution_blocked",
            {"reason": receipt.reason, "operationsAccounted": 0},
            now=now,
        )
        return job

    # Future reviewed adapters may be inserted here only after policy, scope,
    # budget, evidence, and lab-integration review. This build has no such path.
    job.status = "blocked"
    _record_event(
        job,
        "assessment_execution_blocked",
        {"reason": BLOCKED_EXECUTION_REASON, "operationsAccounted": 0},
        now=now,
    )
    return job


def _add_evidence(job: ReviewedExecutionJob, kind: str, payload: Mapping[str, Any], *, now: datetime | None) -> None:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    job.evidence.append(
        AssessmentEvidence(
            kind=kind,
            payload=dict(payload),
            digest=sha256(canonical).hexdigest(),
            recorded_at=_timestamp(now),
        )
    )


def _record_event(
    job: ReviewedExecutionJob, event_type: str, details: Mapping[str, Any], *, now: datetime | None
) -> None:
    job.events.append(AssessmentExecutionEvent(event_type, dict(details), _timestamp(now)))


def _timestamp(now: datetime | None) -> str:
    return (now or datetime.now(UTC)).astimezone(UTC).isoformat().replace("+00:00", "Z")
