// ===== ASSIGN & REASSIGN SETTINGS (Configurable Settings → Case Management) =====
// Who may be CHOSEN when a person assigns or reassigns a case, and the default strategy automatic routing uses.
// Everything here is read from and saved to the database (GET/PUT /api/assignment-settings) and is enforced by the server on
// every assignment; the tab only offers what the server can enforce. The parent page owns the unsaved-changes guard:
// this tab reports whether it is dirty (and what changed) and exposes save() for the guard's "Save changes".

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Crown, Plus, RotateCcw, Save, ShieldCheck, Users } from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { Select, Checkbox } from '../../components/common/Input/Input.jsx';
import { Loader, ErrorState } from '../../components/common/Loader/Loader.jsx';
import { assignmentSettingsService } from '../../services/assignmentSettingsService.js';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { ALGORITHM_LABELS } from '../../constants/assignment.js';
import { selectPlaceholder } from '../../utils/fieldValidation.js';
import { fieldErrorsFromError } from '../../utils/serverErrors.js';
import { useToast } from '../../hooks/useToast.js';
import './AssignmentSettingsTab.css';

const SCOPE_OPTIONS = [
  { value: 'Disabled', title: "The case's team only", desc: "Only members (and, if allowed, the lead) of the team the case belongs to can be chosen." },
  { value: 'SelectedTeams', title: "The case's team and selected teams", desc: 'Members of the teams you choose below can also be given other teams’ cases. The case stays with its own team.' },
  { value: 'AllTeams', title: "The case's team and every active team", desc: 'Members of any active team can be given any case. The case stays with its own team.' },
];

const memberKey = (teamId, userId) => `${teamId}:${userId}`;

// The reason lists behind the Assign / Transfer / Escalate dialogs (lookup lists; the server only accepts their active options).
const REASON_LISTS = [
  { code: 'ASSIGNMENT_REASON', title: 'Assign / Reassign reasons' },
  { code: 'TRANSFER_REASON', title: 'Transfer reasons' },
  { code: 'ESCALATION_REASON', title: 'Escalation reasons' },
];

const reasonRow = (r) => ({ id: r.id, value: r.value, label: r.label || r.value, displayOrder: r.displayOrder, isActive: r.isActive !== false, requiresDetail: Boolean(r.requiresDetail) });
const sameReasons = (a = [], b = []) => JSON.stringify(a) === JSON.stringify(b);

function draftFrom(s) {
  const selections = {};
  for (const t of s.teams) for (const m of t.members) selections[memberKey(t.id, m.userId)] = m.canBeManuallyAssigned;
  return {
    crossTeamMode: s.crossTeamMode,
    crossTeamDepartmentIds: [...s.crossTeamDepartmentIds].sort(),
    includeTeamLeads: s.includeTeamLeads,
    requireAvailable: s.requireAvailable,
    enforceCapacity: s.enforceCapacity,
    defaultAlgorithm: s.defaultAlgorithm,
    defaultCapacity: String(s.defaultCapacity),
    selections,
  };
}

