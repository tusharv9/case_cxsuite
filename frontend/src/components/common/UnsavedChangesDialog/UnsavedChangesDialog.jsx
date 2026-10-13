// ===== UNSAVED CHANGES DIALOG =====
// The one "you have unsaved changes" question, used by every drawer (SideDrawer) and page guard (useUnsavedChangesGuard):
//   Continue editing — close this dialog, nothing is lost
//   Discard changes  — throw the edits away and carry on with what the person asked for (close / leave)
//   Save changes     — offered when the caller can save; on success the caller carries on, on failure the edits stay
// The wording says what is unsaved: configuration settings, or information typed into a form.

import { useState } from 'react';
import { FilePenLine, Save, Trash2 } from 'lucide-react';
import { Modal } from '../Modal/Modal.jsx';
import { Button } from '../Button/Button.jsx';
import { UnsavedChangesSummary } from './UnsavedChangesSummary.jsx';
import './UnsavedChangesDialog.css';

const COPY = {
  configuration: {
    title: 'Unsaved configuration changes',
    message: 'You have changed settings that have not been saved yet.',
    discardNote: 'Discarding restores the last saved configuration.',
  },
  form: {
    title: 'Unsaved changes',
    message: 'You have entered information that has not been saved yet.',
    discardNote: 'Discarding clears what you entered.',
  },
};

/**
 * @param {boolean} props.isOpen
 * @param {'configuration'|'form'} [props.subject='form']  what kind of data is unsaved (sets the wording)
 * @param {string}  [props.itemName]   what is being edited, e.g. "Field: Occupation" or "Team: Loans"
 * @param {string}  [props.message]    overrides the standard sentence
 * @param {() => void} props.onContinue  keep editing
 * @param {() => void} props.onDiscard   throw the edits away and proceed
 * @param {() => (Promise<boolean|void>|boolean|void)} [props.onSave]  save; resolve false (or throw) when saving failed
 * @param {() => void} [props.onSaved]   proceed after a successful save (defaults to nothing: the save itself usually closes)
 * @param {Array}  [props.changes]   what exactly is unsaved (see UnsavedChangesSummary), when the caller can list it
 */
export function UnsavedChangesDialog({ isOpen, subject = 'form', itemName, message, onContinue, onDiscard, onSave, onSaved, changes }) {
  const [isSaving, setIsSaving] = useState(false);
  const copy = COPY[subject] || COPY.form;

  const save = async () => {
    if (!onSave || isSaving) return;
    setIsSaving(true);
    let ok = false;
    try {
      ok = (await onSave()) !== false;
    } catch {
      ok = false;   // the caller shows its own error; the edits are kept
    } finally {
      setIsSaving(false);
    }
    if (ok) onSaved?.();
    else onContinue?.();   // back to the form, with the edits and the error the save reported
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSaving ? () => {} : onContinue}
      title={copy.title}
      size="sm"
      footer={
        <div className="unsaved-dialog__actions">
          <Button variant="ghost" onClick={onContinue} disabled={isSaving} id="btn-unsaved-continue">
            Continue editing
          </Button>
          <Button variant="outline" className="unsaved-dialog__discard" onClick={onDiscard} disabled={isSaving}
            leftIcon={<Trash2 size={14} />} id="btn-unsaved-discard">
            Discard changes
          </Button>
          {onSave && (
            <Button variant="primary" onClick={save} isLoading={isSaving} leftIcon={<Save size={14} />} id="btn-unsaved-save">
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
        </div>
      }
    >
      <div className="unsaved-dialog">
        <div className="unsaved-dialog__icon" aria-hidden="true"><FilePenLine size={20} /></div>
        <div>
          {itemName && <p className="unsaved-dialog__item">{itemName}</p>}
          <p className="unsaved-dialog__message">{message || copy.message}</p>
          <p className="unsaved-dialog__note">{copy.discardNote}</p>
          <UnsavedChangesSummary changes={changes} />
        </div>
      </div>
    </Modal>
  );
}
