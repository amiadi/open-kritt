import { Router } from 'express';

import { prisma } from '../db.js';
import {
  validateAssessmentRun,
  validateAssessmentActionDecision,
  validateAuthorizationRecord,
  validateDeploymentProfile,
  validateEngagement,
  validateTargetScope,
  ValidationError,
} from '../lib/validation.js';
import { assessmentActionDecision, planAssessmentActions } from '../lib/assessmentPolicy.js';
import {
  assessmentActionsCsv,
  assessmentAuditEventsCsv,
  buildAssessmentReportSnapshot,
} from '../lib/assessmentReports.js';
import { renderAssessmentReportArtifact, reportContentTypes } from '../lib/assessmentReportArtifacts.js';

const router = Router();

const asId = (value) => BigInt(value);
const serializeId = (value) => value.toString();

function enforcedDeploymentMode() {
  const mode = process.env.OPEN_KRITT_DEPLOYMENT_MODE?.trim().toLowerCase();
  return ['online', 'airgap'].includes(mode) ? mode : null;
}

async function currentDeploymentProfile() {
  const enforced = enforcedDeploymentMode();
  if (enforced) return { id: 'default', mode: enforced, source: 'environment' };
  const profile = await prisma.deploymentProfile.upsert({
    where: { id: 'default' },
    create: { id: 'default', mode: 'online' },
    update: {},
  });
  return { ...profile, source: 'database' };
}

function serializeEngagement(value) {
  return { ...value, id: serializeId(value.id) };
}

function serializeScope(value) {
  return { ...value, id: serializeId(value.id), engagementId: serializeId(value.engagementId) };
}

function serializeAuthorization(value) {
  return { ...value, id: serializeId(value.id), engagementId: serializeId(value.engagementId) };
}

function serializeRun(value) {
  return {
    ...value,
    id: serializeId(value.id),
    engagementId: serializeId(value.engagementId),
    targetScopeId: serializeId(value.targetScopeId),
    authorizationRecordId: serializeId(value.authorizationRecordId),
  };
}

function serializeAction(value) {
  return { ...value, id: serializeId(value.id), assessmentRunId: serializeId(value.assessmentRunId) };
}

function serializeAuditEvent(value) {
  return {
    ...value,
    id: serializeId(value.id),
    assessmentRunId: value.assessmentRunId === null ? null : serializeId(value.assessmentRunId),
  };
}

function serializeReportSnapshot(value) {
  return {
    id: serializeId(value.id),
    assessmentRunId: serializeId(value.assessmentRunId),
    schemaVersion: value.schemaVersion,
    snapshot: value.snapshot,
    insertedAt: value.insertedAt,
  };
}

function serializeExecutionJob(value) {
  return { ...value, id: serializeId(value.id), assessmentRunId: serializeId(value.assessmentRunId) };
}

async function requireEngagement(id) {
  const engagement = await prisma.engagement.findUnique({ where: { id } });
  if (!engagement) {
    const error = new Error('Engagement not found.');
    error.status = 404;
    throw error;
  }
  return engagement;
}

// Deployment mode is deliberately a small, explicit control-plane setting.
router.get('/deployment-profile', async (req, res, next) => {
  try {
    res.json(await currentDeploymentProfile());
  } catch (error) {
    next(error);
  }
});

