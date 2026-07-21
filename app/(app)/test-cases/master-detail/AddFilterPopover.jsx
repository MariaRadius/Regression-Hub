'use client';
import AppsIcon from '@mui/icons-material/Apps';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import BugReportIcon from '@mui/icons-material/BugReport';
import CircleIcon from '@mui/icons-material/Circle';
import FolderIcon from '@mui/icons-material/Folder';
import KeyIcon from '@mui/icons-material/Key';
import LabelIcon from '@mui/icons-material/Label';
import PersonIcon from '@mui/icons-material/Person';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import {
  Box,
  Divider,
  IconButton,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FILTER_TYPES } from '@/lib/constants';

// Component references (not instances) so we can apply color at render time
const FILTER_ICON_MAP = {
  applicationId: AppsIcon,
  moduleId: FolderIcon,
  status: CircleIcon,
  priority: PriorityHighIcon,
  testedBy: PersonIcon,
  assignedTo: AssignmentIndIcon,
  version: LabelIcon,
  jiraStory: BugReportIcon,
  testKey: KeyIcon,
};

const FILTER_ICON_COLORS = {
  applicationId: '#0d9488',
  moduleId: '#6366f1',
  status: '#8b5cf6',
  priority: '#ef4444',
  testedBy: '#64748b',
  assignedTo: '#3b82f6',
  version: '#0ea5e9',
  jiraStory: '#f59e0b',
  testKey: '#0891b2',
};

function FilterIcon({ filterKey }) {
  const Icon = FILTER_ICON_MAP[filterKey];
  if (!Icon) return null;
  return (
    <Icon
      fontSize='small'
      sx={{
        color: FILTER_ICON_COLORS[filterKey] || 'text.secondary',
        fontSize: 16,
      }}
    />
  );
}

/** Normalises a raw option (string | { value, label }) to { value, label }. */
function resolveOpt(opt) {
  return { value: opt?.value ?? opt, label: opt?.label ?? opt };
}

/**
 * Returns a keydown handler for a single-select listbox panel.
 */
function makeListKeyDownHandler({
  items,
  activeIndex,
  setActiveIndex,
  searchInputRef,
  onPick,
  onEscape,
  isDisabled = () => false,
  listRef,
}) {
  function focusRow(idx) {
    listRef.current?.querySelectorAll('[data-idx]')[idx]?.focus();
  }

  return function handleListKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onEscape();
      return;
    }

    if (items.length === 0) return;

    const lastIdx = items.length - 1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next =
          activeIndex == null ? 0 : Math.min(activeIndex + 1, lastIdx);
        setActiveIndex(next);
        focusRow(next);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (activeIndex == null || activeIndex === 0) {
          setActiveIndex(null);
          searchInputRef.current?.focus();
        } else {
          const prev = activeIndex - 1;
          setActiveIndex(prev);
          focusRow(prev);
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        setActiveIndex(0);
        focusRow(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setActiveIndex(lastIdx);
        focusRow(lastIdx);
        break;
      }
      case 'Enter': {
        if (activeIndex != null) {
          const item = items[activeIndex];
          if (item != null && !isDisabled(item)) onPick(item);
        }
        break;
      }
      default:
        break;
    }
  };
}

function OptionRow({
  idx,
  active,
  disabled = false,
  onClick,
  onFocus,
  children,
}) {
  return (
    <Box
      role='option'
      aria-selected={active}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      data-idx={idx}
      onClick={disabled ? undefined : onClick}
      onFocus={() => onFocus(idx)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.75,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        bgcolor: active ? 'rgba(13,148,136,0.10)' : 'transparent',
        '&:hover': disabled ? {} : { bgcolor: 'rgba(13,148,136,0.06)' },
        outline: 'none',
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        },
      }}
    >
      {children}
    </Box>
  );
}

// ── Shared context ─────────────────────────────────────────────────────────────
const FilterPopoverContext = createContext(null);
function useFilterPopover() {
  return useContext(FilterPopoverContext);
}

// ── FilterSearchBox ────────────────────────────────────────────────────────────
function FilterSearchBox({
  placeholder,
  inputRef,
  value,
  onChange,
  ariaLabel,
  sx,
}) {
  return (
    <Box sx={{ px: 1.5, py: 0.875, flexShrink: 0, ...sx }}>
      <TextField
        size='small'
        fullWidth
        placeholder={placeholder}
        inputRef={inputRef}
        value={value}
        onChange={onChange}
        slotProps={{
          htmlInput: { 'aria-label': ariaLabel },
          input: { sx: { fontSize: '0.825rem' } },
        }}
      />
    </Box>
  );
}

// ── FilterPanel ────────────────────────────────────────────────────────────────
function FilterPanel({ keyHandlerConfig, children }) {
  return (
    <Stack
      sx={{ flex: 1, overflow: 'hidden' }}
      onKeyDown={makeListKeyDownHandler(keyHandlerConfig)}
    >
      {children}
    </Stack>
  );
}

