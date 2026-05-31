'use client';
import AppsIcon from '@mui/icons-material/Apps';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import BugReportIcon from '@mui/icons-material/BugReport';
import CircleIcon from '@mui/icons-material/Circle';
import FolderIcon from '@mui/icons-material/Folder';
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

const FILTER_ICONS = {
  applicationId: <AppsIcon fontSize='small' />,
  moduleId: <FolderIcon fontSize='small' />,
  status: <CircleIcon fontSize='small' />,
  priority: <PriorityHighIcon fontSize='small' />,
  testedBy: <PersonIcon fontSize='small' />,
  assignedTo: <AssignmentIndIcon fontSize='small' />,
  version: <LabelIcon fontSize='small' />,
  jiraStory: <BugReportIcon fontSize='small' />,
};

/** Normalises a raw option (string | { value, label }) to { value, label }. */
function resolveOpt(opt) {
  return { value: opt?.value ?? opt, label: opt?.label ?? opt };
}

/**
 * Returns a keydown handler for a single-select listbox panel.
 *
 * @param {object}          cfg
 * @param {Array}           cfg.items          Visible (filtered) items in the list.
 * @param {number|null}     cfg.activeIndex    Current focused index (null = search input focused).
 * @param {Function}        cfg.setActiveIndex State setter for activeIndex.
 * @param {React.RefObject} cfg.searchInputRef Ref to the panel's search/text input.
 * @param {Function}        cfg.onPick         Called with the item when Enter confirms selection.
 * @param {Function}        cfg.onEscape       Called when Escape is pressed (close or back).
 * @param {Function}        [cfg.isDisabled]   (item) → boolean. Suppresses Enter when true.
 * @param {React.RefObject} cfg.listRef        Ref to the scrollable list container.
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
    // Escape always fires — runs before the empty-list guard below.
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

/**
 * Single focusable row inside a listbox panel.
 *
 * @param {number}          props.idx
 * @param {boolean}         props.active
 * @param {boolean}         [props.disabled=false]
 * @param {Function}        [props.onClick]
 * @param {Function}        props.onFocus  Receives idx when row is focused.
 * @param {React.ReactNode} props.children
 */
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
        px: 2,
        py: 1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        bgcolor: active ? 'action.selected' : 'transparent',
        '&:hover': disabled ? {} : { bgcolor: 'action.hover' },
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
// Holds all state and handlers needed by sub-components, eliminating prop-drilling.
const FilterPopoverContext = createContext(null);
function useFilterPopover() {
  return useContext(FilterPopoverContext);
}

// ── FilterSearchBox ────────────────────────────────────────────────────────────
// Unified search input: size='small' fullWidth TextField in a flexShrink:0 Box.
// sx prop merges over defaults for spacing variants.

/**
 * @param {string}          props.placeholder
 * @param {React.Ref}       props.inputRef
 * @param {string}          props.value
 * @param {Function}        props.onChange
 * @param {string}          props.ariaLabel
 * @param {object}          [props.sx]  Merged over default Box sx.
 */
function FilterSearchBox({
  placeholder,
  inputRef,
  value,
  onChange,
  ariaLabel,
  sx,
}) {
  return (
    <Box sx={{ p: 1, flexShrink: 0, ...sx }}>
      <TextField
        size='small'
        fullWidth
        placeholder={placeholder}
        inputRef={inputRef}
        value={value}
        onChange={onChange}
        slotProps={{ htmlInput: { 'aria-label': ariaLabel } }}
      />
    </Box>
  );
}

// ── FilterPanel ────────────────────────────────────────────────────────────────
// Shared Stack wrapper: flex:1, overflow hidden, keyboard handler.

/**
 * @param {object}          props.keyHandlerConfig  Passed to makeListKeyDownHandler.
 * @param {React.ReactNode} props.children
 */
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
// Sticky header shared by SelectPicker and TextPicker: back button + filter
// icon + label + optional children (SelectPicker injects the search box) + Divider.

/**
 * @param {React.ReactNode} [props.children]  Optional content between title and Divider.
 */
