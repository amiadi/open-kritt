from datetime import UTC, datetime

from open_kritt_engine.assessment_adapters import (
    BLOCKED_EXECUTION_REASON,
    AssessmentAdapterContract,
    AssessmentExecutionRequest,
    active_testing_is_approved,
    adapter_assignment_decision,
    adapter_execution_admission,
    assessment_execution_decision,
    assessment_policy_receipt,
    authorization_is_current,
    execution_budget_decision,
    parse_policy_receipt,
    policy_receipt_is_valid,
    serialize_policy_receipt,
    target_is_in_scope,
)

NOW = datetime(2026, 7, 29, tzinfo=UTC)


def test_frozen_request_envelope_cannot_be_mutated_and_stays_fail_closed():
    request = AssessmentExecutionRequest(
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

    assert adapter_execution_admission(request, now=NOW).reason == BLOCKED_EXECUTION_REASON
    try:
        request.run_snapshot["capability"] = "infrastructure"
    except TypeError:
        pass
    else:
        raise AssertionError("Runner request snapshots must be immutable.")


def test_policy_receipt_is_deterministic_and_binds_the_frozen_request():
    request = AssessmentExecutionRequest(
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

    first = assessment_policy_receipt(request, now=NOW)
    second = assessment_policy_receipt(request, now=NOW)
    assert first == second
    assert first.reason == BLOCKED_EXECUTION_REASON
    assert first.evaluated_at == "2026-07-29T00:00:00Z"
    assert len(first.request_digest) == 64
    assert policy_receipt_is_valid(first, request)

    changed_target = AssessmentExecutionRequest(
        adapter=request.adapter,
        action_snapshot=request.action_snapshot,
        run_snapshot=request.run_snapshot,
        target="https://other.example.test",
    )
    assert not policy_receipt_is_valid(first, changed_target, now=NOW)


def test_policy_receipts_round_trip_only_when_they_remain_fail_closed():
    request = AssessmentExecutionRequest(
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
    receipt = assessment_policy_receipt(request, now=NOW)

    assert parse_policy_receipt(serialize_policy_receipt(receipt)) == receipt
    assert parse_policy_receipt({**serialize_policy_receipt(receipt), "allowed": True}) is None


def test_runner_admission_requires_a_finite_frozen_operation_budget():
    action = {"status": "approved", "riskClassification": "passive", "planned_operations": 2}

    assert execution_budget_decision(action, {}).reason == "Frozen execution budget is required."
    assert execution_budget_decision(
        action, {"policySnapshot": {"execution_budget": {"max_operations": 1}}}
    ).reason == ("Assessment action exceeds the frozen execution budget.")
    assert execution_budget_decision(
        action, {"policySnapshot": {"execution_budget": {"max_operations": 2}}}
    ).reason == (BLOCKED_EXECUTION_REASON)


def test_adapter_contracts_only_validate_static_capability_assignments():
    adapter = AssessmentAdapterContract("web-read-only", frozenset({"web_application"}))

    assert adapter_assignment_decision(adapter, {"capability": "infrastructure"}).reason == (
        "Assessment adapter does not support this run capability."
    )
    assert adapter_assignment_decision(adapter, {"capability": "web_application"}).reason == BLOCKED_EXECUTION_REASON


def test_scope_uses_exact_targets_and_exclusions_win():
    scope = {"targets": ["https://app.example.test"], "exclusions": ["https://admin.example.test"]}

    assert target_is_in_scope(scope, "https://app.example.test")
    assert not target_is_in_scope(scope, "https://app.example.test/v1")
    assert not target_is_in_scope({**scope, "targets": ["https://admin.example.test"]}, "https://admin.example.test")


def test_authorization_requires_current_frozen_window():
    snapshot = {"validFrom": "2026-07-28T00:00:00Z", "validUntil": "2026-07-30T00:00:00Z"}

    assert authorization_is_current(snapshot, NOW)
    assert not authorization_is_current({**snapshot, "validUntil": "2026-07-29T00:00:00Z"}, NOW)


def test_safe_active_policy_requires_accountable_frozen_approval():
    assert active_testing_is_approved(
        {"active_testing": {"allowed": True, "approved_by": "Security owner", "approval_reference": "ENG-42"}}
    )
    assert not active_testing_is_approved(
        {"active_testing": {"allowed": True, "approved_by": "", "approval_reference": "ENG-42"}}
    )


def test_all_satisfied_gates_remain_blocked_without_execution_adapters():
    decision = assessment_execution_decision(
        {"status": "approved", "riskClassification": "passive"},
        {
            "scopeSnapshot": {"targets": ["https://app.example.test"], "exclusions": []},
            "authorizationSnapshot": {"validFrom": "2026-07-28T00:00:00Z", "validUntil": "2026-07-30T00:00:00Z"},
        },
        "https://app.example.test",
        now=NOW,
    )

    assert not decision.allowed
    assert decision.reason == BLOCKED_EXECUTION_REASON


def test_unapproved_or_out_of_scope_action_is_rejected_before_adapter_gate():
    run = {
        "scopeSnapshot": {"targets": ["https://app.example.test"], "exclusions": []},
        "authorizationSnapshot": {"validFrom": "2026-07-28T00:00:00Z", "validUntil": "2026-07-30T00:00:00Z"},
    }

    assert assessment_execution_decision({"status": "planned"}, run, "https://app.example.test", now=NOW).reason == (
        "Assessment action is not approved."
    )
    assert (
        assessment_execution_decision(
            {"status": "approved", "riskClassification": "passive"}, run, "https://other.example.test", now=NOW
        ).reason
        == "Target is outside the frozen assessment scope."
    )


def test_safe_active_actions_require_approval_but_remain_execution_blocked():
    run = {
        "scopeSnapshot": {"targets": ["https://app.example.test"], "exclusions": []},
        "authorizationSnapshot": {"validFrom": "2026-07-28T00:00:00Z", "validUntil": "2026-07-30T00:00:00Z"},
        "policySnapshot": {
            "active_testing": {"allowed": True, "approved_by": "Security owner", "approval_reference": "ENG-42"}
        },
    }
    decision = assessment_execution_decision(
        {"status": "approved", "riskClassification": "safe_active"}, run, "https://app.example.test", now=NOW
    )
    assert decision.reason == BLOCKED_EXECUTION_REASON
