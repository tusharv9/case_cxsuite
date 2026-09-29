// ===== TEAMS PAGE — Omni CX Suite =====

import { useState, useEffect } from 'react';
import { Plus, Phone, MessageSquare, Mail, Megaphone, Users, RefreshCw } from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { Avatar } from '../../components/common/Avatar/Avatar.jsx';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import { CreateTeamDrawer } from '../../components/drawer/CreateTeamDrawer/CreateTeamDrawer.jsx';
import { teamService } from '../../services/teamService.js';
import { useToast } from '../../hooks/useToast.js';
import './TeamsPage.css';

export function TeamsPage() {
  const toast = useToast();
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setIsDrawerOpen(true)}
            id="btn-create-team"
          >
            Create Team
          </Button>
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
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setIsDrawerOpen(true)}>
              Create Team
            </Button>
          </div>
        ) : (
          <div className="teams-grid">
            {teams.map((team, idx) => {
              const initials = getInitials(team.name);
              const avatarVariants = ['sd', 'sp', 'cs'];
              const variantClass = `team-avatar--${avatarVariants[idx % avatarVariants.length]}`;

              return (
                <div key={team.id} className="team-card">
                  {/* Card Header */}
                  <div className="team-card__header">
                    <div className={`team-card__avatar ${variantClass}`}>
                      {initials}
                    </div>
                    <div className="team-card__title-wrap">
                      <h2 className="team-card__name">{team.name}</h2>
                      <p className="team-card__function">{team.function}</p>
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

      {/* Create Team Drawer */}
      <CreateTeamDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={fetchTeams}
      />
    </div>
  );
}
