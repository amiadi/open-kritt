import test from 'node:test';
import assert from 'node:assert/strict';

import { assessmentActionDecision, planAssessmentActions } from '../src/lib/assessmentPolicy.js';
import { ValidationError } from '../src/lib/validation.js';

test('dry-run assessment plans stay non-executing', () => {
  const actions = planAssessmentActions({ capability: 'web_application', executionMode: 'dry_run' });
  assert.equal(actions.length, 2);
  assert.deepEqual(
    actions.map((action) => action.status),
    ['planned', 'planned']
  );
  assert.deepEqual(
    actions.map((action) => action.riskClassification),
    ['passive', 'safe_active']
  );
});

test('autonomous mode requires an explicit policy flag for safe-active actions', () => {
  const defaultPlan = planAssessmentActions({ capability: 'infrastructure', executionMode: 'autonomous' });
  assert.deepEqual(
    defaultPlan.map((action) => action.status),
    ['approved', 'planned']
  );

  const approvedPlan = planAssessmentActions({
    capability: 'infrastructure',
    executionMode: 'autonomous',
    policySnapshot: { allow_safe_active_autonomous: true },
  });
  assert.deepEqual(
    approvedPlan.map((action) => action.status),
    ['approved', 'approved']
  );
});

test('accountable active-testing approval approves bounded safe-active actions in every planning mode', () => {
  const policySnapshot = {
    active_testing: { allowed: true, approved_by: 'Security owner', approval_reference: 'ENG-2026-042' },
  };
  for (const executionMode of ['dry_run', 'guided', 'semi_auto', 'autonomous']) {
    const actions = planAssessmentActions({ capability: 'web_application', executionMode, policySnapshot });
    assert.equal(actions[1].riskClassification, 'safe_active');
    assert.equal(actions[1].status, 'approved');
    assert.deepEqual(actions[1].details.active_testing_approval, {
      approvedBy: 'Security owner',
      approvalReference: 'ENG-2026-042',
    });
  }
});

test('intrusive and prohibited actions cannot be approved', () => {
  for (const riskClassification of ['intrusive', 'prohibited']) {
    assert.throws(
      () => assessmentActionDecision({ status: 'planned', riskClassification }, 'approved'),
      (error) => error instanceof ValidationError && error.errors[0]?.field === 'status'
    );
  }
});
