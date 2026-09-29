// ===== CREATE TEAM DRAWER — Omni CX Suite =====

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Check } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { teamService } from '../../../services/teamService.js';
import { useToast } from '../../../hooks/useToast.js';
import './CreateTeamDrawer.css';

export function CreateTeamDrawer({ isOpen, onClose, onSuccess }) {
  const toast = useToast();

  const [name, setName] = useState('');
  const [teamLeadId, setTeamLeadId] = useState('');
  const [functionText, setFunctionText] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;

    // Reset form
    setName('');
    setTeamLeadId('');
    setFunctionText('');
    setSelectedUserIds([]);
    setErrors({});

    setDataLoading(true);
    teamService
      .getAvailableUsers()
      .then((users) => {
        setAvailableUsers(users || []);
        if (users && users.length > 0) {
          setTeamLeadId(users[0].id);
        }
      })
      .catch((err) => {
        toast.error('Failed to load users for team selection');
      })
      .finally(() => {
        setDataLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleMember = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Team name is required.';
    if (!teamLeadId) errs.teamLeadId = 'Team lead is required.';
    if (!functionText.trim()) errs.functionText = 'Function description is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      // Ensure lead is included in members if not already selected
      const finalMemberIds = Array.from(new Set([...selectedUserIds, teamLeadId]));

      const payload = {
        name: name.trim(),
        function: functionText.trim(),
        teamLeadId,
        channels: 'Voice,Chat,Email,Social',
        memberUserIds: finalMemberIds,
      };

      const created = await teamService.createTeam(payload);
      toast.success(`Team "${created.name}" created successfully.`);
      if (onSuccess) onSuccess(created);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to create team.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="create-drawer create-team-drawer" aria-label="Create Team Drawer">
        {/* Header */}
        <div className="create-drawer__header">
          <div className="create-drawer__header-content">
            <h2>Create team</h2>
            <p>Configure operational squad, assigned lead, and active members</p>
          </div>
          <button className="create-drawer__close" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form className="create-drawer__body scrollbar-thin" onSubmit={handleSubmit} id="create-team-form">
          {/* Team Name */}
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

          {/* Team Lead */}
          <div className="form-group">
            <label className="form-label" htmlFor="team-lead-select">
              Team lead <span className="required-star">*</span>
            </label>
            <select
              id="team-lead-select"
              className={`input-field input-field--select ${errors.teamLeadId ? 'input-field--error' : ''}`}
              value={teamLeadId}
              onChange={(e) => {
                setTeamLeadId(e.target.value);
                if (errors.teamLeadId) setErrors((prev) => ({ ...prev, teamLeadId: null }));
              }}
              disabled={isLoading || dataLoading}
            >
              <option value="">Select a team lead</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role || 'Agent'}
                </option>
              ))}
            </select>
            {errors.teamLeadId && <span className="form-error-msg">{errors.teamLeadId}</span>}
          </div>

          {/* Function */}
          <div className="form-group">
            <label className="form-label" htmlFor="team-function-input">
              Function <span className="required-star">*</span>
            </label>
            <input
              id="team-function-input"
              type="text"
              className={`input-field ${errors.functionText ? 'input-field--error' : ''}`}
              placeholder="What this team does (e.g. Lead qualification & conversion)"
              value={functionText}
              onChange={(e) => {
                setFunctionText(e.target.value);
                if (errors.functionText) setErrors((prev) => ({ ...prev, functionText: null }));
              }}
              disabled={isLoading}
            />
            {errors.functionText && <span className="form-error-msg">{errors.functionText}</span>}
          </div>

          {/* Members Checklist */}
          <div className="form-group team-members-section">
            <label className="form-label">
              Members <span className="team-members-count">({selectedUserIds.length} selected)</span>
            </label>
            <div className="team-members-list scrollbar-thin">
              {dataLoading ? (
                <div className="team-members-empty">Loading available agents…</div>
              ) : availableUsers.length === 0 ? (
                <div className="team-members-empty">No available users found.</div>
              ) : (
                availableUsers.map((user) => {
                  const isChecked = selectedUserIds.includes(user.id) || user.id === teamLeadId;
                  const isLead = user.id === teamLeadId;
                  return (
                    <div
                      key={user.id}
                      className={`team-member-item ${isChecked ? 'team-member-item--selected' : ''}`}
                      onClick={() => !isLead && handleToggleMember(user.id)}
                    >
                      <div className="team-member-checkbox-wrap">
                        <input
                          type="checkbox"
                          className="team-member-checkbox"
                          checked={isChecked}
                          onChange={() => !isLead && handleToggleMember(user.id)}
                          disabled={isLead}
                        />
                      </div>
                      <div className="team-member-avatar-wrap">
                        <Avatar name={user.name} size="sm" />
                      </div>
                      <div className="team-member-info">
                        <div className="team-member-name-row">
                          <span className="team-member-name">{user.name}</span>
                          {isLead && <span className="team-member-lead-badge">Lead</span>}
                        </div>
                        <span className="team-member-role">{user.role || 'Service Agent'}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="create-drawer__footer">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-team-form"
            loading={isLoading}
            disabled={isLoading || dataLoading}
          >
            Create Team
          </Button>
        </div>
      </aside>
    </>,
    document.body
  );
}
