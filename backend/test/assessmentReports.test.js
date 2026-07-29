import test from 'node:test';
import assert from 'node:assert/strict';

import { assessmentActionsCsv, assessmentAuditEventsCsv, recordsToCsv } from '../src/lib/assessmentReports.js';

test('CSV escapes commas, quotes, and newlines using RFC-compatible cells', () => {
  const csv = recordsToCsv([{ key: 'value', label: 'value' }], [{ value: 'first, "quoted"\nsecond' }]);
  assert.equal(csv, 'value\r\n"first, ""quoted""\nsecond"\r\n');
});

test('assessment action CSV uses stable machine-friendly columns', () => {
  const csv = assessmentActionsCsv({
    assessment: { id: '42', capability: 'web_application', executionMode: 'dry_run' },
    actions: [
      {
        actionType: 'application_surface_inventory',
        riskClassification: 'passive',
        status: 'planned',
        details: { active_testing_approval: { approvedBy: 'Security owner', approvalReference: 'ENG-42' } },
        summary: 'Inventory routes',
        insertedAt: '2026-07-29T00:00:00.000Z',
      },
    ],
  });
  assert.match(
    csv,
    /^assessment_id,capability,execution_mode,action_type,risk_classification,status,active_testing_approval_json,summary,planned_at\r\n/
  );
  assert.match(
    csv,
    /^42,web_application,dry_run,application_surface_inventory,passive,planned,"{.*Security owner.*}",Inventory routes,2026/m
  );
});

test('assessment audit CSV preserves structured event details as escaped JSON', () => {
  const csv = assessmentAuditEventsCsv({
    assessment: { id: '42' },
    auditEvents: [
      {
        id: '7',
        eventType: 'assessment_plan_created',
        actor: 'system',
        details: { actionCount: 2, note: 'planned, safely' },
        insertedAt: '2026-07-29T00:00:00.000Z',
      },
    ],
  });
  assert.match(csv, /^assessment_id,event_id,event_type,actor,details_json,recorded_at\r\n/);
  assert.ok(
    csv.includes('42,7,assessment_plan_created,system,"{""actionCount"":2,""note"":""planned, safely""}",2026')
  );
});
