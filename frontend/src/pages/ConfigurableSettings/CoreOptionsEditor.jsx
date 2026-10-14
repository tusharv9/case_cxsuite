// ===== CORE OPTIONS EDITOR (field editor → core Create Case dropdowns) =====
// The options of the built-in case dropdowns live in their own master tables, shared by every form, the case list and routing:
//   caseType     → case types (name, case-number prefix)          editable here, saved immediately
//   subCategory  → each department's sub-categories               editable here, saved immediately
//   departmentId → teams (a department IS a team)                 managed on the Teams page
//   severity     → priorities and their SLA targets               managed on Cases SLA & Routing → Priority SLA Matrix
// Renaming follows the name into existing cases and rules (server side). Options are deactivated, never deleted, so cases keep them.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ExternalLink, Plus } from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { Select } from '../../components/common/Input/Input.jsx';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { departmentService } from '../../services/departmentService.js';
import { selectPlaceholder } from '../../utils/fieldValidation.js';
import { useToast } from '../../hooks/useToast.js';

const toCode = (name) => String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function CoreOptionsEditor({ apiField }) {
  if (apiField === 'departmentId') {
    return <ManagedElsewhere source="Teams" to="/teams" text="Departments are the teams on the Teams page (a department is a team). Add, rename or deactivate them there; the Create Case form lists the active ones." />;
  }
  if (apiField === 'severity') {
    return <ManagedElsewhere source="Priority SLA Matrix" to="/cases-sla-routing" text="Priorities are managed with their SLA targets on Cases SLA & Routing → Priority SLA Matrix, so a new priority can never exist without its response and resolution targets." />;
  }
  if (apiField === 'caseType') return <CaseTypeOptions />;
  if (apiField === 'subCategory') return <SubCategoryOptions />;
  return null;
}

function ManagedElsewhere({ source, to, text }) {
  return (
    <div className="core-options core-options--elsewhere">
      <p>{text}</p>
      <Link to={to} className="core-options__link"><ExternalLink size={13} /> Open {source}</Link>
    </div>
  );
}

/** Shared list UI: rename, active, move up/down, add. Every change is saved at once (these lists are shared master data). */
function OptionList({ title, items, busy, onRename, onToggle, onMove, onAdd, addPlaceholder, extraInput, emptyText, onDescribe }) {
  const [drafts, setDrafts] = useState({});
  const [descriptions, setDescriptions] = useState({});
  const [newName, setNewName] = useState('');
  const [newExtra, setNewExtra] = useState('');

  const commit = (item) => {
    const name = (drafts[item.id] ?? item.name).trim();
    if (!name || name === item.name) { setDrafts((d) => ({ ...d, [item.id]: undefined })); return; }
    onRename(item, name).then((ok) => ok !== false && setDrafts((d) => ({ ...d, [item.id]: undefined })));
  };

  const commitDescription = (item) => {
    const text = descriptions[item.id];
    if (text === undefined || text.trim() === (item.description || '')) { setDescriptions((d) => ({ ...d, [item.id]: undefined })); return; }
    onDescribe(item, text.trim()).then((ok) => ok !== false && setDescriptions((d) => ({ ...d, [item.id]: undefined })));
  };

  return (
    <div className="option-manager core-options">
      <div className="option-manager__head">
        <strong>{title}</strong>
        <span>{items.length} option{items.length === 1 ? '' : 's'} · changes are saved immediately and shared by every form</span>
      </div>
      {items.length === 0 && <p className="option-manager__empty">{emptyText}</p>}
      <ul className="option-manager__list">
        {items.map((item, i) => (
          <li key={item.id} className={`option-row ${item.isActive ? '' : 'option-row--off'}`}>
            <span className="core-options__order">
              <button type="button" onClick={() => onMove(i, -1)} disabled={busy || i === 0} aria-label={`Move ${item.name} up`}><ArrowUp size={12} /></button>
              <button type="button" onClick={() => onMove(i, 1)} disabled={busy || i === items.length - 1} aria-label={`Move ${item.name} down`}><ArrowDown size={12} /></button>
            </span>
            <input
              className="form-input option-row__label"
              value={drafts[item.id] ?? item.name}
              onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
              onBlur={() => commit(item)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
              disabled={busy}
              aria-label={`Name of ${item.name}`}
              title="Renaming also updates existing cases and rules that use this name"
            />
            {item.extra && <span className="core-options__extra">{item.extra}</span>}
            <label className="option-row__active">
              <input type="checkbox" checked={item.isActive} disabled={busy} onChange={(e) => onToggle(item, e.target.checked)} />
              Active
            </label>
            {onDescribe && (
              <input
                className="form-input core-options__description"
                value={descriptions[item.id] ?? item.description ?? ''}
                placeholder="Description shown to agents on Create Case"
                onChange={(e) => setDescriptions((d) => ({ ...d, [item.id]: e.target.value }))}
                onBlur={() => commitDescription(item)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                disabled={busy}
                aria-label={`Description of ${item.name}`}
              />
            )}
          </li>
        ))}
      </ul>
      <div className="option-manager__add">
        <input
          className="form-input"
          placeholder={addPlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(newName.trim(), newExtra.trim()).then((ok) => ok && (setNewName(''), setNewExtra(''))); } }}
          disabled={busy}
          aria-label="New option"
        />
        {extraInput && (
          <input className="form-input core-options__extra-input" placeholder={extraInput} value={newExtra} onChange={(e) => setNewExtra(e.target.value)} disabled={busy} aria-label={extraInput} />
        )}
        <Button variant="secondary" leftIcon={<Plus size={14} />} disabled={busy || !newName.trim()}
          onClick={() => onAdd(newName.trim(), newExtra.trim()).then((ok) => ok && (setNewName(''), setNewExtra('')))}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** Runs one save; reports the outcome; reloads the list. Returns whether it worked. */
function useSaver(reload) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (work, success) => {
    setBusy(true);
    try {
      await work();
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(err.message || 'The change could not be saved.');
      return false;
    } finally {
      await reload();
      setBusy(false);
    }
  }, [reload, toast]);
  return { busy, run };
}

