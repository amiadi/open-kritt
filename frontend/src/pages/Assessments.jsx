import { useState } from 'react';
import { Link } from 'react-router-dom';

import { api, apiErrorMessages } from '../api/client.js';
import { ErrorState, Spinner, Button, EmptyState } from '../components/ui.jsx';
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

export default function Assessments() {
  usePageChrome([{ label: 'Assessments', active: true }], null, []);
  const deployment = useFetch(() => api.assessmentDeploymentProfile(), []);
  const airgap = useFetch(() => api.airgapStatus(true), []);
  const engagements = useFetch(() => api.assessmentEngagements(), []);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);

  const createEngagement = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setActionError(null);
    try {
      await api.createAssessmentEngagement({
        name: data.get('name'),
        owner: data.get('owner'),
        description: data.get('description'),
        classification: data.get('classification'),
      });
      event.currentTarget.reset();
      setFormOpen(false);
      engagements.reload();
    } catch (error) {
      setActionError({ message: apiErrorMessages(error).join(' ') });
    } finally {
      setSaving(false);
    }
  };

  const mode = deployment.data?.mode === 'airgap' ? 'AIR-GAPPED' : 'ONLINE';
  return (
    <div style={{ padding: '30px 32px', maxWidth: 1180 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-0.02em' }}>Assessments</div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 3 }}>
            Create an authorized engagement before planning any infrastructure, web, or embedded assessment.
          </div>
        </div>
        {deployment.loading ? <Spinner label="" /> : <DeploymentBadge mode={mode} source={deployment.data?.source} />}
      </header>

      {(deployment.error || engagements.error || actionError) && (
        <div style={{ marginTop: 20 }}>
          <ErrorState error={deployment.error || engagements.error || actionError} onRetry={engagements.reload} />
        </div>
      )}

      <section
        style={{
          marginTop: 24,
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--surface)',
          padding: 18,
        }}
      >
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '.06em' }}>
          SAFETY GATE
        </div>
        <div style={{ marginTop: 7, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
          The control plane stores explicit scope and time-bounded authorization. Current assessment capabilities create
          plans and approval records only; no target or device execution is enabled.
        </div>
      </section>

      {mode === 'AIR-GAPPED' && (
        <LocalProviderReadiness status={airgap.data?.localModelProvider} loading={airgap.loading} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '26px 0 14px' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Engagements</div>
        <Button onClick={() => setFormOpen((open) => !open)}>{formOpen ? 'Cancel' : '+ New engagement'}</Button>
      </div>

      {formOpen && <EngagementForm saving={saving} onSubmit={createEngagement} />}
      {engagements.loading && <Spinner />}
      {engagements.data?.length === 0 && !formOpen && (
        <EmptyState
          title="No engagements yet"
          sub="Begin with an accountable owner, approved scope, and authorization window."
          action={<Button onClick={() => setFormOpen(true)}>+ New engagement</Button>}
        />
      )}
      {engagements.data?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {engagements.data.map((engagement) => (
            <EngagementCard key={engagement.id} engagement={engagement} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeploymentBadge({ mode, source }) {
  const airgap = mode === 'AIR-GAPPED';
  return (
    <div
      className="mono"
      style={{
        padding: '7px 10px',
        borderRadius: 7,
        color: airgap ? 'var(--ok)' : 'var(--accent)',
        background: airgap ? 'var(--ok-bg)' : 'var(--accent-subtle)',
        fontSize: 11,
        letterSpacing: '.05em',
        whiteSpace: 'nowrap',
      }}
      title={
        source === 'environment'
          ? 'Enforced by the active Docker deployment profile.'
          : 'Configured in the control plane.'
      }
    >
      {mode}
    </div>
  );
}

function LocalProviderReadiness({ status, loading }) {
  const ready = status?.configured && status?.reachable && status?.modelAvailable;
  const title = loading ? 'Checking local provider' : ready ? 'Local model ready' : 'Local model requires attention';
  const detail = loading
    ? 'Verifying the internal provider and configured model…'
    : !status?.configured
      ? status?.reason || 'No local model provider is configured.'
      : !status.reachable
        ? status.reason || 'The internal model provider is unreachable.'
        : status.modelAvailable
          ? `${status.provider === 'ollama' ? 'Ollama' : 'OpenAI-compatible'} provider is reachable; ${status.model} is installed.`
          : `${status.model} is not installed on the internal provider.`;
  return (
    <section
      style={{
        marginTop: 14,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: ready ? 'var(--ok-bg)' : 'var(--surface)',
        padding: 16,
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 11, color: ready ? 'var(--ok)' : 'var(--text-3)', letterSpacing: '.06em' }}
      >
        LOCAL PROVIDER · {ready ? 'READY' : 'CHECK REQUIRED'}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{detail}</div>
      <div style={{ marginTop: 7, fontSize: 12, color: 'var(--text-3)' }}>
        Provider readiness does not enable target or device execution.
      </div>
    </section>
  );
}

function EngagementForm({ saving, onSubmit }) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
      <Field label="Engagement name">
        <input required name="name" style={inputStyle} placeholder="Authorized security review" />
      </Field>
      <Field label="Accountable owner">
        <input required name="owner" style={inputStyle} placeholder="Security team" />
      </Field>
      <Field label="Classification">
        <select name="classification" defaultValue="confidential" style={inputStyle}>
          <option value="confidential">Confidential</option>
          <option value="internal">Internal</option>
          <option value="restricted">Restricted</option>
        </select>
      </Field>
      <Field label="Description">
        <input name="description" style={inputStyle} placeholder="Purpose and approved context" />
      </Field>
      <div style={{ gridColumn: '1 / -1' }}>
        <Button type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create engagement'}
        </Button>
      </div>
    </form>
  );
}

function EngagementCard({ engagement }) {
  return (
    <Link
      to={`/assessments/${engagement.id}`}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--surface)',
        padding: 18,
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontWeight: 600 }}>{engagement.name}</div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>
          {engagement.classification}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8, minHeight: 38 }}>
        {engagement.description || 'No description provided.'}
      </div>
      <div
        className="mono"
        style={{
          borderTop: '1px solid var(--border-2)',
          marginTop: 14,
          paddingTop: 11,
          fontSize: 11,
          color: 'var(--text-3)',
        }}
      >
        OWNER · {engagement.owner}
      </div>
    </Link>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
      <span>{label}</span>
      {children}
    </label>
  );
}