// ── ValuePickerHeader ──────────────────────────────────────────────────────────
function ValuePickerHeader({ children }) {
  const { pendingFilter, handleBack } = useFilterPopover();
  const iconColor = FILTER_ICON_COLORS[pendingFilter.key];

  return (
    <Box sx={{ flexShrink: 0, bgcolor: 'background.paper', zIndex: 1 }}>
      <Stack
        direction='row'
        spacing={0.75}
        sx={{ alignItems: 'center', px: 1, py: 0.875 }}
      >
        <IconButton
          size='small'
          onClick={handleBack}
          aria-label='Back to filter list'
          sx={{ color: 'text.secondary' }}
        >
          <ArrowBackIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 1,
            bgcolor: iconColor ? `${iconColor}18` : 'action.hover',
            flexShrink: 0,
          }}
        >
          <FilterIcon filterKey={pendingFilter.key} />
        </Box>
        <Typography
          variant='body2'
          fontWeight={600}
          sx={{ fontSize: '0.825rem', color: 'text.primary' }}
        >
          {pendingFilter.label}
        </Typography>
      </Stack>
      {children}
      <Divider />
    </Box>
  );
}

// ── TypePicker — step 1: choose a filter type ──────────────────────────────────
function TypePicker() {
  const {
    q,
    setQ,
    filteredTypes,
    activeIndex,
    setActiveIndex,
    searchInputRef,
    containerRef,
    handleClose,
    handlePickType,
    active,
  } = useFilterPopover();

  return (
    <FilterPanel
      keyHandlerConfig={{
        items: filteredTypes,
        activeIndex,
        setActiveIndex,
        searchInputRef,
        onPick: handlePickType,
        onEscape: handleClose,
        isDisabled: (f) => f.key in active,
        listRef: containerRef,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          pt: 1.25,
          pb: 0.25,
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.disabled',
          }}
        >
          Filter by
        </Typography>
      </Box>

      <FilterSearchBox
        placeholder='Search filters…'
        inputRef={searchInputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActiveIndex(null);
        }}
        ariaLabel='Search filter types'
      />

      <Divider />

      <Box
        ref={containerRef}
        role='listbox'
        aria-label='Filter types'
        sx={{ overflowY: 'auto', flex: 1, py: 0.5 }}
      >
        {filteredTypes.map((f, i) => {
          const alreadyAdded = f.key in active;
          return (
            <OptionRow
              key={f.key}
              idx={i}
              active={activeIndex === i}
              disabled={alreadyAdded}
              onClick={() => handlePickType(f)}
              onFocus={setActiveIndex}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: 0.75,
                  bgcolor: FILTER_ICON_COLORS[f.key]
                    ? `${FILTER_ICON_COLORS[f.key]}14`
                    : 'action.hover',
                  flexShrink: 0,
                }}
              >
                <FilterIcon filterKey={f.key} />
              </Box>
              <Typography
                component='span'
                sx={{ fontSize: '0.825rem', flex: 1, color: 'text.primary' }}
              >
                {f.label}
              </Typography>
              {alreadyAdded && (
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.1,
                    borderRadius: 1,
                    bgcolor: 'rgba(13,148,136,0.10)',
                    color: 'primary.main',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    flexShrink: 0,
                  }}
                >
                  active
                </Box>
              )}
            </OptionRow>
          );
        })}
      </Box>
    </FilterPanel>
  );
}

// ── SelectPicker — step 2a: pick a value from a searchable list ────────────────
function SelectPicker() {
  const {
    pendingFilter,
    valueQ,
    setValueQ,
    filteredValueOptions,
    activeValueIndex,
    setActiveValueIndex,
    valueSearchInputRef,
    containerRef,
    handlePickValue,
    handleBack,
  } = useFilterPopover();

  return (
    <FilterPanel
      keyHandlerConfig={{
        items: filteredValueOptions,
        activeIndex: activeValueIndex,
        setActiveIndex: setActiveValueIndex,
        searchInputRef: valueSearchInputRef,
        onPick: (opt) => handlePickValue(resolveOpt(opt).value),
        onEscape: handleBack,
        listRef: containerRef,
      }}
    >
      <ValuePickerHeader>
        <FilterSearchBox
          placeholder={`Search ${pendingFilter.label}…`}
          inputRef={valueSearchInputRef}
          value={valueQ}
          onChange={(e) => {
            setValueQ(e.target.value);
            setActiveValueIndex(null);
          }}
          ariaLabel={`Search ${pendingFilter.label} values`}
          sx={{ pb: 0.5 }}
        />
      </ValuePickerHeader>

      <Box
        ref={containerRef}
        role='listbox'
        aria-label={`${pendingFilter.label} values`}
        sx={{ overflowY: 'auto', flex: 1, py: 0.5 }}
      >
        {filteredValueOptions.length === 0 ? (
          <Box aria-live='polite' sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontSize: '0.825rem', color: 'text.disabled' }}>
              No matches
            </Typography>
          </Box>
        ) : (
          filteredValueOptions.map((opt, i) => {
            const { value: optVal, label: optLabel } = resolveOpt(opt);
            return (
              <OptionRow
                key={optVal}
                idx={i}
                active={activeValueIndex === i}
                onClick={() => handlePickValue(optVal)}
                onFocus={setActiveValueIndex}
              >
                <Typography
                  component='span'
                  sx={{ fontSize: '0.825rem', color: 'text.primary' }}
                >
                  {optLabel}
                </Typography>
              </OptionRow>
            );
          })
        )}
      </Box>
    </FilterPanel>
  );
}

