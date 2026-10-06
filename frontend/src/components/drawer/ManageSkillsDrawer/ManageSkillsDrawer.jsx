// ===== MANAGE SKILLS DRAWER — Omni CX Suite =====
// Skill-based assignment needs two things, both configured here (nothing is guessed in code):
//  1. SKILL RULES — "when a case looks like this, it needs skill X".
//  2. AGENT SKILLS — which skills each agent has, and how strong (1–5).

import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { SideDrawer } from '../../common/SideDrawer/SideDrawer.jsx';
import { skillService } from '../../../services/skillService.js';
import { teamService } from '../../../services/teamService.js';
import { useToast } from '../../../hooks/useToast.js';
import '../CreateCaseDrawer/CreateCaseDrawer.css';
import './ManageSkillsDrawer.css';

const FIELD_LABELS = {
  Title: 'Case title', Description: 'Description', CaseType: 'Case type', Channel: 'Channel',
  Subcategory: 'Sub-category', Priority: 'Priority', CustomerSegment: 'Customer segment',
};

export function ManageSkillsDrawer({ isOpen, onClose }) {
  const toast = useToast();
  const [tab, setTab] = useState('rules');
  const [loading, setLoading] = useState(false);

  const [rules, setRules] = useState([]);
  const [matchFields, setMatchFields] = useState([]);
  const [matchTypes, setMatchTypes] = useState([]);
  const [knownSkills, setKnownSkills] = useState([]);
  const [savingRules, setSavingRules] = useState(false);

  const [users, setUsers] = useState([]);
  const [agentId, setAgentId] = useState('');
  const [agentSkills, setAgentSkills] = useState([]);
  const [savingAgent, setSavingAgent] = useState(false);
  const [rulesBaseline, setRulesBaseline] = useState('[]');
  const [agentBaseline, setAgentBaseline] = useState('[]');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([skillService.getRules(), teamService.getAvailableUsers()])
      .then(([data, allUsers]) => {
        setRules(data.rules || []);
        setRulesBaseline(JSON.stringify(data.rules || []));
        setMatchFields(data.matchFields || []);
        setMatchTypes(data.matchTypes || []);
        setKnownSkills(data.knownSkills || []);
        setUsers(allUsers || []);
      })
      .catch((err) => toast.error(err?.message || 'Failed to load skills.'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (!agentId) { setAgentSkills([]); return; }
    let live = true;
    skillService.getAgentSkills(agentId).then((s) => { if (live) { setAgentSkills(s || []); setAgentBaseline(JSON.stringify(s || [])); } }).catch(() => live && setAgentSkills([]));
    return () => { live = false; };
  }, [agentId]);

  if (!isOpen) return null;

  const isDirty = JSON.stringify(rules) !== rulesBaseline || (agentId !== '' && JSON.stringify(agentSkills) !== agentBaseline);

  const updateRule = (i, patch) => setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const updateSkill = (i, patch) => setAgentSkills((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const saveRules = async () => {
    setSavingRules(true);
    try {
      const saved = await skillService.replaceRules(rules);
      setRules(saved);
      setRulesBaseline(JSON.stringify(saved));
      const fresh = await skillService.getRules();
      setKnownSkills(fresh.knownSkills || []);
      toast.success('Skill rules saved.');
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Skill rules could not be saved.');
    } finally {
      setSavingRules(false);
    }
  };

  const saveAgent = async () => {
    setSavingAgent(true);
    try {
      const saved = await skillService.replaceAgentSkills(agentId, agentSkills.filter((s) => s.skillName.trim()));
      setAgentSkills(saved);
      setAgentBaseline(JSON.stringify(saved));
      toast.success('Agent skills saved.');
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Agent skills could not be saved.');
    } finally {
      setSavingAgent(false);
    }
  };

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      className="skills-drawer"
      title="Skills"
      subtitle="What a case needs, and who can handle it — used by skill-based assignment"
      ariaLabel="Manage skills"
      footer={({ requestClose }) => (
        <>
          <Button variant="ghost" onClick={requestClose}>Close</Button>
          {tab === 'rules'
            ? <Button variant="primary" isLoading={savingRules} disabled={loading || savingRules} onClick={saveRules}>Save skill rules</Button>
            : <Button variant="primary" isLoading={savingAgent} disabled={!agentId || savingAgent} onClick={saveAgent}>Save agent skills</Button>}
        </>
      )}
    >
        <div className="skills-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'rules'} className={`skills-tab ${tab === 'rules' ? 'skills-tab--active' : ''}`} onClick={() => setTab('rules')}>Skill rules</button>
          <button role="tab" aria-selected={tab === 'agents'} className={`skills-tab ${tab === 'agents' ? 'skills-tab--active' : ''}`} onClick={() => setTab('agents')}>Agent skills</button>
        </div>

        <>
          {loading && <div className="skills-empty">Loading…</div>}

          {!loading && tab === 'rules' && (
            <>
              <p className="skills-help">A case that matches a rule needs that skill. Agents holding it are preferred; if nobody does, work is shared by load.</p>
              <datalist id="known-skills">{knownSkills.map((k) => <option key={k} value={k} />)}</datalist>
              {rules.length === 0 && <div className="skills-empty">No skill rules yet. Skill-based assignment shares work by load until you add some.</div>}
              {rules.map((r, i) => (
                <div key={r.id || `new-${i}`} className="skills-row">
                  <input className="input-field" list="known-skills" placeholder="Skill (e.g. Fraud)" value={r.skillName} onChange={(e) => updateRule(i, { skillName: e.target.value })} aria-label="Skill" />
                  <span className="skills-row__when">when</span>
                  <select className="input-field input-field--select" value={r.matchField} onChange={(e) => updateRule(i, { matchField: e.target.value })} aria-label="Looks at">
                    {matchFields.map((f) => <option key={f} value={f}>{FIELD_LABELS[f] || f}</option>)}
                  </select>
                  <select className="input-field input-field--select" value={r.matchType} onChange={(e) => updateRule(i, { matchType: e.target.value })} aria-label="Match type">
                    {matchTypes.map((t) => <option key={t} value={t}>{t === 'Equals' ? 'is' : 'contains'}</option>)}
                  </select>
                  <input className="input-field" placeholder="value" value={r.matchValue} onChange={(e) => updateRule(i, { matchValue: e.target.value })} aria-label="Value" />
                  <label className="skills-row__active"><input type="checkbox" checked={r.isActive} onChange={(e) => updateRule(i, { isActive: e.target.checked })} /> on</label>
                  <button type="button" className="skills-row__delete" onClick={() => setRules((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove rule"><Trash2 size={14} /></button>
                </div>
              ))}
              <Button variant="ghost" icon={<Plus size={14} />} onClick={() => setRules((prev) => [...prev, { skillName: '', matchField: 'Title', matchType: 'Contains', matchValue: '', isActive: true }])}>
                Add rule
              </Button>
            </>
          )}

          {!loading && tab === 'agents' && (
            <>
              <select className="input-field input-field--select" value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Agent">
                <option value="">Choose an agent…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role || 'Agent'}</option>)}
              </select>
              {agentId && (
                <>
                  <datalist id="known-skills-agent">{knownSkills.map((k) => <option key={k} value={k} />)}</datalist>
                  {agentSkills.length === 0 && <div className="skills-empty">This agent has no skills recorded.</div>}
                  {agentSkills.map((s, i) => (
                    <div key={`${s.skillName}-${i}`} className="skills-row skills-row--agent">
                      <input className="input-field" list="known-skills-agent" placeholder="Skill" value={s.skillName} onChange={(e) => updateSkill(i, { skillName: e.target.value })} aria-label="Skill" />
                      <label className="skills-row__level">Level
                        <select className="input-field input-field--select" value={s.proficiencyLevel} onChange={(e) => updateSkill(i, { proficiencyLevel: Number(e.target.value) })}>
                          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <button type="button" className="skills-row__delete" onClick={() => setAgentSkills((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove skill"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <Button variant="ghost" icon={<Plus size={14} />} onClick={() => setAgentSkills((prev) => [...prev, { skillName: '', proficiencyLevel: 3 }])}>Add skill</Button>
                </>
              )}
            </>
          )}
        </>
    </SideDrawer>
  );
}
