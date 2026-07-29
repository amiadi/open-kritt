from datetime import UTC, datetime

from open_kritt_engine.assessment_adapters import AssessmentAdapterContract, AssessmentExecutionRequest
from open_kritt_engine.assessment_runner import ReviewedExecutionJob, request_cancellation, run_reviewed_execution

NOW = datetime(2026, 7, 29, tzinfo=UTC)


def request():
    return AssessmentExecutionRequest(
        adapter=AssessmentAdapterContract("web-read-only", frozenset({"web_application"})),
        action_snapshot={"status": "approved", "riskClassification": "passive", "planned_operations": 1},
        run_snapshot={
            "capability": "web_application",
            "scopeSnapshot": {"targets": ["https://app.example.test"], "exclusions": []},
            "authorizationSnapshot": {"validFrom": "2026-07-28T00:00:00Z", "validUntil": "2026-07-30T00:00:00Z"},
            "policySnapshot": {"execution_budget": {"max_operations": 1}},
        },
        target="https://app.example.test",
    )


def test_reviewed_runner_records_hashed_policy_evidence_and_never_operates_on_targets():
    job = run_reviewed_execution(ReviewedExecutionJob(request()), now=NOW)

    assert job.status == "blocked"
    assert job.operations_accounted == 0
    assert job.policy_receipt is not None
    assert len(job.evidence) == 1
    assert len(job.evidence[0].digest) == 64
    assert [event.event_type for event in job.events] == [
        "assessment_execution_started",
        "assessment_execution_blocked",
    ]


def test_cancellation_is_audited_and_prevents_policy_evaluation():
    job = ReviewedExecutionJob(request())

    assert request_cancellation(job, "operator", now=NOW)
    run_reviewed_execution(job, now=NOW)

    assert job.status == "cancelled"
    assert job.policy_receipt is None
    assert job.evidence == []
    assert [event.event_type for event in job.events] == [
        "assessment_execution_cancellation_requested",
        "assessment_execution_cancelled",
    ]


def test_terminal_jobs_cannot_be_cancelled_or_reprocessed():
    job = run_reviewed_execution(ReviewedExecutionJob(request()), now=NOW)

    assert not request_cancellation(job, "operator", now=NOW)
    assert run_reviewed_execution(job, now=NOW) is job
    assert len(job.events) == 2