router.patch('/deployment-profile', async (req, res, next) => {
  try {
    const { mode } = validateDeploymentProfile(req.body);
    const enforced = enforcedDeploymentMode();
    if (enforced) {
      if (mode !== enforced) {
        return res
          .status(409)
          .json({ error: `Deployment mode is enforced as ${enforced} by the container configuration.` });
      }
      return res.json({ id: 'default', mode: enforced, source: 'environment' });
    }
    const profile = await prisma.deploymentProfile.upsert({
      where: { id: 'default' },
      create: { id: 'default', mode },
      update: { mode },
    });
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.get('/engagements', async (req, res, next) => {
  try {
    const rows = await prisma.engagement.findMany({ orderBy: { insertedAt: 'desc' } });
    res.json(rows.map(serializeEngagement));
  } catch (error) {
    next(error);
  }
});

router.post('/engagements', async (req, res, next) => {
  try {
    const created = await prisma.engagement.create({ data: validateEngagement(req.body) });
    res.status(201).json(serializeEngagement(created));
  } catch (error) {
    next(error);
  }
});

router.get('/engagements/:engagementId/scopes', async (req, res, next) => {
  try {
    const engagementId = asId(req.params.engagementId);
    await requireEngagement(engagementId);
    const rows = await prisma.targetScope.findMany({ where: { engagementId }, orderBy: { insertedAt: 'desc' } });
    res.json(rows.map(serializeScope));
  } catch (error) {
    next(error);
  }
});

router.post('/engagements/:engagementId/scopes', async (req, res, next) => {
  try {
    const engagementId = asId(req.params.engagementId);
    await requireEngagement(engagementId);
    const created = await prisma.targetScope.create({ data: { engagementId, ...validateTargetScope(req.body) } });
    res.status(201).json(serializeScope(created));
  } catch (error) {
    next(error);
  }
});

router.get('/engagements/:engagementId/authorizations', async (req, res, next) => {
  try {
    const engagementId = asId(req.params.engagementId);
    await requireEngagement(engagementId);
    const rows = await prisma.authorizationRecord.findMany({
      where: { engagementId },
      orderBy: { insertedAt: 'desc' },
    });
    res.json(rows.map(serializeAuthorization));
  } catch (error) {
    next(error);
  }
});

router.post('/engagements/:engagementId/authorizations', async (req, res, next) => {
  try {
    const engagementId = asId(req.params.engagementId);
    await requireEngagement(engagementId);
    const created = await prisma.authorizationRecord.create({
      data: { engagementId, ...validateAuthorizationRecord(req.body) },
    });
    res.status(201).json(serializeAuthorization(created));
  } catch (error) {
    next(error);
  }
});

router.get('/runs', async (req, res, next) => {
  try {
    const rows = await prisma.assessmentRun.findMany({ orderBy: { insertedAt: 'desc' } });
    res.json(rows.map(serializeRun));
  } catch (error) {
    next(error);
  }
});

router.post('/runs', async (req, res, next) => {
  try {
    const engagementId = asId(req.body?.engagement_id ?? req.body?.engagementId);
    const targetScopeId = asId(req.body?.target_scope_id ?? req.body?.targetScopeId);
    const authorizationRecordId = asId(req.body?.authorization_record_id ?? req.body?.authorizationRecordId);
    const valid = validateAssessmentRun(req.body);
    const [engagement, scope, authorization, deploymentProfile] = await Promise.all([
      prisma.engagement.findUnique({ where: { id: engagementId } }),
      prisma.targetScope.findUnique({ where: { id: targetScopeId } }),
      prisma.authorizationRecord.findUnique({ where: { id: authorizationRecordId } }),
      currentDeploymentProfile(),
    ]);
    const errors = [];
    if (!engagement) errors.push({ field: 'engagement_id', message: 'Engagement not found.' });
    if (!scope || scope.engagementId !== engagementId)
      errors.push({ field: 'target_scope_id', message: 'Scope must belong to the engagement.' });
    if (!authorization || authorization.engagementId !== engagementId)
      errors.push({ field: 'authorization_record_id', message: 'Authorization must belong to the engagement.' });
    if (
      authorization?.status !== 'approved' ||
      authorization?.validFrom > new Date() ||
      authorization?.validUntil <= new Date()
    ) {
      errors.push({
        field: 'authorization_record_id',
        message: 'A currently valid approved authorization is required.',
      });
    }
    if (errors.length) throw new ValidationError(errors);

    const scopeSnapshot = {
      id: scope.id.toString(),
      name: scope.name,
      targets: scope.targets,
      exclusions: scope.exclusions,
    };
    const authorizationSnapshot = {
      id: authorization.id.toString(),
      approvedBy: authorization.approvedBy,
      authorizationReference: authorization.authorizationReference,
      validFrom: authorization.validFrom,
      validUntil: authorization.validUntil,
      evidenceReference: authorization.evidenceReference,
    };
    const created = await prisma.$transaction(async (tx) => {
      const run = await tx.assessmentRun.create({
        data: {
          engagementId,
          targetScopeId,
          authorizationRecordId,
          deploymentMode: deploymentProfile.mode,
          ...valid,
          scopeSnapshot,
          authorizationSnapshot,
        },
      });
      await tx.assessmentAuditEvent.create({
        data: {
          assessmentRunId: run.id,
          eventType: 'assessment_run_created',
          actor: engagement.owner,
          details: { capability: run.capability, executionMode: run.executionMode },
        },
      });
      return run;
    });
    res.status(201).json(serializeRun(created));
  } catch (error) {
    next(error);
  }
});

// Planning is deliberately data-only. It creates no network or device activity;
// execution remains unavailable until a separately reviewed runner is added.
router.post('/runs/:runId/plan', async (req, res, next) => {
  try {
    const runId = asId(req.params.runId);
    const result = await prisma.$transaction(async (tx) => {
      const run = await tx.assessmentRun.findUnique({ where: { id: runId } });
      if (!run) return { kind: 'not-found' };
      if (!['draft', 'awaiting_approval'].includes(run.status)) return { kind: 'invalid-state', status: run.status };
      const existing = await tx.assessmentAction.count({ where: { assessmentRunId: runId } });
      if (existing) return { kind: 'already-planned' };
      const planned = planAssessmentActions(run);
      await tx.assessmentAction.createMany({ data: planned.map((action) => ({ assessmentRunId: runId, ...action })) });
      const pendingApproval = planned.some((action) => action.status === 'planned');
      const updated = await tx.assessmentRun.update({
        where: { id: runId },
        data: { status: pendingApproval ? 'awaiting_approval' : 'planning' },
      });
      await tx.assessmentAuditEvent.create({
        data: {
          assessmentRunId: runId,
          eventType: 'assessment_plan_created',
          actor: 'system',
          details: {
            actionCount: planned.length,
            executionMode: run.executionMode,
            activeTestingApproval: planned.find((action) => action.details.active_testing_approval)?.details
              .active_testing_approval,
          },
        },
      });
      return { kind: 'planned', run: updated };
    });
    if (result.kind === 'not-found') return res.status(404).json({ error: 'Assessment run not found.' });
    if (result.kind === 'already-planned')
      return res.status(409).json({ error: 'Assessment actions are already planned.' });
    if (result.kind === 'invalid-state')
      return res.status(409).json({ error: `Cannot plan a ${result.status} assessment run.` });
    res.json(serializeRun(result.run));
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:runId/actions', async (req, res, next) => {
  try {
    const assessmentRunId = asId(req.params.runId);
    const actions = await prisma.assessmentAction.findMany({
      where: { assessmentRunId },
      orderBy: { insertedAt: 'asc' },
    });
    res.json(actions.map(serializeAction));
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:runId/audit-events', async (req, res, next) => {
  try {
    const assessmentRunId = asId(req.params.runId);
    const events = await prisma.assessmentAuditEvent.findMany({
      where: { assessmentRunId },
      orderBy: { insertedAt: 'asc' },
    });
    res.json(events.map(serializeAuditEvent));
  } catch (error) {
    next(error);
  }
});

router.patch('/actions/:actionId', async (req, res, next) => {
  try {
    const id = asId(req.params.actionId);
    const valid = validateAssessmentActionDecision(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const action = await tx.assessmentAction.findUnique({ where: { id } });
      if (!action) return { kind: 'not-found' };
      const status = assessmentActionDecision(action, valid.status);
      const updated = await tx.assessmentAction.update({ where: { id }, data: { status } });
      await tx.assessmentAuditEvent.create({
        data: {
          assessmentRunId: action.assessmentRunId,
          eventType: `assessment_action_${status}`,
          actor: valid.actor,
          details: { actionId: action.id.toString(), actionType: action.actionType },
        },
      });
      const remainingPlanned = await tx.assessmentAction.count({
        where: { assessmentRunId: action.assessmentRunId, status: 'planned' },
      });
      if (remainingPlanned === 0) {
        const actions = await tx.assessmentAction.findMany({
          where: { assessmentRunId: action.assessmentRunId },
          select: { status: true },
        });
        const approvedCount = actions.filter((candidate) => candidate.status === 'approved').length;
        const deniedCount = actions.filter((candidate) => candidate.status === 'denied').length;
        await tx.assessmentRun.update({
          where: { id: action.assessmentRunId },
          data: { status: 'awaiting_operator' },
        });
        await tx.assessmentAuditEvent.create({
          data: {
            assessmentRunId: action.assessmentRunId,
            eventType: 'assessment_plan_decisions_completed',
            actor: 'system',
            details: {
              approvedCount,
              deniedCount,
              executionAvailable: false,
              nextState: 'awaiting_operator',
            },
          },
        });
      }
      return { kind: 'updated', action: updated };
    });
    if (result.kind === 'not-found') return res.status(404).json({ error: 'Assessment action not found.' });
    res.json(serializeAction(result.action));
  } catch (error) {
    next(error);
  }
});

// Durable execution integration is intentionally audit-only until safe adapters
// pass separate lab review. Creating a job records the policy block; it cannot
// schedule network, exploit, or device activity.
router.get('/runs/:runId/execution-jobs', async (req, res, next) => {
  try {
    const assessmentRunId = asId(req.params.runId);
    const jobs = await prisma.assessmentExecutionJob.findMany({
      where: { assessmentRunId },
      orderBy: { insertedAt: 'desc' },
    });
    res.json(jobs.map(serializeExecutionJob));
  } catch (error) {
    next(error);
  }
});

router.post('/runs/:runId/execution-jobs', async (req, res, next) => {
  try {
    const assessmentRunId = asId(req.params.runId);
    const actor = typeof req.body?.actor === 'string' ? req.body.actor.trim() : '';
    if (!actor) throw new ValidationError([{ field: 'actor', message: 'An accountable operator is required.' }]);
    const result = await prisma.$transaction(async (tx) => {
      const run = await tx.assessmentRun.findUnique({ where: { id: assessmentRunId } });
      if (!run) return { kind: 'not-found' };
      if (run.status !== 'awaiting_operator') return { kind: 'invalid-state', status: run.status };
      const job = await tx.assessmentExecutionJob.create({
        data: { assessmentRunId, status: 'blocked', operationsAccounted: 0 },
      });
      await tx.assessmentExecutionEvent.create({
        data: {
          assessmentExecutionJobId: job.id,
          eventType: 'assessment_execution_blocked',
          actor,
          details: { reason: 'No reviewed target-operation adapter is enabled.', operationsAccounted: 0 },
        },
      });
      await tx.assessmentAuditEvent.create({
        data: {
          assessmentRunId,
          eventType: 'assessment_execution_job_blocked',
          actor,
          details: { executionJobId: job.id.toString(), executionAvailable: false },
        },
      });
      return { kind: 'created', job };
    });
    if (result.kind === 'not-found') return res.status(404).json({ error: 'Assessment run not found.' });
    if (result.kind === 'invalid-state')
      return res.status(409).json({ error: `Cannot create an execution record for a ${result.status} run.` });
    res.status(201).json(serializeExecutionJob(result.job));
  } catch (error) {
    next(error);
  }
});

router.post('/runs/:runId/report-snapshot', async (req, res, next) => {
  try {
    const assessmentRunId = asId(req.params.runId);
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.assessmentReportSnapshot.findUnique({ where: { assessmentRunId } });
      if (existing) return { kind: 'existing', reportSnapshot: existing };
      const run = await tx.assessmentRun.findUnique({ where: { id: assessmentRunId } });
      if (!run) return { kind: 'not-found' };
      const [engagement, actions, auditEvents] = await Promise.all([
        tx.engagement.findUnique({ where: { id: run.engagementId } }),
        tx.assessmentAction.findMany({ where: { assessmentRunId }, orderBy: { insertedAt: 'asc' } }),
        tx.assessmentAuditEvent.findMany({ where: { assessmentRunId }, orderBy: { insertedAt: 'asc' } }),
      ]);
      const snapshot = buildAssessmentReportSnapshot({ run, engagement, actions, auditEvents });
      const reportSnapshot = await tx.assessmentReportSnapshot.create({ data: { assessmentRunId, snapshot } });
      await tx.assessmentAuditEvent.create({
        data: {
          assessmentRunId,
          eventType: 'assessment_report_snapshot_created',
          actor: 'system',
          details: { schemaVersion: 1 },
        },
      });
      return { kind: 'created', reportSnapshot };
    });
    if (result.kind === 'not-found') return res.status(404).json({ error: 'Assessment run not found.' });
    res.status(result.kind === 'created' ? 201 : 200).json(serializeReportSnapshot(result.reportSnapshot));
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:runId/reports/actions.csv', async (req, res, next) => {
  try {
    const assessmentRunId = asId(req.params.runId);
    const reportSnapshot = await prisma.assessmentReportSnapshot.findUnique({ where: { assessmentRunId } });
    if (!reportSnapshot) {
      return res.status(409).json({ error: 'Create an immutable report snapshot before exporting.' });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assessment-${assessmentRunId}-actions.csv"`);
    res.send(assessmentActionsCsv(reportSnapshot.snapshot));
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:runId/reports/audit-events.csv', async (req, res, next) => {
  try {
    const assessmentRunId = asId(req.params.runId);
    const reportSnapshot = await prisma.assessmentReportSnapshot.findUnique({ where: { assessmentRunId } });
    if (!reportSnapshot) {
      return res.status(409).json({ error: 'Create an immutable report snapshot before exporting.' });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assessment-${assessmentRunId}-audit-events.csv"`);
    res.send(assessmentAuditEventsCsv(reportSnapshot.snapshot));
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:runId/reports/:format', async (req, res, next) => {
  try {
    const assessmentRunId = asId(req.params.runId);
    const format = req.params.format;
    if (!Object.hasOwn(reportContentTypes, format)) return res.status(404).json({ error: 'Report format not found.' });
    const reportSnapshot = await prisma.assessmentReportSnapshot.findUnique({ where: { assessmentRunId } });
    if (!reportSnapshot) {
      return res.status(409).json({ error: 'Create an immutable report snapshot before exporting.' });
    }
    const artifact = await renderAssessmentReportArtifact(format, reportSnapshot.snapshot);
    await prisma.assessmentReportArtifact.upsert({
      where: { assessmentRunId_format_digest: { assessmentRunId, format, digest: artifact.digest } },
      create: { assessmentRunId, format, digest: artifact.digest, byteLength: artifact.buffer.length },
      update: {},
    });
    res.setHeader('Content-Type', reportContentTypes[format]);
    res.setHeader('Content-Disposition', `attachment; filename="assessment-${assessmentRunId}-report.${format}"`);
    res.send(artifact.buffer);
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, next) => {
  if (error?.status === 404) return res.status(404).json({ error: error.message });
  next(error);
});

export default router;