/** Moves item i by dir and saves every item whose position changed, so the stored order is always 1..n. */
async function moveAndRenumber(items, i, dir, save) {
  const next = [...items];
  [next[i], next[i + dir]] = [next[i + dir], next[i]];
  for (const [index, item] of next.entries()) {
    if (item.displayOrder !== index + 1) await save(item, { displayOrder: index + 1 });
  }
}

const byOrder = (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || String(a.name).localeCompare(String(b.name));

function CaseTypeOptions() {
  const [items, setItems] = useState([]);
  const reload = useCallback(() => configurableSettingsService.getCaseTypes(false).then((l) => setItems([...(l || [])].sort(byOrder))).catch(() => setItems([])), []);
  useEffect(() => { reload(); }, [reload]);
  const { busy, run } = useSaver(reload);
  const save = (c, patch) => configurableSettingsService.updateCaseType(c.id, { code: c.code, name: c.name, prefix: c.prefix, displayOrder: c.displayOrder, isActive: c.isActive, ...patch });

  return (
    <OptionList
      title="Case types"
      items={items.map((c) => ({ ...c, extra: `Prefix ${c.prefix}` }))}
      busy={busy}
      emptyText="No case types yet. Add the first one below."
      addPlaceholder="New case type, e.g. Request"
      extraInput="Prefix, e.g. R-"
      onRename={(c, name) => run(() => save(c, { name }), `Case type renamed to "${name}".`)}
      onToggle={(c, isActive) => run(() => save(c, { isActive }), `"${c.name}" ${isActive ? 'activated' : 'deactivated'}.`)}
      onMove={(i, dir) => run(() => moveAndRenumber(items, i, dir, save))}
      onAdd={(name, prefix) => name
        ? run(() => configurableSettingsService.addCaseType(toCode(name), name, prefix || `${name[0].toUpperCase()}-`, items.length + 1), `Case type "${name}" added.`)
        : Promise.resolve(false)}
    />
  );
}

function SubCategoryOptions() {
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    departmentService.getAllDepartments(true).then((list) => {
      const active = (list || []).filter((d) => d.isActive !== false);
      setDepartments(active);
      setDepartmentId((current) => current || active[0]?.id || '');
    }).catch(() => setDepartments([]));
  }, []);

  const reload = useCallback(() => (departmentId
    ? configurableSettingsService.getSubCategories(departmentId, false).then((l) => setItems([...(l || [])].sort(byOrder))).catch(() => setItems([]))
    : Promise.resolve(setItems([]))), [departmentId]);
  useEffect(() => { reload(); }, [reload]);
  const { busy, run } = useSaver(reload);
  const save = (sc, patch) => configurableSettingsService.updateSubCategory(sc.id, { name: sc.name, code: sc.code, displayOrder: sc.displayOrder, isActive: sc.isActive, ...patch });

  return (
    <>
      <Select
        label="Department"
        value={departmentId}
        onChange={(e) => setDepartmentId(e.target.value)}
        placeholder={selectPlaceholder('Department')}
        emptyText="No active departments. Create teams on the Teams page."
        options={departments.map((d) => ({ value: d.id, label: d.name, searchText: d.code }))}
      />
      {departmentId && (
        <OptionList
          title={`Sub-categories of ${departments.find((d) => d.id === departmentId)?.name || 'this department'}`}
          items={items.map((sc) => ({ ...sc, extra: sc.code }))}
          busy={busy}
          emptyText="No sub-categories yet: this department is not offered on Create Case until it has one."
          addPlaceholder="New sub-category, e.g. Home Loan"
          onRename={(sc, name) => run(() => save(sc, { name }), `Sub-category renamed to "${name}".`)}
          onToggle={(sc, isActive) => run(() => save(sc, { isActive }), `"${sc.name}" ${isActive ? 'activated' : 'deactivated'}.`)}
          onDescribe={(sc, description) => run(() => save(sc, { description }), `Description of "${sc.name}" saved.`)}
          onMove={(i, dir) => run(() => moveAndRenumber(items, i, dir, save))}
          onAdd={(name) => name
            ? run(() => configurableSettingsService.addSubCategory(departmentId, name, null, items.length + 1), `Sub-category "${name}" added.`)
            : Promise.resolve(false)}
        />
      )}
    </>
  );
}
