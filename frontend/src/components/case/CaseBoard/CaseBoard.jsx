// ===== CASE BOARD — OmniConnect Reference System =====

import { useMemo } from 'react';
import { Package } from 'lucide-react';
import { CaseCard } from '../CaseCard/CaseCard.jsx';
import { BOARD_COLUMNS } from '../../../constants/index.js';
import { Skeleton } from '../../common/Skeleton/Skeleton.jsx';
import './CaseBoard.css';

// --- Single Kanban Column ---
function CaseColumn({ column, cases, selectedCaseId, onCardClick }) {
  const statusKey = column.key.toLowerCase();
  return (
    <div className={`case-column case-column--${statusKey}`} role="region" aria-label={`${column.label} cases`}>
      <div className="case-column__header">
        <span className="case-column__indicator" aria-hidden="true" />
        <span className="case-column__title">{column.label}</span>
        <span className="case-column__count">{cases.length}</span>
      </div>
      <div className="case-column__body scrollbar-thin">
        {cases.length === 0 ? (
          <div className="case-column__empty">
            <Package size={24} strokeWidth={1.2} />
            <span>No cases</span>
          </div>
        ) : (
          cases.map((c) => (
            <CaseCard
              key={c.id}
              caseData={c}
              isSelected={c.id === selectedCaseId}
              onClick={() => onCardClick?.(c)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --- Board ---
export function CaseBoard({ cases = [], selectedCaseId, onCardClick, isLoadingBoard }) {
  // Group Cases into the 5 Kanban Columns
  const groupedCases = useMemo(() => {
    return BOARD_COLUMNS.reduce((acc, col) => {
      acc[col.key] = cases.filter((c) => {
        if (col.key === 'WaitingOnCustomer') {
          return c.status === 'WaitingOnCustomer' || c.status === 'Waiting on Customer';
        }
        if (col.key === 'InProgress') {
          return c.status === 'InProgress' || c.status === 'In Progress';
        }
        return c.status === col.key;
      });
      return acc;
    }, {});
  }, [cases]);

  if (isLoadingBoard) {
    return (
      <div className="case-board" role="main">
        {BOARD_COLUMNS.map((col) => {
          const statusKey = col.key.toLowerCase();
          return (
            <div key={col.key} className={`case-column case-column--${statusKey}`}>
              <div className="case-column__header">
                <span className="case-column__indicator" aria-hidden="true" />
                <span className="case-column__title">{col.label}</span>
                <span className="case-column__count">-</span>
              </div>
              <div className="case-column__body">
                <Skeleton.Card style={{ marginBottom: 12, padding: 12 }}>
                  <Skeleton.Text lines={2} style={{ marginBottom: 12 }} />
                </Skeleton.Card>
                <Skeleton.Card style={{ marginBottom: 12, padding: 12 }}>
                  <Skeleton.Text lines={2} style={{ marginBottom: 12 }} />
                </Skeleton.Card>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="case-board" role="main">
      {BOARD_COLUMNS.map((col) => (
        <CaseColumn
          key={col.key}
          column={col}
          cases={groupedCases[col.key] || []}
          selectedCaseId={selectedCaseId}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}
