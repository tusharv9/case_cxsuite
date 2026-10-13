// ===== FORM INPUT COMPONENTS =====

import React, { useState, useRef, useEffect, useMemo, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X, Loader2, AlertCircle } from 'lucide-react';
import './Input.css';

export function FormGroup({ label, required, error, helperText, children, htmlFor, labelId, errorId }) {
  return (
    <div className="form-group">
      {label && (
        <label
          id={labelId}
          className={`form-label${required ? ' form-label--required' : ''}`}
          htmlFor={htmlFor}
        >
          {label}
        </label>
      )}
      {children}
      {error && <span className="form-error" id={errorId}>{error}</span>}
      {helperText && !error && <div className="form-helper-text">{helperText}</div>}
    </div>
  );
}

export function Input({ id, label, required, error, helperText, className = '', ...rest }) {
  const autoId = useId();
  const inputId = id || `input-${autoId}`;
  const inputClasses = `form-input ${error ? 'form-input--error field-error' : ''} ${className}`.trim();
  if (label) {
    return (
      <FormGroup label={label} required={required} error={error} helperText={helperText} htmlFor={inputId}>
        <input id={inputId} className={inputClasses} {...rest} />
      </FormGroup>
    );
  }
  return <input id={inputId} className={inputClasses} {...rest} />;
}

export function Textarea({ id, label, required, error, rows = 4, className = '', ...rest }) {
  const autoId = useId();
  const inputId = id || `textarea-${autoId}`;
  const textareaClasses = `form-textarea ${error ? 'form-input--error field-error' : ''} ${className}`.trim();
  if (label) {
    return (
      <FormGroup label={label} required={required} error={error} htmlFor={inputId}>
        <textarea id={inputId} className={textareaClasses} rows={rows} {...rest} />
      </FormGroup>
    );
  }
  return <textarea id={inputId} className={textareaClasses} rows={rows} {...rest} />;
}

