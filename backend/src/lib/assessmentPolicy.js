import { ASSESSMENT_RISK_CLASSIFICATIONS } from './constants.js';
import { ValidationError } from './validation.js';

const CAPABILITY_ACTIONS = Object.freeze({
  infrastructure: [
    {
      actionType: 'asset_inventory',
      riskClassification: 'passive',
      summary: 'Create an inventory from the explicitly authorized targets.',
    },
    {
      actionType: 'service_exposure_review',
      riskClassification: 'safe_active',
      summary: 'Review explicitly authorized service exposure using bounded, non-destructive checks.',
    },
  ],
  web_application: [
    {
      actionType: 'application_surface_inventory',
      riskClassification: 'passive',
      summary: 'Inventory declared application routes, APIs, and authentication boundaries.',
    },
    {
      actionType: 'safe_input_validation_review',
      riskClassification: 'safe_active',
      summary: 'Perform bounded, non-destructive input validation checks against authorized endpoints.',
    },
  ],
  embedded: [
    {
      actionType: 'firmware_and_interface_inventory',
      riskClassification: 'passive',
      summary: 'Inventory supplied firmware and declared device interfaces without changing device state.',
    },
    {
      actionType: 'read_only_interface_discovery',
      riskClassification: 'safe_active',
      summary: 'Perform bounded, read-only discovery on explicitly authorized device interfaces.',
    },
  ],
});

export function activeTestingApproval(policySnapshot = {}) {
  const approval = policySnapshot?.active_testing;
  if (!approval || approval.allowed !== true) return null;
  const approvedBy = typeof approval.approved_by === 'string' ? approval.approved_by.trim() : '';
  const approvalReference = typeof approval.approval_reference === 'string' ? approval.approval_reference.trim() : '';
  return approvedBy && approvalReference ? { approvedBy, approvalReference } : null;
}

export function planAssessmentActions({ capability, executionMode, policySnapshot = {} }) {
  const templates = CAPABILITY_ACTIONS[capability];
  if (!templates) {
    throw new ValidationError([{ field: 'capability', message: 'This capability does not have an approved planner.' }]);
  }

  const activeApproval = activeTestingApproval(policySnapshot);
  const allowSafeActiveAutonomous = policySnapshot?.allow_safe_active_autonomous === true || Boolean(activeApproval);
  return templates.map((template) => {
    let status = 'planned';
    if (template.riskClassification === 'safe_active' && activeApproval) status = 'approved';
    else if (executionMode === 'dry_run') status = 'planned';
    else if (executionMode === 'guided') status = 'planned';
    else if (executionMode === 'semi_auto' && template.riskClassification === 'passive') status = 'approved';
    else if (
      executionMode === 'autonomous' &&
      (template.riskClassification === 'passive' ||
        (template.riskClassification === 'safe_active' && allowSafeActiveAutonomous))
    ) {
      status = 'approved';
    }
    return {
      ...template,
      status,
      details: {
        execution_mode: executionMode,
        ...(activeApproval ? { active_testing_approval: activeApproval } : {}),
      },
    };
  });
}

export function assessmentActionDecision(current, requested) {
  if (!ASSESSMENT_RISK_CLASSIFICATIONS.includes(current.riskClassification)) {
    throw new ValidationError([{ field: 'action', message: 'Action has an invalid risk classification.' }]);
  }
  if (!['approved', 'denied'].includes(requested)) {
    throw new ValidationError([{ field: 'status', message: 'Status must be approved or denied.' }]);
  }
  if (current.status !== 'planned') {
    throw new ValidationError([{ field: 'status', message: 'Only planned actions can be approved or denied.' }]);
  }
  if (current.riskClassification === 'intrusive' || current.riskClassification === 'prohibited') {
    throw new ValidationError([{ field: 'status', message: 'Intrusive and prohibited actions cannot be approved.' }]);
  }
  return requested;
}
