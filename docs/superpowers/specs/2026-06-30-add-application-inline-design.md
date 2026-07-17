# Add Application Inline — Design Spec

**Feature:** "+" button in the Test Case ID Prefixes accordion (Admin settings) that opens a dialog to create a new application without navigating away.

---

## 1. Architecture & Data Flow

### Button placement
A small MUI `IconButton` with `AddIcon` is added inside the `AccordionSummary` of the Test Case ID Prefixes accordion, between the title/subtitle `Stack` and the expand chevron. Clicking it calls `e.stopPropagation()` (prevents accordion toggle) and opens the dialog.

### New local state (AdminClient.jsx)
- `newAppOpen: boolean` — controls dialog visibility; defaults to `false`
- `newApp: { name: string, prefix: string }` — controlled form values; resets to `{ name: '', prefix: '' }` on open/close

### Auto-derive prefix
The Name field `onChange` handler auto-derives a 3-char uppercase prefix suggestion from the first 3 alphanumeric characters of the name (e.g. `"Practice Admin"` → `"PRA"`). Auto-fill fires only while the prefix field is empty or still matches the most-recently auto-derived value — manual edits are preserved.

### Save flow
1. Call `createApplication({ name, initial: prefix })` from `lib/api/applications.js` → `POST /api/applications`
2. On 201: prepend `{ _id, name, initial }` to `applications` state; add `prefixDrafts[newId] = initial ?? ''`
3. Close dialog; show success toast `"Application created"`
4. On error: show error toast (see Section 3); keep dialog open

**No new API routes or data-layer files required** — `POST /api/applications` and `createApplication` already handle this exactly.

---

## 2. UI Details

### "+" IconButton (in AccordionSummary)
```jsx
<IconButton
  size='small'
  onClick={(e) => { e.stopPropagation(); setNewAppOpen(true); }}
  sx={{ color: 'primary.main', flexShrink: 0 }}
>
  <AddIcon fontSize='small' />
</IconButton>
```
Positioned inside the outer `Stack` of `AccordionSummary`, between the content stack and the expand chevron.

### Dialog
- `Dialog` with `maxWidth='xs'`, `fullWidth`
- Title: `"New Application"`
- Body (`Stack spacing={2}`):
  - **Application Name** — `TextField`, `fullWidth`, `size='small'`, `autoFocus`
  - **Prefix** — `TextField`, `fullWidth`, `size='small'`; input forced uppercase, `maxLength: 3`; validates `/^[A-Z0-9]{3}$/`; helper text `"Exactly 3 letters or digits"` shown on error
- Actions:
  - `Cancel` (outlined) — closes dialog, resets form
  - `Create` (contained, primary) — disabled while name is blank (after trim), prefix is invalid, or save is in-flight; shows `CircularProgress size={14}` spinner during save

---

## 3. Error Handling

| Condition | Toast message | Dialog stays open |
|---|---|---|
| Duplicate prefix (409) | `"Prefix already in use"` | Yes |
| Any other API error | `"Failed to create application"` | Yes |
| Network failure | `"Failed to create application"` | Yes |

Name whitespace-only: `Create` button remains disabled (name is trimmed before the enabled check).

---

## 4. Testing

**File:** `app/api/applications/__tests__/route.test.js` (existing — add cases)

| Case | Input | Expected |
|---|---|---|
| Valid with prefix | `{ name: 'Foo', initial: 'FOO' }` | 201 + created doc |
| Valid without prefix | `{ name: 'Foo' }` | 201 (prefix optional) |
| Empty name | `{ name: '' }` | 400 |
| Invalid prefix format | `{ name: 'Foo', initial: 'fo' }` | 400 |

No UI unit tests — the dialog is a thin state wrapper over existing API client functions; observable behavior is fully covered by the API route tests.

---

## 5. Files Changed

| File | Change |
|---|---|
| `app/(app)/admin/AdminClient.jsx` | Add `newAppOpen`/`newApp` state, `AddIcon` import, `+` IconButton in accordion header, `NewApplicationDialog` inline or extracted component, save handler |
| `app/api/applications/__tests__/route.test.js` | Add 4 POST test cases |
