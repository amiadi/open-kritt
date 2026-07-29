import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAssessmentReportArtifact, reportContentTypes } from '../src/lib/assessmentReportArtifacts.js';

const snapshot = {
  generatedAt: '2026-07-29T00:00:00.000Z',
  engagement: { name: 'Lab review' },
  assessment: {
    id: '42',
    capability: 'web_application',
    executionMode: 'dry_run',
    deploymentMode: 'airgap',
    status: 'awaiting_operator',
  },
  actions: [{ actionType: 'application_surface_inventory', riskClassification: 'passive', status: 'approved' }],
  auditEvents: [{ insertedAt: '2026-07-29T00:00:00.000Z', eventType: 'assessment_plan_created', actor: 'operator' }],
};

for (const format of ['pdf', 'docx', 'xlsx']) {
  test(`renders a hashed ${format.toUpperCase()} report from an immutable snapshot`, async () => {
    const artifact = await renderAssessmentReportArtifact(format, snapshot);
    assert.ok(artifact.buffer.length > 100);
    assert.match(artifact.digest, /^[a-f0-9]{64}$/);
    assert.ok(reportContentTypes[format]);
  });
}
