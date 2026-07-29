import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, apiErrorMessages } from '../api/client.js';
import { Button, EmptyState, ErrorState, Spinner } from '../components/ui.jsx';
import { usePageChrome } from '../context/ui.jsx';
import { useFetch } from '../lib/useFetch.js';

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 36,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  font: 'inherit',
};

const meta = { fontSize: 11, color: 'var(--text-3)', marginTop: 4 };
const lines = (value) =>
  String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
const label = (value) => value.replaceAll('_', ' ');

export default function AssessmentDetail() {
  const { id } = useParams();
  usePageChrome(
    [
      { label: 'Assessments', to: '/assessments' },
      { label: 'Engagement', active: true },
    ],
    null,
    []
  );
  const engagementList = useFetch(() => api.assessmentEngagements(), []);
  const scopes = useFetch(() => api.assessmentScopes(id), [id]);
  const authorizations = useFetch(() => api.assessmentAuthorizations(id), [id]);
  const runs = useFetch(() => api.assessmentRuns(), []);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const [actionsByRun, setActionsByRun] = useState({});
  const [auditByRun, setAuditByRun] = useState({});
  const engagement = useMemo(() => engagementList.data?.find((item) => item.id === id), [engagementList.data, id]);
  const engagementRuns = (runs.data || []).filter((run) => run.engagementId === id);

  const submit = (kind, call) => async (event) => {
    event.preventDefault();
    setBusy(kind);
    setError(null);
    try {
      await call(new FormData(event.currentTarget));
      event.currentTarget.reset();
      if (kind === 'scope') scopes.reload();
      if (kind === 'authorization') authorizations.reload();
      if (kind === 'run') runs.reload();
    } catch (failure) {
      setError({ message: apiErrorMessages(failure).join(' ') });
    } finally {
      setBusy('');
    }
  };

  const reviewPlan = async (runId) => {
    setBusy(`actions-${runId}`);
    setError(null);
    try {
      const [actions, auditEvents] = await Promise.all([
        api.assessmentActions(runId),
        api.assessmentAuditEvents(runId),
      ]);
      setActionsByRun((current) => ({ ...current, [runId]: actions }));
      setAuditByRun((current) => ({ ...current, [runId]: auditEvents }));
    } catch (failure) {
      setError({ message: apiErrorMessages(failure).join(' ') });
    } finally {
      setBusy('');
    }
  };

  const createReport = async (runId) => {
    setBusy(`report-${runId}`);
    setError(null);
    try {
      await api.createAssessmentReportSnapshot(runId);
      await api.downloadAssessmentActionsCsv(runId);
    } catch (failure) {
      setError({ message: apiErrorMessages(failure).join(' ') });
    } finally {
      setBusy('');
    }
  };

  const downloadAuditReport = async (runId) => {
    setBusy(`audit-report-${runId}`);
    setError(null);
    try {
      await api.createAssessmentReportSnapshot(runId);
      await api.downloadAssessmentAuditCsv(runId);
    } catch (failure) {
      setError({ message: apiErrorMessages(failure).join(' ') });
    } finally {
      setBusy('');
    }
  };

  const downloadProfessionalReport = async (runId, format) => {
    setBusy(`artifact-${format}-${runId}`);
    setError(null);
    try {
      await api.createAssessmentReportSnapshot(runId);
      await api.downloadAssessmentReport(runId, format);
    } catch (failure) {
      setError({ message: apiErrorMessages(failure).join(' ') });
    } finally {
      setBusy('');
    }
  };

  const decideAction = async (runId, actionId, status) => {
    const actor = window.prompt(`Record the accountable operator approving this action as ${status}:`);
    if (!actor?.trim()) return;
    setBusy(`decision-${actionId}`);
    setError(null);
    try {
      await api.decideAssessmentAction(actionId, { status, actor: actor.trim() });
      await reviewPlan(runId);
      runs.reload();
    } catch (failure) {
      setError({ message: apiErrorMessages(failure).join(' ') });
    } finally {
      setBusy('');
    }
  };

  if (engagementList.loading)
    return (
      <div style={{ padding: '30px 32px' }}>
        <Spinner />
      </div>
    );
  if (engagementList.error)
    return (
      <div style={{ padding: '30px 32px' }}>
        <ErrorState error={engagementList.error} onRetry={engagementList.reload} />
      </div>
    );
  if (!engagement)
    return (
      <div style={{ padding: '30px 32px' }}>
        <EmptyState title="Engagement not found" action={<Button to="/assessments">Back to assessments</Button>} />
      </div>
    );

  return (
    <div style={{ padding: '30px 32px', maxWidth: 1180 }}>
      <Link to="/assessments" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
        ← Assessments
      </Link>
      <h1 style={{ fontSize: 27, margin: '12px 0 4px', letterSpacing: '-0.02em' }}>{engagement.name}</h1>
      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>
        {engagement.description || 'Authorized assessment engagement.'}
      </p>
      {error && (
        <div style={{ marginTop: 16 }}>
          <ErrorState error={error} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 26 }}>
        <Panel
          title="1. Authorized target scope"
          sub="Targets are saved as a newline-separated list and frozen when a run is created."
        >
          <form
            onSubmit={submit('scope', async (data) =>
              api.createAssessmentScope(id, {
                name: data.get('name'),
                targets: lines(data.get('targets')),
                exclusions: lines(data.get('exclusions')),
              })
            )}
          >
            <Field label="Scope name">
              <input required name="name" style={inputStyle} placeholder="Production API boundary" />
            </Field>
            <Field label="Authorized targets">
              <textarea
                required
                name="targets"
                style={{ ...inputStyle, minHeight: 88 }}
                placeholder={'https://api.example.test\napi.example.test'}
              />
            </Field>
            <Field label="Exclusions">
              <textarea name="exclusions" style={{ ...inputStyle, minHeight: 58 }} placeholder="admin.example.test" />
            </Field>
            <Button type="submit" disabled={busy !== ''}>
              {busy === 'scope' ? 'Saving…' : 'Save scope'}
            </Button>
          </form>
          <List
            loading={scopes.loading}
            items={scopes.data}
            empty="No target scopes recorded."
            render={(scope) => (
              <div>
                <strong>{scope.name}</strong>
                <div className="mono" style={meta}>
                  {scope.targets.length} target(s) · {scope.exclusions.length} exclusion(s)
                </div>
              </div>
            )}
          />
        </Panel>

        <Panel title="2. Authorization" sub="A currently valid approval is required before creating a run.">
          <form
            onSubmit={submit('authorization', async (data) =>
              api.createAssessmentAuthorization(id, {
                approvedBy: data.get('approvedBy'),
                authorizationReference: data.get('reference'),
                evidenceReference: data.get('evidence'),
                validFrom: data.get('validFrom'),
                validUntil: data.get('validUntil'),
              })
            )}
          >
            <Field label="Approved by">
              <input required name="approvedBy" style={inputStyle} placeholder="Authorized approver" />
            </Field>
            <Field label="Authorization reference">
              <input required name="reference" style={inputStyle} placeholder="ENG-2026-001" />
            </Field>
            <Field label="Valid from">
              <input required type="datetime-local" name="validFrom" style={inputStyle} />
            </Field>
            <Field label="Valid until">
              <input required type="datetime-local" name="validUntil" style={inputStyle} />
            </Field>
            <Field label="Evidence reference">
              <input name="evidence" style={inputStyle} placeholder="Approval ticket or document" />
            </Field>
            <Button type="submit" disabled={busy !== ''}>
              {busy === 'authorization' ? 'Saving…' : 'Record authorization'}
            </Button>
          </form>
          <List
            loading={authorizations.loading}
            items={authorizations.data}
            empty="No authorizations recorded."
            render={(authorization) => (
              <div>
                <strong>{authorization.authorizationReference}</strong>
                <div className="mono" style={meta}>
                  {authorization.approvedBy} · valid until {new Date(authorization.validUntil).toLocaleString()}
                </div>
              </div>
            )}
          />
        </Panel>
      </div>

      <section style={{ marginTop: 18 }}>
        <Panel
          title="3. Dry-run plan"
          sub="Creates an auditable, non-executing plan. No network requests or device interactions are performed."
        >
          <form
            onSubmit={submit('run', async (data) => {
              const activeTestingAllowed = data.get('activeTestingAllowed') === 'on';
              const run = await api.createAssessmentRun({
                engagementId: id,
                targetScopeId: data.get('scopeId'),
                authorizationRecordId: data.get('authorizationId'),
                capability: data.get('capability'),
                executionMode: 'dry_run',
                policySnapshot: activeTestingAllowed
                  ? {
                      active_testing: {
                        allowed: true,
                        approved_by: data.get('activeTestingApprovedBy'),
                        approval_reference: data.get('activeTestingReference'),
                      },
                    }
                  : {},
              });
              await api.planAssessmentRun(run.id);
            })}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end', gap: 12 }}
          >
            <Field label="Scope">
              <select required name="scopeId" style={inputStyle} defaultValue="">
                <option value="" disabled>
                  Select scope
                </option>
                {(scopes.data || []).map((scope) => (
                  <option value={scope.id} key={scope.id}>
                    {scope.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Authorization">
              <select required name="authorizationId" style={inputStyle} defaultValue="">
                <option value="" disabled>
                  Select authorization
                </option>
                {(authorizations.data || []).map((authorization) => (
                  <option value={authorization.id} key={authorization.id}>
                    {authorization.authorizationReference}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Capability">
              <select name="capability" style={inputStyle}>
                <option value="infrastructure">Infrastructure</option>
                <option value="web_application">Web application</option>
                <option value="embedded">Embedded</option>
              </select>
            </Field>
            <Button type="submit" disabled={busy !== '' || !(scopes.data?.length && authorizations.data?.length)}>
              {busy === 'run' ? 'Planning…' : 'Create dry run'}
            </Button>
            <div
              style={{
                gridColumn: '1 / -1',
                borderTop: '1px solid var(--border-2)',
                paddingTop: 12,
                display: 'grid',
                gridTemplateColumns: 'auto 1fr 1fr',
                gap: 12,
                alignItems: 'end',
              }}
            >
              <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, color: 'var(--text-2)' }}>
                <input name="activeTestingAllowed" type="checkbox" />
                Record approved active testing
              </label>
              <Field label="Active-testing approved by">
                <input name="activeTestingApprovedBy" style={inputStyle} placeholder="Accountable approver" />
              </Field>
              <Field label="Approval reference">
                <input name="activeTestingReference" style={inputStyle} placeholder="ENG-2026-042" />
              </Field>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-3)', marginTop: -6 }}>
                This freezes an accountable approval for bounded safe-active actions. The current dry run and engine
                remain non-executing.
              </div>
            </div>
          </form>
          <List
            loading={runs.loading}
            items={engagementRuns}
            empty="No assessment plans yet."
            render={(run) => (
              <div>
                <strong>
                  {label(run.capability)} · {label(run.executionMode)}
                </strong>
                <div className="mono" style={meta}>
                  {run.status} · {run.deploymentMode}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Button
                    variant="ghost"
                    style={{ height: 30, padding: '0 11px', fontSize: 12 }}
                    onClick={() => reviewPlan(run.id)}
                    disabled={busy !== ''}
                  >
                    {busy === `actions-${run.id}` ? 'Loading…' : 'Review actions'}
                  </Button>
                  <Button
                    variant="ghost"
                    style={{ height: 30, padding: '0 11px', fontSize: 12 }}
                    onClick={() => createReport(run.id)}
                    disabled={busy !== ''}
                  >
                    {busy === `report-${run.id}` ? 'Preparing…' : 'Export CSV'}
                  </Button>
                  <Button
                    variant="ghost"
                    style={{ height: 30, padding: '0 11px', fontSize: 12 }}
                    onClick={() => downloadAuditReport(run.id)}
                    disabled={busy !== ''}
                  >
                    {busy === `audit-report-${run.id}` ? 'Preparing…' : 'Export audit CSV'}
                  </Button>
                  {['pdf', 'docx', 'xlsx'].map((format) => (
                    <Button
                      key={format}
                      variant="ghost"
                      style={{ height: 30, padding: '0 11px', fontSize: 12 }}
                      onClick={() => downloadProfessionalReport(run.id, format)}
                      disabled={busy !== ''}
                    >
                      {busy === `artifact-${format}-${run.id}` ? 'Preparing…' : `Download ${format.toUpperCase()}`}
                    </Button>
                  ))}
                </div>
                {actionsByRun[run.id] && (
                  <ActionReview
                    actions={actionsByRun[run.id]}
                    auditEvents={auditByRun[run.id] || []}
                    busy={busy}
                    onDecide={(actionId, status) => decideAction(run.id, actionId, status)}
                  />
                )}
              </div>
            )}
          />
        </Panel>
      </section>
    </div>
  );
}

function Field({ label: fieldLabel, children }) {
  return (
    <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
      <span>{fieldLabel}</span>
      {children}
    </label>
  );
}

function Panel({ title, sub, children }) {
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 18, background: 'var(--surface)' }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '4px 0 16px', lineHeight: 1.5 }}>{sub}</div>
      {children}
    </section>
  );
}

