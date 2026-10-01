// ===== TEAM MONITORING PAGE — Omni CX Suite =====

import { useState, useEffect, useRef } from 'react';
import { Radio, Star, Clock, AlertTriangle, ArrowDown, Users, Phone, MessageSquare, Mail, Megaphone, Send } from 'lucide-react';
import { Avatar } from '../../components/common/Avatar/Avatar.jsx';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import { Pagination } from '../../components/common/Pagination/Pagination.jsx';
import { teamMonitoringService } from '../../services/teamMonitoringService.js';
import { useToast } from '../../hooks/useToast.js';
import './TeamMonitoringPage.css';

export function TeamMonitoringPage() {
  const toast = useToast();

  const [summary, setSummary] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentPage, setAgentPage] = useState(1);
  const [agentPageSize, setAgentPageSize] = useState(5);
  const [queueHealth, setQueueHealth] = useState([]);
  const [slaAtRisk, setSlaAtRisk] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [nudgingAgentId, setNudgingAgentId] = useState(null);

  const pollIntervalRef = useRef(null);

  const fetchMonitoringData = async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const [sumRes, agRes, qhRes, slaRes] = await Promise.all([
        teamMonitoringService.getSummary(),
        teamMonitoringService.getAgentBoard(),
        teamMonitoringService.getQueueHealth(),
        teamMonitoringService.getSlaAtRisk(),
      ]);

      setSummary(sumRes);
      setAgents(agRes || []);
      setQueueHealth(qhRes || []);
      setSlaAtRisk(slaRes || []);
    } catch (err) {
      if (isInitial) {
        toast.error('Failed to load team monitoring operational data.');
      }
    } finally {
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoringData(true);

    // Live wallboard polling every 8 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchMonitoringData(false);
    }, 8000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleNudge = async (agent) => {
    setNudgingAgentId(agent.userId);
    try {
      await teamMonitoringService.nudgeAgent(
        agent.userId,
        `Supervisor operational nudge for queue prioritization`
      );
      toast.success(`Nudge sent to ${agent.name}.`);
    } catch (err) {
      toast.error(`Failed to nudge ${agent.name}.`);
    } finally {
      setNudgingAgentId(null);
    }
  };

  const renderStateBadge = (state) => {
    const s = (state || 'Available').toLowerCase();
    if (s.includes('available')) {
      return (
        <span className="state-badge state-badge--available">
          <span className="state-badge__dot" /> Available
        </span>
      );
    }
    if (s.includes('interaction') || s.includes('busy')) {
      return (
        <span className="state-badge state-badge--busy">
          <span className="state-badge__dot" /> On interaction
        </span>
      );
    }
    if (s.includes('break') || s.includes('away')) {
      return (
        <span className="state-badge state-badge--break">
          <span className="state-badge__dot" /> Break
        </span>
      );
    }
    return (
      <span className="state-badge state-badge--offline">
        <span className="state-badge__dot state-badge__dot--hollow" /> Offline
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="team-monitor-page team-monitor-page--loading">
        <Loader text="Loading live wallboard telemetry…" />
      </div>
    );
  }

  return (
    <div className="team-monitor-page">
      {/* Header */}
      <header className="team-monitor-header">
        <div className="team-monitor-header__left">
          <h1 className="team-monitor-title">Team Monitor</h1>
          <p className="team-monitor-subtitle">
            Real-time agent state, queue health &amp; SLA risk — refreshes live
          </p>
        </div>
        <div className="team-monitor-header__right">
          <div className="wallboard-live-pill">
            <span className="live-dot" />
            <span>Wallboard live</span>
          </div>
        </div>
      </header>

      {/* Top 4 KPI Metric Cards */}
      <section className="monitor-kpis-grid">
        {/* KPI 1: Agents Online */}
        <div className="monitor-kpi-card monitor-kpi-card--blue">
          <span className="monitor-kpi-label">AGENTS ONLINE</span>
          <div className="monitor-kpi-value">
            {summary?.onlineAgentsCount ?? 3} / {summary?.totalAgentsCount ?? 6}
          </div>
          <span className="monitor-kpi-subtext">
            {summary?.agentsBreakCount ?? 2} on break rotation
          </span>
        </div>

        {/* KPI 2: Longest Queue Wait */}
        <div className="monitor-kpi-card monitor-kpi-card--accent">
          <span className="monitor-kpi-label">LONGEST QUEUE WAIT</span>
          <div className="monitor-kpi-value">
            {summary?.longestQueueWaitMinutes ?? 38} min
          </div>
          <span className="monitor-kpi-subtext monitor-kpi-subtext--warning">
            {summary?.longestQueueChannel ?? 'Email queue — above 15m target'}
          </span>
        </div>

        {/* KPI 3: Avg Handle Time */}
        <div className="monitor-kpi-card">
          <span className="monitor-kpi-label">AVG HANDLE TIME</span>
          <div className="monitor-kpi-value">
            {summary?.avgHandleTimeString ?? '6m 12s'}
          </div>
          <span className="monitor-kpi-subtext monitor-kpi-subtext--trend-down">
            <ArrowDown size={13} /> 40s vs yesterday
          </span>
        </div>

        {/* KPI 4: Occupancy */}
        <div className="monitor-kpi-card monitor-kpi-card--occupancy">
          <span className="monitor-kpi-label">OCCUPANCY</span>
          <div className="monitor-kpi-value">
            {Math.round(summary?.occupancyPercent ?? 78)}%
          </div>
          <span className="monitor-kpi-subtext">
            Target band {summary?.occupancyTargetBand ?? '70–85%'}
          </span>
        </div>
      </section>

      {/* Main 2-Column Dashboard Layout */}
      <div className="monitor-columns-grid">
        {/* Left Column: Agent Status Board */}
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
                    <th>TODAY</th>
                    <th>CSAT</th>
                    <th className="th-action">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalAgents = agents.length;
                    const totalPages = Math.max(1, Math.ceil(totalAgents / agentPageSize));
                    const safePage = Math.min(agentPage, totalPages);
                    const displayedAgents = agents.slice((safePage - 1) * agentPageSize, safePage * agentPageSize);

                    if (displayedAgents.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-gray-500)' }}>
                            No agents found
                          </td>
                        </tr>
                      );
                    }

                    return displayedAgents.map((agent) => (
                      <tr key={agent.userId}>
                        {/* Agent */}
                        <td>
                          <div className="agent-cell">
                            <Avatar name={agent.name} size="md" />
                            <div className="agent-cell__details">
                              <span className="agent-cell__name">{agent.name}</span>
                              <span className="agent-cell__role">{agent.role}</span>
                            </div>
                          </div>
                        </td>

                        {/* State */}
                        <td>{renderStateBadge(agent.state)}</td>

                        {/* Open Cases */}
                        <td>
                          <div className="open-cases-cell">
                            <span className="open-cases-num">{agent.openCasesCount}</span>
                            {agent.breachedCasesCount > 0 && (
                              <span className="breach-pill">
                                {agent.breachedCasesCount} breach
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Today */}
                        <td>
                          <span className="handled-today-cell">
                            {agent.handledTodayCount} handled
                          </span>
                        </td>

                        {/* CSAT */}
                        <td>
                          <div className="csat-cell">
                            <Star size={13} className="csat-star-icon" />
                            <span>{Number(agent.csatScore).toFixed(1)}</span>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="td-action">
                          <button
                            className="btn-nudge"
                            onClick={() => handleNudge(agent)}
                            disabled={nudgingAgentId === agent.userId}
                            title={`Send nudge to ${agent.name}`}
                          >
                            {nudgingAgentId === agent.userId ? 'Nudging…' : 'Nudge'}
                          </button>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {agents.length > 0 && (
              <Pagination
                itemLabel="agents"
                page={Math.min(agentPage, Math.max(1, Math.ceil(agents.length / agentPageSize)))}
                pageSize={agentPageSize}
                totalCount={agents.length}
                totalPages={Math.max(1, Math.ceil(agents.length / agentPageSize))}
                onPageChange={setAgentPage}
                onPageSizeChange={(newSize) => {
                  setAgentPageSize(newSize);
                  setAgentPage(1);
                }}
                pageSizeOptions={[5, 10, 20]}
              />
            )}
          </div>
        </div>

        {/* Right Column: Queue Health & SLA At-Risk */}
        <div className="monitor-column monitor-column--right">
          {/* Card 1: Queue Health */}
          <div className="monitor-panel">
            <div className="monitor-panel__header">
              <h2 className="monitor-panel__title">Queue health</h2>
            </div>
            <div className="queue-health-list">
              {queueHealth.map((q) => (
                <div key={q.channel} className="queue-health-row">
                  <span className="queue-health-channel">{q.channel}</span>
                  <div className="queue-health-bar-track">
                    <div
                      className="queue-health-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(10, q.loadPercent))}%` }}
                    />
                  </div>
                  <span className="queue-health-waiting">
                    <strong>{q.waitingCount}</strong> waiting
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: SLA At-Risk */}
          <div className="monitor-panel">
            <div className="monitor-panel__header monitor-panel__header--split">
              <h2 className="monitor-panel__title">SLA at-risk</h2>
              <span className="sla-auto-escalation-label">auto-escalation armed</span>
            </div>
            <div className="sla-at-risk-list">
              {slaAtRisk.length === 0 ? (
                <div className="sla-at-risk-empty">
                  No cases currently at breach risk. All queues within SLA tolerance.
                </div>
              ) : (
                slaAtRisk.map((c) => (
                  <div key={c.caseId} className="sla-risk-item">
                    <div className="sla-risk-item__left">
                      <span className="sla-risk-percent-badge">{c.elapsedPercent}%</span>
                      <div className="sla-risk-item__info">
                        <span className="sla-risk-item__title">
                          <strong>{c.caseNumber}</strong> {c.title}
                        </span>
                      </div>
                    </div>
                    <div className="sla-risk-item__right">
                      <span className="sla-risk-time-pill">
                        <Clock size={12} /> {c.timeRemainingDisplay}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