export function Select({
  id,
  label,
  required,
  error,
  helperText,
  children,
  options: optionsProp,
  className = '',
  value,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Type to search…',
  disabled = false,
  clearable = false,
  isLoading = false,
  emptyText = 'No matching options',
  loadError = null,        // the options could not be loaded: shown in the list (with Retry when onRetry is given)
  onRetry,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || `select-${autoId}`;
  const labelId = `${inputId}-label`;
  const errorId = `${inputId}-error`;
  const listboxId = `${inputId}-listbox`;
  const optionId = (index) => `${inputId}-option-${index}`;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchInputRef = useRef(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = 220;

    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const computedWidth = Math.max(rect.width, 160);
    let computedLeft = rect.left;
    if (computedLeft + computedWidth > viewportWidth - 8) {
      computedLeft = viewportWidth - computedWidth - 8;
    }
    if (computedLeft < 8) computedLeft = 8;

    const style = {
      position: 'fixed',
      left: `${computedLeft}px`,
      width: `${computedWidth}px`,
      zIndex: 10000,
    };

    if (openUpward) {
      const availAbove = Math.max(100, spaceAbove - 12);
      style.bottom = `${viewportHeight - rect.top + 4}px`;
      style.maxHeight = `${Math.min(220, availAbove)}px`;
    } else {
      const availBelow = Math.max(100, spaceBelow - 12);
      style.top = `${rect.bottom + 4}px`;
      style.maxHeight = `${Math.min(220, availBelow)}px`;
    }

    setCoords(style);
  }, []);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
    }
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      calculatePosition();
    };

    const handleClickOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setSearchQuery('');
        rest.onBlur?.(e);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Close only the list: a drawer around this select must not also close on the same keystroke.
        e.stopPropagation();
        setIsOpen(false);
        setSearchQuery('');
        triggerRef.current?.focus();
      } else if (e.key === 'Tab') {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown, true);   // capture: runs before the drawer's own Escape handler

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const options = useMemo(() => {
    if (Array.isArray(optionsProp)) {
      return optionsProp.map((opt) => {
        if (typeof opt === 'object' && opt !== null) {
          return {
            value: opt.value !== undefined ? opt.value : opt.id,
            label: opt.label !== undefined ? opt.label : opt.name || String(opt.value),
            disabled: opt.disabled,
            searchText: opt.searchText,
          };
        }
        return { value: opt, label: String(opt) };
      });
    }
    const opts = [];
    React.Children.forEach(children, (child) => {
      if (child && child.type === 'option') {
        opts.push({
          value: child.props.value,
          label: child.props.children,
          disabled: child.props.disabled,
          // Extra text the search also matches (e.g. a country's ISO code and dial code).
          searchText: child.props.searchText,
        });
      }
    });
    return opts;
  }, [children, optionsProp]);

  const selectedOption = options.find((o) => String(o.value) === String(value)) || null;
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.trim().toLowerCase();
    return options.filter((o) => `${o.label} ${o.value} ${o.searchText ?? ''}`.toLowerCase().includes(q));
  }, [options, searchQuery]);

  // The highlighted row follows what the search leaves on screen; the chosen option starts highlighted.
  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = filteredOptions.findIndex((o) => String(o.value) === String(value));
    setHighlighted(searchQuery.trim() ? 0 : Math.max(0, selectedIndex));
  }, [isOpen, searchQuery, filteredOptions, value]);

  useEffect(() => {
    if (!isOpen || !popoverRef.current) return;
    popoverRef.current.querySelector('[data-highlighted="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted, isOpen, coords]);

  const handleSelect = (val) => {
    if (disabled) return;
    onChange?.({ target: { value: val } });
    setIsOpen(false);
    setSearchQuery('');
  };

  const selectMarkup = (
    <div className={`custom-select-container ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <div
        ref={triggerRef}
        className={`form-select custom-select-trigger ${error ? 'form-input--error field-error' : ''} ${className} ${disabled ? 'disabled' : ''}`.trim()}
        onClick={(e) => {
          // Inside a <label>, the label would re-dispatch this click and close the list again.
          e.preventDefault();
          if (!disabled) setIsOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (!isOpen) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              setIsOpen(true);
            }
            return;
          }
          // Open: arrows move, Enter picks, Escape closes (typing goes to the search box).
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => Math.min(filteredOptions.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => Math.max(0, h - 1));
          } else if (e.key === 'Home' && !searchQuery) {
            e.preventDefault();
            setHighlighted(0);
          } else if (e.key === 'End' && !searchQuery) {
            e.preventDefault();
            setHighlighted(Math.max(0, filteredOptions.length - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const opt = filteredOptions[highlighted];
            if (opt && !opt.disabled) handleSelect(opt.value);
          }
        }}
        onBlur={(e) => {
          if (!isOpen && !triggerRef.current?.contains(e.relatedTarget)) {
            rest.onBlur?.(e);
          }
        }}
        id={inputId}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen && filteredOptions[highlighted] ? optionId(highlighted) : undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : rest['aria-label'] || placeholder}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-disabled={disabled}
      >
        {isOpen ? (
          <input
            ref={searchInputRef}
            type="text"
            className="custom-select-search-inline"
            placeholder={searchPlaceholder}
            aria-label={`Search ${label || rest['aria-label'] || 'options'}`}
            aria-controls={listboxId}
            aria-autocomplete="list"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={!selectedOption ? 'custom-select-placeholder' : ''}>{displayLabel}</span>
        )}
        <div className="custom-select-actions">
          {clearable && !disabled && value !== undefined && value !== '' && value !== null && (
            <button
              type="button"
              className="custom-select-clear-btn"
              onClick={(e) => {
                e.stopPropagation();
                onChange?.({ target: { value: '' } });
              }}
              aria-label="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          {isLoading ? (
            <Loader2 size={14} className="custom-select-spinner" />
          ) : (
            <ChevronDown size={14} className="custom-select-arrow" />
          )}
        </div>
      </div>

      {isOpen && coords && createPortal(
        <div
          ref={popoverRef}
          id={listboxId}
          className="custom-select-options scrollbar-thin"
          style={coords}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
        >
          {loadError ? (
            <div className="custom-select-empty custom-select-error" role="alert">
              <AlertCircle size={14} />
              <span>{loadError}</span>
              {onRetry && (
                <button type="button" className="custom-select-retry" onClick={(e) => { e.stopPropagation(); onRetry(); }}>
                  Retry
                </button>
              )}
            </div>
          ) : isLoading && filteredOptions.length === 0 ? (
            <div className="custom-select-empty">
              <Loader2 size={14} className="custom-select-spinner" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }} />
              Loading...
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="custom-select-empty">{emptyText}</div>
          ) : (
            filteredOptions.map((opt, index) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={opt.value}
                  id={optionId(index)}
                  aria-disabled={opt.disabled || undefined}
                  className={`custom-select-option ${isSelected ? 'is-selected' : ''} ${opt.disabled ? 'is-disabled' : ''} ${index === highlighted ? 'is-highlighted' : ''}`}
                  data-highlighted={index === highlighted ? 'true' : undefined}
                  onMouseEnter={() => setHighlighted(index)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    if (!opt.disabled) handleSelect(opt.value);
                  }}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check size={14} className="custom-select-check" />}
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );

  if (label) {
    return (
      <FormGroup label={label} required={required} error={error} helperText={helperText} labelId={labelId} errorId={errorId}>
        {selectMarkup}
      </FormGroup>
    );
  }
  return selectMarkup;
}

export function Checkbox({ id, label, className = '', ...rest }) {
  const autoId = useId();
  const inputId = id || `checkbox-${autoId}`;
  return (
    <label className={`form-checkbox-wrapper ${className}`} htmlFor={inputId}>
      <input type="checkbox" id={inputId} className="form-checkbox" {...rest} />
      {label && <span className="form-checkbox-label">{label}</span>}
    </label>
  );
}
