// ===== CREATE / EDIT TEAM DRAWER — Omni CX Suite =====
// One drawer for both flows. A team's members are its ONLY membership list: whoever is ticked here (and marked
// "receives cases") is who routing can give the team's cases to. A team may follow the global assignment settings
// or carry its own algorithm and capacity.

import { useState, useEffect } from 'react';
import { Button } from '../../common/Button/Button.jsx';
import { SideDrawer } from '../../common/SideDrawer/SideDrawer.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { teamService } from '../../../services/teamService.js';
import { routingRuleService } from '../../../services/routingRuleService.js';
import { useToast } from '../../../hooks/useToast.js';
import './CreateTeamDrawer.css';

export const ALGORITHM_LABELS = {
  RoundRobin: 'Round robin — take turns',
  LeastOccupancy: 'Least occupancy — fewest open cases first',
  SkillBased: 'Skill based — best skill match first',
};

export function CreateTeamDrawer({ isOpen, onClose, onSuccess, team = null }) {
  const toast = useToast();
  const isEdit = Boolean(team);

  const [name, setName] = useState('');
  const [teamLeadId, setTeamLeadId] = useState('');
  const [functionText, setFunctionText] = useState('');
  // userId -> receives cases
  const [members, setMembers] = useState({});
  const [availableUsers, setAvailableUsers] = useState([]);

  const [globalConfig, setGlobalConfig] = useState(null);
  const [algorithms, setAlgorithms] = useState(Object.keys(ALGORITHM_LABELS));
  const [useGlobal, setUseGlobal] = useState(true);
  const [algorithm, setAlgorithm] = useState('RoundRobin');
  const [capacity, setCapacity] = useState(5);

  const [isLoading, setIsLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [baseline, setBaseline] = useState(null);   // what the form looked like when it finished loading, to tell whether it was edited

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setDataLoading(true);

    Promise.all([teamService.getAvailableUsers(), routingRuleService.getAssignmentConfig(), routingRuleService.getVocabulary()])
      .then(([users, global, vocab]) => {
        const active = (users || []).filter((u) => u.isActive !== false);
        setAvailableUsers(active);
        setGlobalConfig(global);
        if (vocab?.algorithms?.length) setAlgorithms(vocab.algorithms);

        if (team) {
          setName(team.name || '');
          setFunctionText(team.function || '');
          setTeamLeadId(team.teamLeadId || '');
          setMembers(Object.fromEntries((team.members || []).map((m) => [m.userId, m.isAssignable !== false])));
          setUseGlobal(!team.hasOwnAssignmentSettings);
          setAlgorithm(team.assignmentAlgorithm || global.algorithm);
          setCapacity(team.maxConcurrentCapacity || global.maxConcurrentCapacity);
        } else {
          setName('');
          setFunctionText('');
          setTeamLeadId('');
          setMembers({});
          setUseGlobal(true);
          setAlgorithm(global.algorithm);
          setCapacity(global.maxConcurrentCapacity);
        }
      })
      .catch(() => toast.error('Failed to load the options for this team.'))
      .finally(() => setDataLoading(false));
  }, [isOpen, team]);

  const formSnapshot = JSON.stringify({ name, teamLeadId, functionText, members, useGlobal, algorithm, capacity: Number(capacity) });
  useEffect(() => {
    if (isOpen && !dataLoading && baseline === null) setBaseline(formSnapshot);
    if (!isOpen && baseline !== null) setBaseline(null);
  }, [isOpen, dataLoading, baseline, formSnapshot]);
  const isDirty = baseline !== null && baseline !== formSnapshot;

  if (!isOpen) return null;

  const toggleMember = (userId) =>
    setMembers((prev) => {
      const next = { ...prev };
      if (userId in next) delete next[userId];
      else next[userId] = true;
      return next;
    });

  const setAssignable = (userId, value) => setMembers((prev) => ({ ...prev, [userId]: value }));

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Team name is required.';
    if (!useGlobal) {
      const n = Number(capacity);
      if (!Number.isInteger(n) || n < 1 || n > 500) errs.capacity = 'Capacity must be a whole number from 1 to 500.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const payload = {
        name: name.trim(),
        function: functionText.trim(),
        teamLeadId: teamLeadId || null,
        members: Object.entries(members).map(([userId, isAssignable]) => ({ userId, isAssignable })),
      };

      if (!useGlobal) {
        payload.assignmentAlgorithm = algorithm;
        payload.maxConcurrentCapacity = Number(capacity);
      } else if (isEdit) {
        payload.useGlobalAssignmentSettings = true;
      }

      const saved = isEdit ? await teamService.updateTeam(team.id, payload) : await teamService.createTeam(payload);
      toast.success(`Team "${saved.name}" ${isEdit ? 'updated' : 'created'} successfully.`);
      onSuccess?.(saved);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to save team.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      className="create-team-drawer"
      title={isEdit ? 'Edit Team' : 'Create Team'}
      subtitle="Lead, members, and how new cases are given to this team's agents"
      ariaLabel={isEdit ? 'Edit Team Drawer' : 'Create Team Drawer'}
      bodyAs="form"
      bodyProps={{ onSubmit: handleSubmit, id: 'create-team-form' }}
      footer={({ requestClose }) => (
        <>
          <Button variant="ghost" onClick={requestClose} disabled={isLoading}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-team-form" isLoading={isLoading} disabled={isLoading || dataLoading}>
            {isEdit ? 'Save Changes' : 'Create Team'}
          </Button>
        </>
      )}
    >
          <div className="form-group">
            <label className="form-label" htmlFor="team-name-input">
              Team name <span className="required-star">*</span>
            </label>
            <input
              id="team-name-input"
              type="text"
              className={`input-field ${errors.name ? 'input-field--error' : ''}`}
              placeholder="e.g. Priority Desk"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: null }));
              }}
              disabled={isLoading}
            />
            {errors.name && <span className="form-error-msg">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="team-lead-select">Team lead</label>
            <select
              id="team-lead-select"
              className="input-field input-field--select"
              value={teamLeadId}
              onChange={(e) => setTeamLeadId(e.target.value)}
              disabled={isLoading || dataLoading}
            >
              <option value="">No team lead</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.role || 'Agent'}</option>
              ))}
            </select>
            <span className="form-hint">The lead holds a case when no agent can take it, and is told.</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="team-function-input">Function</label>
            <input
              id="team-function-input"
              type="text"
              className="input-field"
              placeholder="What this team does (e.g. Lead qualification & conversion)"
              value={functionText}
              onChange={(e) => setFunctionText(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Assignment settings */}
          <div className="form-group team-assignment-section">
            <label className="form-label">How new cases are assigned</label>
            <label className="team-assignment-global">
              <input type="checkbox" checked={useGlobal} onChange={(e) => setUseGlobal(e.target.checked)} disabled={isLoading || dataLoading} />
              <span>
                Follow the global settings
                {globalConfig && <em> ({ALGORITHM_LABELS[globalConfig.algorithm]?.split(' — ')[0] || globalConfig.algorithm}, up to {globalConfig.maxConcurrentCapacity} open cases each)</em>}
              </span>
            </label>
            {!useGlobal && (
              <div className="team-assignment-own">
                <select
                  className="input-field input-field--select"
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                  aria-label="Assignment algorithm"
                  disabled={isLoading}
                >
                  {algorithms.map((a) => (
                    <option key={a} value={a}>{ALGORITHM_LABELS[a] || a}</option>
                  ))}
                </select>
                <label className="team-assignment-capacity">
                  <span>Open cases per agent</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    className={`input-field ${errors.capacity ? 'input-field--error' : ''}`}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    aria-label="Capacity per agent"
                    disabled={isLoading}
                  />
                </label>
                {errors.capacity && <span className="form-error-msg">{errors.capacity}</span>}
              </div>
            )}
          </div>

          {/* Members */}
          <div className="form-group team-members-section">
            <label className="form-label">
              Members <span className="team-members-count">({Object.keys(members).length} selected)</span>
            </label>
            <div className="team-members-list scrollbar-thin">
              {dataLoading ? (
                <div className="team-members-empty">Loading available agents…</div>
              ) : availableUsers.length === 0 ? (
                <div className="team-members-empty">No available users found.</div>
              ) : (
                availableUsers.map((user) => {
                  const isMember = user.id in members;
                  const isLead = user.id === teamLeadId;
                  const receives = members[user.id] !== false;
                  return (
                    <div key={user.id} className={`team-member-item ${isMember ? 'team-member-item--selected' : ''}`}>
                      <div className="team-member-checkbox-wrap">
                        <input
                          type="checkbox"
                          className="team-member-checkbox"
                          checked={isMember}
                          onChange={() => toggleMember(user.id)}
                          aria-label={`${user.name} is a member`}
                        />
                      </div>
                      <div className="team-member-avatar-wrap">
                        <Avatar name={user.name} size="sm" />
                      </div>
                      <div className="team-member-info" onClick={() => toggleMember(user.id)}>
                        <div className="team-member-name-row">
                          <span className="team-member-name">{user.name}</span>
                          {isLead && <span className="team-member-lead-badge">Lead</span>}
                        </div>
                        <span className="team-member-role">{user.role || 'Service Agent'}</span>
                      </div>
                      {isMember && (
                        <label className="team-member-receives" title="Whether cases are routed to this person automatically">
                          <input
                            type="checkbox"
                            checked={receives}
                            onChange={(e) => setAssignable(user.id, e.target.checked)}
                            aria-label={`${user.name} receives cases`}
                          />
                          <span>gets cases</span>
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <span className="form-hint">The lead is always on the team, but only receives cases automatically if ticked here too.</span>
          </div>
    </SideDrawer>
  );
}