function List({ loading, items, empty, render }) {
  if (loading) return <Spinner />;
  if (!items?.length) return <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 16 }}>{empty}</div>;
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
      {items.map((item) => (
        <div key={item.id} style={{ paddingTop: 10, borderTop: '1px solid var(--border-2)', fontSize: 13 }}>
          {render(item)}
        </div>
      ))}
    </div>
  );
}

function ActionReview({ actions, auditEvents, busy, onDecide }) {
  return (
    <div
      style={{ display: 'grid', gap: 6, marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--surface-2)' }}
    >
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '.05em' }}>
        DRY-RUN ACTION PLAN
      </div>
      {actions.map((action) => (
        <div key={action.id} style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--text)' }}>{label(action.actionType)}</strong> ·{' '}
          {label(action.riskClassification)} · {action.status}
          <div style={{ marginTop: 2 }}>{action.summary}</div>
          {action.details?.active_testing_approval && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ok)' }}>
              Active testing approved by {action.details.active_testing_approval.approvedBy} ·{' '}
              {action.details.active_testing_approval.approvalReference}
            </div>
          )}
          {action.status === 'planned' && (
            <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
              <Button
                variant="ghost"
                style={{ height: 27, padding: '0 9px', fontSize: 11 }}
                disabled={busy !== ''}
                onClick={() => onDecide(action.id, 'approved')}
              >
                {busy === `decision-${action.id}` ? 'Recording…' : 'Approve action'}
              </Button>
              <Button
                variant="ghost"
                style={{ height: 27, padding: '0 9px', fontSize: 11 }}
                disabled={busy !== ''}
                onClick={() => onDecide(action.id, 'denied')}
              >
                Deny action
              </Button>
            </div>
          )}
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 5, paddingTop: 8 }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '.05em' }}>
          AUDIT TIMELINE
        </div>
        {auditEvents.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 5 }}>No audit events recorded.</div>
        ) : (
          auditEvents.map((event) => (
            <div key={event.id} style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 5 }}>
              <strong style={{ color: 'var(--text)' }}>{label(event.eventType)}</strong> · {event.actor} ·{' '}
              {new Date(event.insertedAt).toLocaleString()}
            </div>
          ))
        )}
      </div>
      {actions.length > 0 && actions.every((action) => action.status !== 'planned') && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          All action decisions are recorded. The plan is held for an operator; target execution remains unavailable.
        </div>
      )}
    </div>
  );
}