function ValuePickerHeader({ children }) {
  const { pendingFilter, handleBack } = useFilterPopover();
  return (
    <Box sx={{ flexShrink: 0, bgcolor: 'background.paper', zIndex: 1 }}>
      <Stack
        direction='row'
        spacing={0.5}
        sx={{ alignItems: 'center', px: 0.5, py: 0.5 }}
      >
        <IconButton
          size='small'
          onClick={handleBack}
          aria-label='Back to filter list'
        >
          <ArrowBackIcon fontSize='small' />
        </IconButton>
        {FILTER_ICONS[pendingFilter.key]}
        <Typography variant='body2' fontWeight={600}>
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

      <Box
        ref={containerRef}
        role='listbox'
        aria-label='Filter types'
        sx={{ overflowY: 'auto', flex: 1 }}
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
              {FILTER_ICONS[f.key]}
              <Typography component='span'>{f.label}</Typography>
              {alreadyAdded && (
                <Typography
                  component='span'
                  variant='caption'
                  color='text.disabled'
                  sx={{ ml: 'auto' }}
                >
                  added
                </Typography>
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
          sx={{ px: 1, pb: 0.5 }}
        />
      </ValuePickerHeader>

      <Box
        ref={containerRef}
        role='listbox'
        aria-label={`${pendingFilter.label} values`}
        sx={{ overflowY: 'auto', flex: 1 }}
      >
        {filteredValueOptions.length === 0 ? (
          <Box aria-live='polite' sx={{ px: 2, py: 1 }}>
            <Typography variant='body2' color='text.disabled'>
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
                {optLabel}
              </OptionRow>
            );
          })
        )}
      </Box>
    </FilterPanel>
  );
}

// ── TextPicker — step 2b: enter a free-text value ─────────────────────────────
// FilterPanel is still used here so Escape bubbles to handleBack via
// makeListKeyDownHandler (which fires Escape before the empty-items guard).
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

      <Box sx={{ p: 1 }}>
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
            // Escape bubbles to FilterPanel onKeyDown → handleBack
          }}
          slotProps={{
            htmlInput: { 'aria-label': `${pendingFilter.label} value` },
          }}
        />
      </Box>
    </FilterPanel>
  );
}

/**
 * Two-step filter picker rendered inside a MUI Popover (not Menu — Menu's
 * roving-tabindex fights a search TextField and skips the first list item on
 * ArrowDown). All keyboard navigation is custom; MUI owns only positioning.
 *
 * Step 1 (TypePicker)  — searchable list of filter types (Application, Status, …).
 * Step 2a (SelectPicker) — sticky header + value search + scrollable option list.
 * Step 2b (TextPicker)   — sticky header + free-text input.
 *
 * Calls onPick(filterDef, value) only once both type AND value are chosen.
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

  // Panel 1 search input ref
  const searchInputRef = useRef(null);
  // Panel 2 search input ref (also used for text-kind input — mutually exclusive)
  const valueSearchInputRef = useRef(null);
  // Scrollable list ref — shared between pickers (only one renders at a time)
  const containerRef = useRef(null);

  // Focus the active picker's search input whenever the step changes.
  // Step switches happen with no transition so refs are live and focus()
  // lands immediately. Initial-open focus is handled by
  // slotProps.transition.onEntered, which fires after the Grow animation and
  // after MUI Modal's focus trap — guaranteed to win.
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

  // Resets all value-picker state (step 2 state) without touching step 1 state.
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
    // Step 1 (TypePicker)
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
    // Step 2 (SelectPicker / TextPicker)
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
            width: 280,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '50vh',
            overflow: 'hidden',
          },
        },
        // onEntered fires after the Grow animation completes and after MUI
        // Modal's internal focus trap has already run — so this focus() wins.
        // TransitionProps is NOT used: silently ignored in MUI v9 (forwarded
        // as an unknown DOM attribute) and onEntered never fires from it.
        transition: { onEntered: () => searchInputRef.current?.focus() },
      }}
    >
      <FilterPopoverContext.Provider value={ctx}>
        {/* Step 1 → Step 2a → Step 2b: explicit render paths, no hidden conditionals */}
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