// ── TextPicker — step 2b: enter a free-text value ─────────────────────────────
function TextPicker() {
  const {
    pendingFilter,
    textDraft,
    setTextDraft,
    valueSearchInputRef,
    handlePickValue,
    handleBack,
  } = useFilterPopover();

  return (
    <FilterPanel
      keyHandlerConfig={{
        items: [],
        activeIndex: null,
        setActiveIndex: () => {},
        searchInputRef: valueSearchInputRef,
        onPick: () => {},
        onEscape: handleBack,
        listRef: { current: null },
      }}
    >
      <ValuePickerHeader />

      <Box sx={{ p: 1.5 }}>
        <TextField
          size='small'
          fullWidth
          placeholder={
            pendingFilter.placeholder ?? `Enter ${pendingFilter.label}…`
          }
          inputRef={valueSearchInputRef}
          value={textDraft}
          onChange={(e) => setTextDraft(e.target.value)}
          helperText='Press Enter to apply'
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              handlePickValue(textDraft.trim());
            }
          }}
          slotProps={{
            htmlInput: { 'aria-label': `${pendingFilter.label} value` },
            input: { sx: { fontSize: '0.825rem' } },
          }}
        />
      </Box>
    </FilterPanel>
  );
}

/**
 * Two-step filter picker rendered inside a MUI Popover.
 *
 * Step 1 (TypePicker)    — searchable list of filter types.
 * Step 2a (SelectPicker) — sticky header + value search + scrollable option list.
 * Step 2b (TextPicker)   — sticky header + free-text input.
 *
 * @param {Element|null} props.anchorEl
 * @param {boolean}      props.open
 * @param {Function}     props.onClose
 * @param {object}       props.active     Current active filters map
 * @param {Function}     props.onPick     (filterDef, value) → void
 * @param {Function}     props.getOptions (filterDef) → Array<string | { value, label }>
 */
export default function AddFilterPopover({
  anchorEl,
  open,
  onClose,
  active,
  onPick,
  getOptions,
}) {
  const [q, setQ] = useState('');
  const [pendingFilter, setPendingFilter] = useState(null);
  const [activeIndex, setActiveIndex] = useState(null);
  const [valueQ, setValueQ] = useState('');
  const [activeValueIndex, setActiveValueIndex] = useState(null);
  const [textDraft, setTextDraft] = useState('');

  const searchInputRef = useRef(null);
  const valueSearchInputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!pendingFilter) {
      searchInputRef.current?.focus();
    } else {
      valueSearchInputRef.current?.focus();
    }
  }, [pendingFilter]);

  const filteredTypes = useMemo(
    () =>
      FILTER_TYPES.filter((f) =>
        f.label.toLowerCase().includes(q.toLowerCase()),
      ),
    [q],
  );

  function resetValueState() {
    setValueQ('');
    setActiveValueIndex(null);
    setTextDraft('');
  }

  function handleClose() {
    setQ('');
    setPendingFilter(null);
    setActiveIndex(null);
    resetValueState();
    onClose();
  }

  function handlePickType(f) {
    setPendingFilter(f);
    setActiveIndex(null);
    resetValueState();
  }

  function handlePickValue(value) {
    if (value == null || value === '') return;
    onPick(pendingFilter, value);
    handleClose();
  }

  function handleBack() {
    setPendingFilter(null);
    setActiveIndex(null);
    resetValueState();
  }

  const valueOptions = pendingFilter ? (getOptions(pendingFilter) ?? []) : [];

  const filteredValueOptions = valueQ.trim()
    ? valueOptions.filter((opt) =>
        (opt?.label ?? opt)
          .toString()
          .toLowerCase()
          .includes(valueQ.toLowerCase()),
      )
    : valueOptions;

  const ctx = {
    q,
    setQ,
    filteredTypes,
    activeIndex,
    setActiveIndex,
    searchInputRef,
    containerRef,
    handleClose,
    handlePickType,
    active,
    pendingFilter,
    valueQ,
    setValueQ,
    filteredValueOptions,
    activeValueIndex,
    setActiveValueIndex,
    valueSearchInputRef,
    textDraft,
    setTextDraft,
    handlePickValue,
    handleBack,
  };

  return (
    <Popover
      anchorEl={anchorEl}
      open={open}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            width: 296,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '50vh',
            overflow: 'hidden',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow:
              '0 8px 30px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06)',
          },
        },
        transition: { onEntered: () => searchInputRef.current?.focus() },
      }}
    >
      <FilterPopoverContext.Provider value={ctx}>
        {!pendingFilter ? (
          <TypePicker />
        ) : pendingFilter.kind === 'select' ? (
          <SelectPicker />
        ) : (
          <TextPicker />
        )}
      </FilterPopoverContext.Provider>
    </Popover>
  );
}
