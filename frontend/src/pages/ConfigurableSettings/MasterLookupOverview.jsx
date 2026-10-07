// ===== MASTER LOOKUP OVERVIEW (read-only) =====
// The options of a list are managed where the list is used: Edit the dropdown field → "Manage options". There is ONE source
// of truth for each list (the central lookup tables), shared by Customer 360 and Case Management; this tab only shows what
// those lists currently hold so nobody has to open each field to find out.

import { Info } from 'lucide-react';

export function MasterLookupOverview({ lists }) {
  return (
    <div className="master-overview">
      <p className="master-overview__note">
        <Info size={14} /> Read-only overview. To add, rename or switch off an option, open the dropdown field (e.g. “Preferred Language”)
        in <strong>Add New Customer</strong> and use <strong>Manage options</strong>. A change there is used everywhere the list appears, including Case Management.
      </p>
      <div className="master-data-grid">
        {lists.map((list) => (
          <div className="master-card" key={list.typeCode}>
            <div>
              <h3 className="master-card__title">{list.title}</h3>
              <p className="master-card__desc"><code>{list.typeCode}</code> · {list.items.length} option{list.items.length === 1 ? '' : 's'}</p>
            </div>
            <div className="master-overview__chips">
              {list.items.length === 0 && <span className="master-card__empty">No options yet.</span>}
              {list.items.map((item) => (
                <span key={item.id || item.value} className={`master-overview__chip ${item.isActive === false ? 'master-overview__chip--off' : ''}`}>
                  {item.label || item.value}{item.isActive === false ? ' (off)' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
