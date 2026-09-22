// ===== CASE ATTACHMENTS DRAWER =====

import { useState, useEffect, useRef } from 'react';
import { X, Paperclip, UploadCloud, File, Download, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from '../../common/Modal/Modal.jsx';
import { Button } from '../../common/Button/Button.jsx';
import { useToast } from '../../../hooks/useToast.js';
import { caseService } from '../../../services/caseService.js';
import { formatFullDateTime } from '../../../utils/dateUtils.js';
import './AttachmentsDrawer.css';

export function AttachmentsDrawer({
  isOpen,
  onClose,
  caseId,
  caseData,
  onSuccess,
}) {
  const toast = useToast();
  const activeCaseId = caseId || caseData?.id;
  const fileInputRef = useRef(null);

  const [attachments, setAttachments] = useState([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [note, setNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    if (isOpen && activeCaseId) {
      loadAttachments();
    } else {
      setSelectedFile(null);
      setNote('');
    }
  }, [isOpen, activeCaseId]);

  const loadAttachments = async () => {
    if (!activeCaseId) return;
    setIsLoadingAttachments(true);
    try {
      const data = await caseService.getAttachments(activeCaseId);
      setAttachments(data || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load case attachments.');
    } finally {
      setIsLoadingAttachments(false);
    }
  };

  if (!isOpen || !caseData) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file) => {
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File size cannot exceed 25 MB.');
      return;
    }
    setSelectedFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (note.trim()) {
        formData.append('note', note.trim());
      }

      await caseService.uploadAttachment(activeCaseId, formData);
      toast.success(`Attachment "${selectedFile.name}" uploaded successfully.`);
      setSelectedFile(null);
      setNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadAttachments();
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'Failed to upload attachment.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (attachment) => {
    if (!activeCaseId) return;
    setDownloadingId(attachment.id);
    try {
      await caseService.downloadAttachment(activeCaseId, attachment.id, attachment.fileName);
      toast.success(`Downloading ${attachment.fileName}...`);
    } catch (err) {
      toast.error(err.message || 'Failed to download file.');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Case Attachments"
      subtitle={`${caseData.caseNumber || ''} • ${attachments.length} files`}
      size="lg"
    >
      {/* Upload Form Section */}
        <div className="attachments-drawer__upload-section">
          <p className="drawer-section-label">UPLOAD NEW ATTACHMENT</p>

          <input
            ref={fileInputRef}
            type="file"
            id="case-attachment-input"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {!selectedFile ? (
            <div
              className={`attachments-drawer__dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={32} className="attachments-drawer__dropzone-icon" />
              <p className="attachments-drawer__dropzone-text">
                <strong>Click to browse</strong> or drag &amp; drop file here
              </p>
              <p className="attachments-drawer__dropzone-sub">
                Supports PDF, DOCX, XLSX, TXT, CSV, PNG, JPG (Max 25MB)
              </p>
            </div>
          ) : (
            <div className="attachments-drawer__selected-card">
              <div className="attachments-drawer__selected-info">
                <File size={24} color="#2563eb" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="attachments-drawer__selected-name">{selectedFile.name}</p>
                  <p className="attachments-drawer__selected-size">{formatSize(selectedFile.size)}</p>
                </div>
              </div>
              <button
                className="attachments-drawer__remove-file"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                title="Remove file"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label className="attachments-drawer__note-label" htmlFor="attachment-note-input">
              Attachment Note / Discussion (Optional)
            </label>
            <textarea
              id="attachment-note-input"
              className="attachments-drawer__note-input"
              rows={2}
              placeholder="e.g. Chargeback confirmation reference from payment ops..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button
              variant="primary"
              isLoading={isUploading}
              disabled={!selectedFile}
              leftIcon={<Paperclip size={14} />}
              onClick={handleUpload}
            >
              Upload Attachment
            </Button>
          </div>
        </div>

        {/* Existing Attachments List */}
        <div className="attachments-drawer__list-section scrollbar-thin">
          <p className="drawer-section-label" style={{ marginBottom: 12 }}>
            ATTACHED FILES ({attachments.length})
          </p>

          {isLoadingAttachments ? (
            <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 24 }}>
              Loading attachments...
            </p>
          ) : attachments.length === 0 ? (
            <div className="attachments-drawer__empty-state">
              <FileText size={32} color="#94a3b8" />
              <p style={{ fontSize: 13, fontWeight: 600, color: '#475569', margin: '8px 0 2px' }}>
                No attachments on this case
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                Files uploaded by staff or received via channels will be listed here.
              </p>
            </div>
          ) : (
            <div className="attachments-drawer__items-container">
              {attachments.map((att) => (
                <div key={att.id} className="attachment-card">
                  <div className="attachment-card__top">
                    <div className="attachment-card__icon-box">
                      <File size={20} color="#2563eb" />
                    </div>
                    <div className="attachment-card__meta">
                      <p className="attachment-card__filename" title={att.fileName}>
                        {att.fileName}
                      </p>
                      <p className="attachment-card__sub">
                        {formatSize(att.fileSizeBytes)} · Uploaded by {att.uploadedByUserName || 'Staff'} · {formatFullDateTime(att.createdAt)}
                      </p>
                    </div>
                    <button
                      className="attachment-card__download-btn"
                      title="Download file"
                      disabled={downloadingId === att.id}
                      onClick={() => handleDownload(att)}
                    >
                      <Download size={14} />
                    </button>
                  </div>
                  {att.note && (
                    <div className="attachment-card__note">
                      <strong>Note:</strong> {att.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  );
}
