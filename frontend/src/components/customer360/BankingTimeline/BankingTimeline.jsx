// ===== BANKING TIMELINE COMPONENT =====

import './BankingTimeline.css';

export const MOCK_BANKING_TIMELINE_ITEMS = [
  {
    id: 'tl-1',
    meta: 'Today · 09:14',
    title: 'Inbound voice call · BM',
    description: 'Discussed Personal Financing-i application status (Case C-10472).',
    dotColor: '#16a34a', // green
  },
  {
    id: 'tl-2',
    meta: 'Today · 09:18',
    title: 'AI · Auto-summary attached to case',
    description: 'Sentiment turned frustrated mid-call; case escalated to micro-finance.',
    dotColor: '#9333ea', // purple
  },
  {
    id: 'tl-3',
    meta: '3 days ago · WhatsApp',
    title: 'Document upload via WhatsApp BSP',
    description: 'PF-i supporting docs (payslip x 3, EPF statement).',
    dotColor: '#16a34a', // green
  },
  {
    id: 'tl-4',
    meta: '12 days ago · Voice',
    title: 'Debit card PIN reset',
    description: 'Case C-10465 opened · resolved next day.',
    dotColor: '#d97706', // orange/amber
  },
  {
    id: 'tl-5',
    meta: '21 days ago · Branch - Kepong',
    title: 'Walk-in · SSPN-i enquiry',
    description: 'Captured by branch staff into omni-thread.',
    dotColor: '#16a34a', // green
  },
];

export function BankingTimeline({ events = MOCK_BANKING_TIMELINE_ITEMS }) {
  const items = events && events.length > 0 ? events : MOCK_BANKING_TIMELINE_ITEMS;

  return (
    <div className="banking-timeline-compact">
      {items.map((item, idx) => {
        const metaText = item.meta || item.timestamp || 'Recent';
        const titleText = item.title || item.activity || 'Activity';
        const descText = item.description || '';
        const color = item.dotColor || '#16a34a';

        return (
          <div key={item.id || idx} className="banking-timeline-compact__item">
            {/* Left dot & line */}
            <div className="banking-timeline-compact__left">
              <span className="banking-timeline-compact__dot" style={{ backgroundColor: color }} />
              {idx < items.length - 1 && <span className="banking-timeline-compact__line" />}
            </div>

            {/* Right content */}
            <div className="banking-timeline-compact__right">
              <span className="banking-timeline-compact__meta">{metaText}</span>
              <h4 className="banking-timeline-compact__title">{titleText}</h4>
              {descText && <p className="banking-timeline-compact__desc">{descText}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
