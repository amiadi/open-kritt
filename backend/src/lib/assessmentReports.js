function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

export function recordsToCsv(columns, records) {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const lines = records.map((record) => columns.map((column) => csvCell(record[column.key])).join(','));
  return `${[header, ...lines].join('\r\n')}\r\n`;
}

export function buildAssessmentReportSnapshot({ run, engagement, actions, auditEvents }) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    engagement: {
      id: engagement.id.toString(),
      name: engagement.name,
      description: engagement.description,
      owner: engagement.owner,
      classification: engagement.classification,
    },
    assessment: {
      id: run.id.toString(),
      capability: run.capability,
      executionMode: run.executionMode,
      status: run.status,
      deploymentMode: run.deploymentMode,
      scope: run.scopeSnapshot,
      authorization: run.authorizationSnapshot,
      policy: run.policySnapshot,
      insertedAt: iso(run.insertedAt),
      updatedAt: iso(run.updatedAt),
    },
    actions: actions.map((action) => ({
      id: action.id.toString(),
      actionType: action.actionType,
      riskClassification: action.riskClassification,
      status: action.status,
      summary: action.summary,
      details: action.details,
      insertedAt: iso(action.insertedAt),
      updatedAt: iso(action.updatedAt),
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id.toString(),
      eventType: event.eventType,
      actor: event.actor,
      details: event.details,
      insertedAt: iso(event.insertedAt),
    })),
  };
}

export function assessmentActionsCsv(snapshot) {
  return recordsToCsv(
    [
      { key: 'assessmentId', label: 'assessment_id' },
      { key: 'capability', label: 'capability' },
      { key: 'executionMode', label: 'execution_mode' },
      { key: 'actionType', label: 'action_type' },
      { key: 'riskClassification', label: 'risk_classification' },
      { key: 'status', label: 'status' },
      { key: 'activeTestingApproval', label: 'active_testing_approval_json' },
      { key: 'summary', label: 'summary' },
      { key: 'plannedAt', label: 'planned_at' },
    ],
    snapshot.actions.map((action) => ({
      assessmentId: snapshot.assessment.id,
      capability: snapshot.assessment.capability,
      executionMode: snapshot.assessment.executionMode,
      actionType: action.actionType,
      riskClassification: action.riskClassification,
      status: action.status,
      activeTestingApproval: action.details?.active_testing_approval
        ? JSON.stringify(action.details.active_testing_approval)
        : '',
      summary: action.summary,
      plannedAt: action.insertedAt,
    }))
  );
}

export function assessmentAuditEventsCsv(snapshot) {
  return recordsToCsv(
    [
      { key: 'assessmentId', label: 'assessment_id' },
      { key: 'eventId', label: 'event_id' },
      { key: 'eventType', label: 'event_type' },
      { key: 'actor', label: 'actor' },
      { key: 'details', label: 'details_json' },
      { key: 'recordedAt', label: 'recorded_at' },
    ],
    snapshot.auditEvents.map((event) => ({
      assessmentId: snapshot.assessment.id,
      eventId: event.id,
      eventType: event.eventType,
      actor: event.actor,
      details: JSON.stringify(event.details ?? {}),
      recordedAt: event.insertedAt,
    }))
  );
}
