import { useState, useEffect } from 'react';
import { Plus, Phone, MessageSquare, Mail, Megaphone, Users, AlertTriangle, X } from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { Avatar } from '../../components/common/Avatar/Avatar.jsx';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import { CreateTeamDrawer } from '../../components/drawer/CreateTeamDrawer/CreateTeamDrawer.jsx';
import { teamService } from '../../services/teamService.js';
import { useToast } from '../../hooks/useToast.js';
import { useApp } from '../../contexts/AppContext.jsx';
import './TeamsPage.css';

export function TeamsPage() {
  const toast = useToast();
  const { can } = useApp();
  const canManage = can('teams.manage'); // server enforces this too; the UI just doesn't offer what would be refused
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // { team, member }
  const [isRemoving, setIsRemoving] = useState(false);

  const fetchTeams = async () => {
    setIsLoading(true);
    try {
      const data = await teamService.getAllTeams();
      setTeams(data || []);
    } catch (err) {
      toast.error('Failed to load teams.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const getInitials = (name) => {
    if (!name) return 'TM';
    const parts = name.split(/[\s—–-]+/).filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const formatSinceDate = (dateStr) => {
    if (!dateStr) return 'since 01 Jul 2026';
    const d = new Date(dateStr);
    return `since ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  const renderChannelIcons = (channelsStr) => {
    const raw = (channelsStr || 'Voice,Chat,Email').toLowerCase();
    return (
      <div className="team-card__channels-icons">
        {(raw.includes('voice') || raw.includes('phone')) && (
          <span className="channel-icon-pill" title="Voice / Phone">
            <Phone size={13} />
          </span>
        )}
        {(raw.includes('chat') || raw.includes('whatsapp')) && (
          <span className="channel-icon-pill" title="Chat / Messaging">
            <MessageSquare size={13} />
          </span>
        )}
        {raw.includes('email') && (
          <span className="channel-icon-pill" title="Email">
            <Mail size={13} />
          </span>
        )}
        {raw.includes('social') && (
          <span className="channel-icon-pill" title="Social Channels">
            <Megaphone size={13} />
          </span>
        )}
      </div>
    );
  };

  const handleToggleTeam = async (team) => {
    try {
      const updated = await teamService.toggleStatus(team.id);
      toast.success(`Team "${team.name}" is now ${updated.isActive ? 'Active' : 'Inactive'}.`);
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, isActive: updated.isActive } : t)));
    } catch (err) {
      toast.error(err.message || 'Failed to toggle team status.');
    }
  };

  const handleExecuteRemoveMember = async () => {
    if (!confirmRemove) return;
    const { team, member } = confirmRemove;
    setIsRemoving(true);
    try {
      await teamService.removeMember(team.id, member.userId || member.id);
      toast.success(`Removed ${member.name} from ${team.name}.`);
      setConfirmRemove(null);
      fetchTeams();
    } catch (err) {
      toast.error(err.message || 'Failed to remove member.');
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="teams-page">
      {/* Header */}
      <header className="teams-page__header">
        <div className="teams-page__header-left">
          <h1 className="teams-page__title">Teams</h1>
          <p className="teams-page__subtitle">
            Cross-functional squads powering cases, sales pursuit and campaign delivery
          </p>
        </div>
        <div className="teams-page__header-actions">
          {canManage && (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setIsDrawerOpen(true)}
              id="btn-create-team"
            >
              Create Team
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="teams-page__content">
        {isLoading ? (
          <div className="teams-page__loader">
            <Loader text="Loading teams…" />
          </div>
        ) : teams.length === 0 ? (
          <div className="teams-page__empty-state">
            <Users size={48} className="teams-page__empty-icon" />
            <h3>No Teams Configured</h3>
            <p>Create your first operational squad to begin managing cases and agent queues.</p>
            {canManage && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setIsDrawerOpen(true)}>
                Create Team
              </Button>
            )}
          </div>
        ) : (
          <div className="teams-grid">
            {teams.map((team, idx) => {
              const initials = getInitials(team.name);
              const avatarVariants = ['sd', 'sp', 'cs'];
              const variantClass = `team-avatar--${avatarVariants[idx % avatarVariants.length]}`;
              const isActive = team.isActive !== false;

              return (
                <div key={team.id} className={`team-card ${!isActive ? 'team-card--inactive' : ''}`}>
                  {/* Card Header */}
                  <div className="team-card__header">
                    <div className={`team-card__avatar ${variantClass}`}>
                      {initials}
                    </div>
                    <div className="team-card__title-wrap">
                      <h2 className="team-card__name">{team.name}</h2>
                      <p className="team-card__function">{team.function}</p>
                    </div>
                    {/* Active / Inactive Status Management */}
                    <div className="team-card__status-toggle-wrap">
                      <span className={`team-status-badge ${isActive ? 'team-status-badge--active' : 'team-status-badge--inactive'}`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        type="button"
                        className={`team-toggle-switch ${isActive ? 'team-toggle-switch--on' : 'team-toggle-switch--off'}`}
                        onClick={() => handleToggleTeam(team)}
                        disabled={!canManage}
                        title={canManage ? `Click to set team ${isActive ? 'Inactive' : 'Active'}` : 'You do not have permission to change teams'}
                        aria-label={`Toggle ${team.name} status`}
                      >
                        <span className="team-toggle-slider" />
                      </button>
                    </div>
                  </div>

                  {/* Members List */}
                  <div className="team-card__members">
                    {team.members && team.members.length > 0 ? (
                      team.members.map((member) => {
                        const isLead = member.isLead;
                        const statusLower = (member.status || 'available').toLowerCase();

                        return (
                          <div key={member.userId || member.id} className="team-card__member-row">
                            <div className="team-card__member-avatar">
                              <Avatar name={member.name} size="sm" />
                            </div>
                            <div className="team-card__member-info">
                              <div className="team-card__member-name">{member.name}</div>
                              <div className="team-card__member-role">{member.role}</div>
                            </div>
                            <div className="team-card__member-badge-wrap">
                              {isLead ? (
                                <span className="member-badge member-badge--lead">Lead</span>
                              ) : (
                                <span className={`member-badge member-badge--${statusLower}`}>
                                  {statusLower === 'available' ? 'online' : statusLower}
                                </span>
                              )}
                            </div>
                            {/* Remove Member Button */}
                            {!isLead && canManage && (
                              <button
                                type="button"
                                className="team-card__member-remove-btn"
                                title={`Remove ${member.name} from team`}
                                onClick={() => setConfirmRemove({ team, member })}
                                aria-label={`Remove ${member.name}`}
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="team-card__no-members">No active members assigned</div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="team-card__footer">
                    <div className="team-card__channels-label">
                      <span>Channels:</span>
                      {renderChannelIcons(team.channels)}
                    </div>
                    <div className="team-card__since">
                      {formatSinceDate(team.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Removing Member */}
      {confirmRemove && (
        <div className="team-modal-overlay" onClick={() => !isRemoving && setConfirmRemove(null)}>
          <div className="team-modal" onClick={(e) => e.stopPropagation()}>
            <div className="team-modal__header">
              <div className="team-modal__icon-wrap">
                <AlertTriangle size={20} color="#dc2626" />
              </div>
              <h3 className="team-modal__title">Remove Member from Team</h3>
            </div>
            <p className="team-modal__text">
              Are you sure you want to remove <strong>{confirmRemove.member.name}</strong> from <strong>{confirmRemove.team.name}</strong>?
            </p>
            <p className="team-modal__subtext">
              This action removes the agent from the squad assignment. The underlying user profile and account will <strong>not</strong> be deleted.
            </p>
            <div className="team-modal__actions">
              <Button
                variant="secondary"
                onClick={() => setConfirmRemove(null)}
                disabled={isRemoving}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleExecuteRemoveMember}
                isLoading={isRemoving}
              >
                Confirm Removal
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Team Drawer */}
      <CreateTeamDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={fetchTeams}
      />
    </div>
  );
}
