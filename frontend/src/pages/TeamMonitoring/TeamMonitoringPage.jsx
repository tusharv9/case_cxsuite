// ===== TEAM MONITORING PAGE — Omni CX Suite =====
// Everything here is computed by the server from live cases and team membership (see TeamMonitoringService).
// Where there is no data the page says so; it never shows a placeholder number.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, AlertTriangle, ArrowDown, ArrowUp, WifiOff } from 'lucide-react';
import { Avatar } from '../../components/common/Avatar/Avatar.jsx';
import { Loader, ErrorState } from '../../components/common/Loader/Loader.jsx';
import { Pagination } from '../../components/common/Pagination/Pagination.jsx';
import { teamMonitoringService } from '../../services/teamMonitoringService.js';
import { teamService } from '../../services/teamService.js';
import { useToast } from '../../hooks/useToast.js';
import { useApp } from '../../contexts/AppContext.jsx';
import './TeamMonitoringPage.css';

const REFRESH_MS = 15000;      // how often the wallboard refreshes while the tab is visible
const STALE_AFTER_MS = 45000;  // after this long without a successful refresh the page says its data is old

function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function TeamMonitoringPage() {
  const toast = useToast();
  const { can } = useApp();
  const canNudge = can('monitoring.nudge');

  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [overview, setOverview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [lastOkAt, setLastOkAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);

  const [agentPage, setAgentPage] = useState(1);
  const [agentPageSize, setAgentPageSize] = useState(5);
  const [nudgingAgentId, setNudgingAgentId] = useState(null);

  const inFlight = useRef(false);
  const teamIdRef = useRef('');
  teamIdRef.current = teamId;

  const refresh = useCallback(async ({ initial = false } = {}) => {
    if (inFlight.current) return;            // never stack requests on a slow server
    inFlight.current = true;
    if (initial) setIsLoading(true);
    try {
      const data = await teamMonitoringService.getOverview(teamIdRef.current || undefined);
      setOverview(data);
      setLoadError(null);
      setLastOkAt(Date.now());
    } catch (err) {
      setLoadError(err?.message || 'The monitor could not be loaded.');   // kept on screen; old data is marked stale
    } finally {
      inFlight.current = false;
      if (initial) setIsLoading(false);
    }
  }, []);

  // Teams for the filter.
  useEffect(() => {
    teamService.getAllTeams().then((t) => setTeams((t || []).filter((x) => x.isActive !== false))).catch(() => {});
  }, []);

  // Load now (and whenever the team changes); then refresh on a timer that pauses while the tab is hidden.
  useEffect(() => {
    refresh({ initial: true });

    const tick = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [teamId, refresh]);

  const handleNudge = async (agent) => {
    setNudgingAgentId(agent.userId);
    try {
      await teamMonitoringService.nudgeAgent(agent.userId, 'Supervisor operational nudge for queue prioritization');
      toast.success(`Nudge sent to ${agent.name}.`);
    } catch (err) {
      toast.error(`Failed to nudge ${agent.name}.`);
    } finally {
      setNudgingAgentId(null);
    }
  };

  const renderStateBadge = (state) => {
    const s = (state || '').toLowerCase();
    if (s.includes('available')) return <span className="state-badge state-badge--available"><span className="state-badge__dot" /> Available</span>;
    if (s.includes('interaction') || s.includes('busy')) return <span className="state-badge state-badge--busy"><span className="state-badge__dot" /> On interaction</span>;
    if (s.includes('break') || s.includes('away')) return <span className="state-badge state-badge--break"><span className="state-badge__dot" /> Break</span>;
    return <span className="state-badge state-badge--offline"><span className="state-badge__dot state-badge__dot--hollow" /> Offline</span>;
  };

  if (isLoading) {
    return (
      <div className="team-monitor-page team-monitor-page--loading">
        <Loader text="Loading live wallboard…" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="team-monitor-page">
        <ErrorState title="Couldn't load the Team Monitor" message={loadError || 'No data was returned.'} onRetry={() => refresh({ initial: true })} />
      </div>
    );
  }

  const { summary, agents, queues, slaAtRisk } = overview;
  const isStale = loadError !== null || (lastOkAt !== null && now - lastOkAt > STALE_AFTER_MS);

  const totalAgents = agents.length;
  const totalPages = Math.max(1, Math.ceil(totalAgents / agentPageSize));
  const safePage = Math.min(agentPage, totalPages);
  const displayedAgents = agents.slice((safePage - 1) * agentPageSize, safePage * agentPageSize);

  const avgNow = summary.avgResolutionMinutes;
  const avgBefore = summary.avgResolutionYesterdayMinutes;
  const avgDelta = avgNow != null && avgBefore != null ? avgNow - avgBefore : null;

  const occupancy = summary.occupancyPercent;
  const inBand = occupancy != null && occupancy >= summary.occupancyTargetMin && occupancy <= summary.occupancyTargetMax;

  const maxQueue = Math.max(1, ...queues.map((q) => q.openCount));

  return (
    <div className="team-monitor-page">
      <header className="team-monitor-header">
        <div className="team-monitor-header__left">
          <h1 className="team-monitor-title">Team Monitor</h1>
          <p className="team-monitor-subtitle">
            Agent state, queue health &amp; SLA risk — {overview.teamName ? overview.teamName : 'all teams'}
          </p>
        </div>
        <div className="team-monitor-header__right">
          <select
            className="monitor-team-select"
            value={teamId}
            onChange={(e) => { setTeamId(e.target.value); setAgentPage(1); }}
            aria-label="Filter by team"
          >
            <option value="">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {isStale ? (
            <div className="wallboard-live-pill wallboard-live-pill--stale" title={loadError || 'The last refresh was a while ago'}>
              <WifiOff size={13} />
              <span>Data may be out of date{lastOkAt ? ` · updated ${new Date(lastOkAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            </div>
          ) : (
            <div className="wallboard-live-pill">
              <span className="live-dot" />
              <span>Live · refreshed {new Date(overview.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          )}
        </div>
      </header>

      <section className="monitor-kpis-grid">
        <div className="monitor-kpi-card monitor-kpi-card--blue">
          <span className="monitor-kpi-label">AGENTS ONLINE</span>
          <div className="monitor-kpi-value">{summary.onlineAgentsCount} / {summary.totalAgentsCount}</div>
          <span className="monitor-kpi-subtext">{summary.agentsBreakCount} on break</span>
        </div>

        <div className="monitor-kpi-card monitor-kpi-card--accent">
          <span className="monitor-kpi-label">LONGEST QUEUE WAIT</span>
          <div className="monitor-kpi-value">{summary.longestQueueWaitMinutes == null ? '—' : formatMinutes(summary.longestQueueWaitMinutes)}</div>
          <span className={`monitor-kpi-subtext ${summary.longestQueueWaitOverTarget ? 'monitor-kpi-subtext--warning' : ''}`}>
            {summary.longestQueueWaitMinutes == null
              ? 'Nothing is waiting for a first answer'
              : `${summary.longestQueueCaseNumber}${summary.longestQueueChannel ? ` · ${summary.longestQueueChannel}` : ''}${summary.longestQueueWaitOverTarget ? ' — first-response target missed' : ''}`}
          </span>
        </div>

        <div className="monitor-kpi-card">
          <span className="monitor-kpi-label">AVG TIME TO RESOLVE · TODAY</span>
          <div className="monitor-kpi-value">{avgNow == null ? '—' : formatMinutes(avgNow)}</div>
          <span className={`monitor-kpi-subtext ${avgDelta != null && avgDelta <= 0 ? 'monitor-kpi-subtext--trend-down' : ''}`}>
            {avgNow == null
              ? 'No cases resolved yet today'
              : avgDelta == null
                ? `${summary.resolvedTodayCount} resolved today`
                : (<>{avgDelta <= 0 ? <ArrowDown size={13} /> : <ArrowUp size={13} />} {formatMinutes(Math.abs(avgDelta))} {avgDelta <= 0 ? 'faster' : 'slower'} than yesterday</>)}
          </span>
        </div>

        <div className="monitor-kpi-card monitor-kpi-card--occupancy">
          <span className="monitor-kpi-label">OCCUPANCY</span>
          <div className="monitor-kpi-value">{occupancy == null ? '—' : `${Math.round(occupancy)}%`}</div>
          <span className={`monitor-kpi-subtext ${occupancy != null && !inBand ? 'monitor-kpi-subtext--warning' : ''}`}>
            {occupancy == null ? 'No agent is available' : `Target band ${summary.occupancyTargetMin}–${summary.occupancyTargetMax}%`}
          </span>
        </div>
      </section>

      <div className="monitor-columns-grid">
        <div className="monitor-column monitor-column--left">
          <div className="monitor-panel">
            <div className="monitor-panel__header">
              <h2 className="monitor-panel__title">Agent status board</h2>
            </div>
            <div className="monitor-table-wrap scrollbar-thin">
              <table className="monitor-table">
                <thead>
                  <tr>
                    <th>AGENT</th>
                    <th>STATE</th>
                    <th>OPEN CASES</th>
                    <th>RESOLVED TODAY</th>
                    <th className="th-action">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedAgents.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-gray-500)' }}>
                        {teamId ? 'This team has no active members.' : 'No team members yet. Add people to a team on the Teams page.'}
                      </td>
                    </tr>
                  ) : displayedAgents.map((agent) => (
                    <tr key={agent.userId}>
                      <td>
                        <div className="agent-cell">
                          <Avatar name={agent.name} size="md" />
                          <div className="agent-cell__details">
                            <span className="agent-cell__name">{agent.name}</span>
                            <span className="agent-cell__role">{agent.role}{agent.teamName ? ` · ${agent.teamName}` : ''}</span>
                          </div>
                        </div>
                      </td>
                      <td>{renderStateBadge(agent.state)}</td>
                      <td>
                        <div className="open-cases-cell">
                          <span className="open-cases-num" title={`Capacity ${agent.capacity}`}>{agent.openCasesCount}<span className="open-cases-cap"> / {agent.capacity}</span></span>
                          {agent.breachedCasesCount > 0 && <span className="breach-pill">{agent.breachedCasesCount} breach</span>}
                          {!agent.isAssignable && <span className="breach-pill breach-pill--muted" title="On the team, but not given cases automatically">no auto-cases</span>}
                        </div>
                      </td>
                      <td><span className="handled-today-cell">{agent.handledTodayCount}</span></td>
                      <td className="td-action">
                        <button
                          className="btn-nudge"
                          onClick={() => handleNudge(agent)}
                          disabled={!canNudge || nudgingAgentId === agent.userId}
                          title={canNudge ? `Send nudge to ${agent.name}` : 'You do not have permission to nudge agents'}
                        >
                          {nudgingAgentId === agent.userId ? 'Nudging…' : 'Nudge'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {agents.length > 0 && (
              <Pagination
                itemLabel="agents"
                page={safePage}
                pageSize={agentPageSize}
                totalCount={agents.length}
                totalPages={totalPages}
                onPageChange={setAgentPage}
                onPageSizeChange={(newSize) => { setAgentPageSize(newSize); setAgentPage(1); }}
                pageSizeOptions={[5, 10, 20]}
              />
            )}
          </div>
        </div>

        <div className="monitor-column monitor-column--right">
          <div className="monitor-panel">
            <div className="monitor-panel__header">
              <h2 className="monitor-panel__title">Queue health</h2>
            </div>
            <div className="queue-health-list">
              {queues.length === 0 ? (
                <div className="sla-at-risk-empty">No channels are configured.</div>
              ) : queues.map((q) => (
                <div key={q.channel} className="queue-health-row" title={`${q.openCount} open · ${q.breachedCount} breached`}>
                  <span className="queue-health-channel">{q.channel}</span>
                  <div className="queue-health-bar-track">
                    <div className="queue-health-bar-fill" style={{ width: `${(q.openCount / maxQueue) * 100}%` }} />
                  </div>
                  <span className="queue-health-waiting">
                    <strong>{q.waitingCount}</strong> waiting{q.oldestWaitMinutes != null ? ` · ${formatMinutes(q.oldestWaitMinutes)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="monitor-panel">
            <div className="monitor-panel__header monitor-panel__header--split">
              <h2 className="monitor-panel__title">SLA at-risk</h2>
              <span className="sla-auto-escalation-label">escalates automatically</span>
            </div>
            <div className="sla-at-risk-list">
              {slaAtRisk.length === 0 ? (
                <div className="sla-at-risk-empty">No cases currently at breach risk.</div>
              ) : slaAtRisk.map((c) => (
                <div key={c.caseId} className="sla-risk-item">
                  <div className="sla-risk-item__left">
                    <span className={`sla-risk-percent-badge ${c.health === 'Breached' ? 'sla-risk-percent-badge--breached' : ''}`}>{Math.round(c.elapsedPercent)}%</span>
                    <div className="sla-risk-item__info">
                      <span className="sla-risk-item__title"><strong>{c.caseNumber}</strong> {c.title}</span>
                      <span className="sla-risk-item__owner">{c.ownerName}</span>
                    </div>
                  </div>
                  <div className="sla-risk-item__right">
                    <span className="sla-risk-time-pill">
                      <Clock size={12} /> {c.timeRemainingMinutes < 0 ? `${formatMinutes(-c.timeRemainingMinutes)} over` : formatMinutes(c.timeRemainingMinutes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