export const AssignmentSettingsTab = forwardRef(function AssignmentSettingsTab({ onDirtyChange }, ref) {
  const toast = useToast();
  const [server, setServer] = useState(null);     // last loaded / saved settings
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [conflict, setConflict] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [reasonsServer, setReasonsServer] = useState({});   // list code -> stored rows
  const [reasonsDraft, setReasonsDraft] = useState({});
  const [reasonList, setReasonList] = useState(REASON_LISTS[0].code);
  const [newReason, setNewReason] = useState('');

  const load = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    setConflict(false);
    setErrors({});
    return Promise.all([
      assignmentSettingsService.get(),
      ...REASON_LISTS.map((l) => configurableSettingsService.getLookupValues(l.code, true, false).catch(() => [])),
    ])
      .then(([s, ...lists]) => {
        setServer(s);
        setDraft(draftFrom(s));
        setTeamId((current) => current || s.teams.find((t) => t.isActive)?.id || '');
        const rows = Object.fromEntries(REASON_LISTS.map((l, i) => [l.code, [...(lists[i] || [])].sort((a, b) => a.displayOrder - b.displayOrder).map(reasonRow)]));
        setReasonsServer(rows);
        setReasonsDraft(rows);
      })
      .catch((err) => setLoadError(err?.message || 'The Assign & Reassign settings could not be loaded.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const baseline = useMemo(() => (server ? draftFrom(server) : null), [server]);
  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setErrors({}); };

  const activeTeams = useMemo(() => (server?.teams || []).filter((t) => t.isActive), [server]);
  const teamById = useMemo(() => Object.fromEntries((server?.teams || []).map((t) => [t.id, t])), [server]);

  // ---- What changed (drives the dirty flag and the parent's "unsaved changes" summary) -------------------------------
  const changes = useMemo(() => {
    if (!draft || !baseline) return [];
    const yesNo = (v) => (v ? 'Yes' : 'No');
    const props = [];
    const diff = (label, a, b) => { if (a !== b) props.push({ label, oldVal: a, newVal: b }); };
    const scopeTitle = (v) => SCOPE_OPTIONS.find((o) => o.value === v)?.title || v;
    diff('Assignment scope', scopeTitle(baseline.crossTeamMode), scopeTitle(draft.crossTeamMode));
    const teamNames = (ids) => ids.map((id) => teamById[id]?.name || id).join(', ') || '—';
    if (draft.crossTeamMode === 'SelectedTeams') diff('Cross-team teams', teamNames(baseline.crossTeamDepartmentIds), teamNames(draft.crossTeamDepartmentIds));
    diff('Team leads can be chosen', yesNo(baseline.includeTeamLeads), yesNo(draft.includeTeamLeads));
    diff('Available or Busy only', yesNo(baseline.requireAvailable), yesNo(draft.requireAvailable));
    diff('Capacity enforced', yesNo(baseline.enforceCapacity), yesNo(draft.enforceCapacity));
    diff('Default algorithm', ALGORITHM_LABELS[baseline.defaultAlgorithm] || baseline.defaultAlgorithm, ALGORITHM_LABELS[draft.defaultAlgorithm] || draft.defaultAlgorithm);
    diff('Default capacity', baseline.defaultCapacity, draft.defaultCapacity);
    const memberChanges = Object.keys(draft.selections).filter((k) => draft.selections[k] !== baseline.selections[k]).length;
    if (memberChanges > 0) props.push({ label: 'Team member selection', oldVal: '—', newVal: `${memberChanges} member(s) changed` });
    for (const l of REASON_LISTS) {
      if (!sameReasons(reasonsDraft[l.code], reasonsServer[l.code])) props.push({ label: l.title, oldVal: '—', newVal: 'Edited' });
    }
    return props.length ? [{ id: 'assign-reassign', title: 'Assign & Reassign settings', type: 'modified', badgeLabel: 'Modified', properties: props }] : [];
  }, [draft, baseline, teamById, reasonsDraft, reasonsServer]);

  const isDirty = changes.length > 0;
  useEffect(() => { onDirtyChange?.({ isDirty, changes }); }, [isDirty, changes, onDirtyChange]);

  // ---- Validation (the server checks the same rules) -------------------------------------------------------------------
  const validate = () => {
    const e = {};
    if (draft.crossTeamMode === 'SelectedTeams' && draft.crossTeamDepartmentIds.length === 0) {
      e.crossTeamDepartmentIds = 'Choose at least one team, or choose another assignment scope.';
    }
    const cap = Number(draft.defaultCapacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) e.defaultCapacity = 'Capacity must be a whole number from 1 to 500.';
    if (!draft.defaultAlgorithm) e.defaultAlgorithm = 'Choose the default routing strategy.';
    for (const l of REASON_LISTS) {
      const rows = reasonsDraft[l.code] || [];
      const labels = rows.map((r) => r.label.trim().toLowerCase());
      if (labels.some((x) => !x)) e.reasons = `${l.title}: every reason needs a label.`;
      else if (new Set(labels).size !== labels.length) e.reasons = `${l.title}: two reasons have the same label.`;
      else if (rows.length > 0 && !rows.some((r) => r.isActive)) e.reasons = `${l.title}: keep at least one reason active, or the action cannot be used.`;
    }
    return e;
  };

  // Teams in which, with these settings, nobody could be chosen (a warning, not an error: it may be intended).
  const unreachableTeams = useMemo(() => {
    if (!draft) return [];
    return activeTeams.filter((t) => {
      const members = t.members.filter((m) => m.isUserActive && !m.isLead && draft.selections[memberKey(t.id, m.userId)]);
      const leadOk = draft.includeTeamLeads && t.leadId;
      return members.length === 0 && !leadOk;
    });
  }, [activeTeams, draft]);

  // ---- Save / discard ------------------------------------------------------------------------------------------------
  const save = useCallback(async () => {
    if (!draft || isSaving) return false;
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast.error('Please correct the highlighted settings.');
      return false;
    }
    const memberSelections = Object.keys(draft.selections)
      .filter((k) => draft.selections[k] !== baseline.selections[k])
      .map((k) => { const [departmentId, userId] = k.split(':'); return { departmentId, userId, canBeManuallyAssigned: draft.selections[k] }; });

    const settingsChanged = JSON.stringify({ ...draft, crossTeamDepartmentIds: draft.crossTeamMode === 'SelectedTeams' ? draft.crossTeamDepartmentIds : baseline.crossTeamDepartmentIds })
      !== JSON.stringify(baseline);
    const editedLists = REASON_LISTS.filter((l) => !sameReasons(reasonsDraft[l.code], reasonsServer[l.code]));

    setIsSaving(true);
    setErrors({});
    try {
      // Each reason list is saved as one transaction (the lookup list API); then the policy, if it changed.
      for (const l of editedLists) {
        const saved = await configurableSettingsService.saveLookupValues(l.code, reasonsDraft[l.code].map((r, i) => ({ ...r, displayOrder: i + 1 })));
        const rows = [...saved].sort((a, b) => a.displayOrder - b.displayOrder).map(reasonRow);
        setReasonsServer((prev) => ({ ...prev, [l.code]: rows }));
        setReasonsDraft((prev) => ({ ...prev, [l.code]: rows }));
      }
      if (!settingsChanged) {
        toast.success('Reasons saved. The dialogs use them from now on.');
        return true;
      }
      const saved = await assignmentSettingsService.save({
        crossTeamMode: draft.crossTeamMode,
        crossTeamDepartmentIds: draft.crossTeamMode === 'SelectedTeams' ? draft.crossTeamDepartmentIds : [],
        includeTeamLeads: draft.includeTeamLeads,
        requireAvailable: draft.requireAvailable,
        enforceCapacity: draft.enforceCapacity,
        defaultAlgorithm: draft.defaultAlgorithm,
        defaultCapacity: Number(draft.defaultCapacity),
        memberSelections,
        expectedVersion: server.version,
      });
      setServer(saved);
      setDraft(draftFrom(saved));
      toast.success('Assign & Reassign settings saved. They apply to the next assignment.');
      return true;
    } catch (err) {
      if (err?.original?.response?.status === 409) {
        setConflict(true);
        toast.error('Someone else saved these settings since you opened them. Reload to see their version.');
      } else {
        setErrors(fieldErrorsFromError(err));
        toast.error(err.message || 'The settings could not be saved.');
      }
      return false;   // the edits stay on screen
    } finally {
      setIsSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, baseline, server, isSaving, reasonsDraft, reasonsServer]);

  useImperativeHandle(ref, () => ({ save }), [save]);

  const discard = () => { setDraft(baseline); setReasonsDraft(reasonsServer); setErrors({}); };

  // ---- Rendering -----------------------------------------------------------------------------------------------------
  if (isLoading && !server) return <div className="config-card"><Loader text="Loading Assign & Reassign settings…" /></div>;
  if (loadError) return <div className="config-card"><ErrorState title="Couldn't load the settings" message={loadError} onRetry={load} /></div>;
  if (!draft) return null;

  const team = teamById[teamId];
  const teamMembers = team?.members || [];
  const selectedCount = teamMembers.filter((m) => draft.selections[memberKey(team.id, m.userId)]).length;
  const setMember = (userId, value) => set({ selections: { ...draft.selections, [memberKey(team.id, userId)]: value } });
  const setAllMembers = (value) => {
    const next = { ...draft.selections };
    for (const m of teamMembers) next[memberKey(team.id, m.userId)] = value;
    set({ selections: next });
  };
  const toggleCrossTeam = (id, on) => set({
    crossTeamDepartmentIds: (on ? [...draft.crossTeamDepartmentIds, id] : draft.crossTeamDepartmentIds.filter((x) => x !== id)).sort(),
  });
  const ownSettingTeams = (server.teams || []).filter((t) => t.isActive && t.hasOwnRoutingSettings);

  return (
    <div className="assign-settings">
      <div className="config-card">
        <div className="config-card__header">
          <div className="config-card__header-left">
            <div>
              <h2 className="config-card__title">Assign &amp; Reassign</h2>
              <p className="config-card__desc">
                Who can be chosen when someone assigns or reassigns a case, and how new cases are distributed. The server enforces
                these settings on every assignment.
              </p>
            </div>
          </div>
        </div>

        <div className="assign-settings__body">
          {/* 1. ASSIGNMENT SCOPE */}
          <section className="assign-section" aria-labelledby="as-scope">
            <h3 id="as-scope" className="assign-section__title">1. Assignment scope</h3>
            <p className="assign-section__desc">Whose people can be chosen for a case.</p>
            <div className="assign-scope" role="radiogroup" aria-labelledby="as-scope">
              {SCOPE_OPTIONS.map((o) => (
                <label key={o.value} className={`assign-scope__option ${draft.crossTeamMode === o.value ? 'is-selected' : ''}`}>
                  <input type="radio" name="crossTeamMode" value={o.value} checked={draft.crossTeamMode === o.value} onChange={() => set({ crossTeamMode: o.value })} />
                  <span>
                    <strong>{o.title}</strong>
                    <span>{o.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.crossTeamMode && <p className="form-error">{errors.crossTeamMode}</p>}
          </section>

          {/* 2. ELIGIBLE DEPARTMENTS AND TEAMS */}
          <section className="assign-section" aria-labelledby="as-teams">
            <h3 id="as-teams" className="assign-section__title">2. Eligible departments and teams</h3>
            {draft.crossTeamMode === 'SelectedTeams' ? (
              <>
                <p className="assign-section__desc">Members of these teams can also be given cases of other teams.</p>
                {activeTeams.length === 0 ? (
                  <p className="assign-empty">No active teams are configured yet. Create teams on the Teams page.</p>
                ) : (
                  <div className="assign-team-grid">
                    {activeTeams.map((t) => (
                      <Checkbox
                        key={t.id}
                        id={`cross-team-${t.id}`}
                        label={`${t.name} (${t.members.length} member${t.members.length === 1 ? '' : 's'})`}
                        checked={draft.crossTeamDepartmentIds.includes(t.id)}
                        onChange={(e) => toggleCrossTeam(t.id, e.target.checked)}
                      />
                    ))}
                  </div>
                )}
                {errors.crossTeamDepartmentIds && <p className="form-error">{errors.crossTeamDepartmentIds}</p>}
              </>
            ) : (
              <p className="assign-section__desc">
                {draft.crossTeamMode === 'AllTeams'
                  ? `All ${activeTeams.length} active teams are included. Choose “selected teams” in section 1 to limit this.`
                  : 'Only the case’s own team is used. Choose “selected teams” in section 1 to add other teams.'}
              </p>
            )}
          </section>

          {/* 3. ELIGIBLE AGENT ROLES */}
          <section className="assign-section" aria-labelledby="as-roles">
            <h3 id="as-roles" className="assign-section__title">3. Eligible agent roles</h3>
            <Checkbox
              id="include-team-leads"
              label="Team leads can be chosen"
              checked={draft.includeTeamLeads}
              onChange={(e) => set({ includeTeamLeads: e.target.checked })}
            />
            <p className="assign-section__hint">
              A team lead is the lead set on the Teams page. When off, leads are never offered, even if they are also members.
              Other members are chosen per team in section 4.
            </p>
          </section>

          {/* 4. TEAM MEMBERSHIP SELECTION */}
          <section className="assign-section" aria-labelledby="as-members">
            <h3 id="as-members" className="assign-section__title">4. Team membership selection</h3>
            <p className="assign-section__desc">
              Choose which members of each team can be chosen. New members are included automatically. Automatic routing is set
              separately on the Teams page (“receives cases”).
            </p>
            <div className="assign-members__picker">
              <Select
                label="Team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                placeholder={selectPlaceholder('Team')}
                emptyText="No active teams are configured yet."
                options={activeTeams.map((t) => ({ value: t.id, label: t.name, searchText: t.code }))}
              />
            </div>
            {team && (
              teamMembers.length === 0 ? (
                <p className="assign-empty">{team.name} has no members yet. Add members on the Teams page.</p>
              ) : (
                <div className="assign-members">
                  <div className="assign-members__toolbar">
                    <span className="assign-members__count">
                      <Users size={14} />
                      {selectedCount === teamMembers.length ? `All ${teamMembers.length} members can be chosen` : `${selectedCount} of ${teamMembers.length} members can be chosen`}
                    </span>
                    <span className="assign-members__actions">
                      <button type="button" onClick={() => setAllMembers(true)} disabled={selectedCount === teamMembers.length}>Select all</button>
                      <button type="button" onClick={() => setAllMembers(false)} disabled={selectedCount === 0}>Clear</button>
                    </span>
                  </div>
                  <ul className="assign-members__list">
                    {teamMembers.map((m) => (
                      <li key={m.userId} className={`assign-member ${m.isUserActive ? '' : 'is-inactive'}`}>
                        <Checkbox
                          id={`member-${team.id}-${m.userId}`}
                          label={m.name}
                          checked={Boolean(draft.selections[memberKey(team.id, m.userId)])}
                          onChange={(e) => setMember(m.userId, e.target.checked)}
                        />
                        <span className="assign-member__meta">
                          {m.isLead && <span className="assign-chip assign-chip--lead"><Crown size={11} /> Lead{draft.includeTeamLeads ? '' : ' — excluded (section 3)'}</span>}
                          {m.role && <span className="assign-chip">{m.role}</span>}
                          <span className="assign-chip">{m.status}</span>
                          {!m.isAssignable && <span className="assign-chip assign-chip--muted">No automatic cases</span>}
                          {!m.isUserActive && <span className="assign-chip assign-chip--danger">Account deactivated</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
            {unreachableTeams.length > 0 && (
              <div className="assign-warning" role="status">
                <AlertTriangle size={15} />
                <span>
                  With these settings nobody can be chosen in: <strong>{unreachableTeams.map((t) => t.name).join(', ')}</strong>.
                  Their cases could only be moved by transfer.
                </span>
              </div>
            )}
            {errors.memberSelections && <p className="form-error">{errors.memberSelections}</p>}
          </section>

          {/* 5. AVAILABILITY AND WORKLOAD */}
          <section className="assign-section" aria-labelledby="as-availability">
            <h3 id="as-availability" className="assign-section__title">5. Availability and workload rules</h3>
            <Checkbox
              id="require-available"
              label="Only people who are Available or Busy can be chosen"
              checked={draft.requireAvailable}
              onChange={(e) => set({ requireAvailable: e.target.checked })}
            />
            <p className="assign-section__hint">The status is the one each person sets in the header (Available, Busy, Away, Offline).</p>
            <Checkbox
              id="enforce-capacity"
              label="Only people below the team's open-case capacity can be chosen"
              checked={draft.enforceCapacity}
              onChange={(e) => set({ enforceCapacity: e.target.checked })}
            />
            <p className="assign-section__hint">Capacity is the case team&apos;s setting (section 7, or the team&apos;s own setting on the Teams page).</p>
          </section>

          {/* 6. CROSS-TEAM PERMISSIONS */}
          <section className="assign-section" aria-labelledby="as-permissions">
            <h3 id="as-permissions" className="assign-section__title">6. Cross-team assignment permissions</h3>
            <div className="assign-info">
              <ShieldCheck size={16} />
              <span>
                {draft.crossTeamMode === 'Disabled'
                  ? 'Cross-team assignment is off, so nobody can give a case to someone outside its team.'
                  : <>Giving a case to someone outside its team needs the <code>cases.assign</code> permission (by default: Team Lead, Supervisor and Admin roles, mapped by your Host App). Other people see those candidates but cannot choose them.</>}
                {' '}Within a team, the case owner, the team&apos;s members and its lead can always reassign.
              </span>
            </div>
          </section>

          {/* 7. DEFAULT ROUTING STRATEGY */}
          <section className="assign-section" aria-labelledby="as-routing">
            <h3 id="as-routing" className="assign-section__title">7. Default routing strategy</h3>
            <p className="assign-section__desc">How new cases are given to a team&apos;s agents automatically, unless the team has its own setting.</p>
            <div className="assign-routing">
              <Select
                label="Algorithm"
                required
                value={draft.defaultAlgorithm}
                onChange={(e) => set({ defaultAlgorithm: e.target.value })}
                placeholder={selectPlaceholder('Algorithm')}
                error={errors.defaultAlgorithm}
                options={(server.algorithms || []).map((a) => ({ value: a, label: ALGORITHM_LABELS[a] || a }))}
              />
              <div className="form-group">
                <label className="form-label form-label--required" htmlFor="default-capacity">Open cases per agent</label>
                <input
                  id="default-capacity"
                  type="number"
                  min={1}
                  max={500}
                  className={`form-input ${errors.defaultCapacity ? 'form-input--error' : ''}`}
                  value={draft.defaultCapacity}
                  onChange={(e) => set({ defaultCapacity: e.target.value })}
                />
                {errors.defaultCapacity && <span className="form-error">{errors.defaultCapacity}</span>}
              </div>
            </div>
            {ownSettingTeams.length > 0 && (
              <p className="assign-section__hint">
                {ownSettingTeams.map((t) => t.name).join(', ')} {ownSettingTeams.length === 1 ? 'has' : 'have'} {ownSettingTeams.length === 1 ? 'its' : 'their'} own setting (Teams page) and {ownSettingTeams.length === 1 ? 'is' : 'are'} not affected.
              </p>
            )}
          </section>
        </div>

        {/* REASONS (used by the Assign, Transfer and Escalate dialogs; enforced by the server) */}
        <div className="assign-settings__body assign-settings__body--reasons">
          <section className="assign-section" aria-labelledby="as-reasons">
            <h3 id="as-reasons" className="assign-section__title">8. Reasons</h3>
            <p className="assign-section__desc">
              The reasons people choose when they assign, transfer or escalate a case. Inactive reasons are not offered; past cases keep
              theirs. A reason marked “needs explanation” (such as Other) asks for a typed explanation.
            </p>
            <div className="assign-members__picker">
              <Select
                label="List"
                value={reasonList}
                onChange={(e) => { setReasonList(e.target.value); setNewReason(''); }}
                options={REASON_LISTS.map((l) => ({ value: l.code, label: l.title }))}
              />
            </div>
            {(() => {
              const rows = reasonsDraft[reasonList] || [];
              const setRows = (next) => { setReasonsDraft((prev) => ({ ...prev, [reasonList]: next })); setErrors((e) => ({ ...e, reasons: undefined })); };
              const update = (i, patch) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
              const move = (i, dir) => { const next = [...rows]; [next[i], next[i + dir]] = [next[i + dir], next[i]]; setRows(next); };
              const add = () => {
                const label = newReason.trim();
                if (!label) return;
                if (rows.some((r) => r.label.trim().toLowerCase() === label.toLowerCase())) { setErrors((e) => ({ ...e, reasons: `“${label}” is already in this list.` })); return; }
                setRows([...rows, { value: label, label, displayOrder: rows.length + 1, isActive: true, requiresDetail: false }]);
                setNewReason('');
              };
              return (
                <div className="assign-members">
                  {rows.length === 0 && <p className="assign-empty">This list has no reasons yet, so the dialog cannot be used. Add the first one below.</p>}
                  <ul className="assign-members__list">
                    {rows.map((r, i) => (
                      <li key={r.id || `new-${r.value}`} className={`assign-member assign-reason ${r.isActive ? '' : 'is-inactive'}`}>
                        <span className="core-options__order">
                          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${r.label} up`}><ArrowUp size={12} /></button>
                          <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move ${r.label} down`}><ArrowDown size={12} /></button>
                        </span>
                        <input
                          className="form-input assign-reason__label"
                          value={r.label}
                          onChange={(e) => update(i, { label: e.target.value })}
                          aria-label={`Label of ${r.value}`}
                          title={r.id ? `Stored value: ${r.value} (kept on past cases; the label can change)` : undefined}
                        />
                        {!r.id && <span className="assign-chip assign-chip--lead">New</span>}
                        <Checkbox id={`reason-active-${reasonList}-${i}`} label="Active" checked={r.isActive} onChange={(e) => update(i, { isActive: e.target.checked })} />
                        <Checkbox id={`reason-detail-${reasonList}-${i}`} label="Needs explanation" checked={r.requiresDetail} onChange={(e) => update(i, { requiresDetail: e.target.checked })} />
                        {!r.id && (
                          <button type="button" className="assign-reason__remove" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} aria-label={`Remove ${r.label}`}>Remove</button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="assign-reason__add">
                    <input
                      className="form-input"
                      placeholder="Add a reason, e.g. Language requirement"
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                      aria-label="New reason"
                    />
                    <Button variant="secondary" leftIcon={<Plus size={14} />} onClick={add} disabled={!newReason.trim()}>Add</Button>
                  </div>
                </div>
              );
            })()}
            {errors.reasons && <p className="form-error">{errors.reasons}</p>}
          </section>
        </div>

        {/* 8. VALIDATION AND SAVE */}
        <div className="assign-savebar" role="region" aria-label="Save Assign & Reassign settings">
          <div className="assign-savebar__status">
            {conflict ? (
              <span className="assign-savebar__conflict"><AlertCircle size={15} /> Someone else saved these settings. Reload to continue.</span>
            ) : isDirty ? (
              <span className="assign-savebar__dirty"><AlertCircle size={15} /> Unsaved changes ({changes[0].properties.length})</span>
            ) : (
              <span className="assign-savebar__clean"><CheckCircle2 size={15} /> All changes saved{server.version ? ` · last saved ${new Date(server.version).toLocaleString()}` : ''}</span>
            )}
          </div>
          <div className="assign-savebar__actions">
            {conflict ? (
              <Button variant="primary" leftIcon={<RotateCcw size={14} />} onClick={load}>Reload</Button>
            ) : (
              <>
                <Button variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={discard} disabled={!isDirty || isSaving}>Discard</Button>
                <Button variant="primary" leftIcon={<Save size={14} />} onClick={save} isLoading={isSaving} disabled={!isDirty || isSaving}>
                  Save changes
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
