import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestCaseRow from '../TestCaseRow';

vi.mock('@/components/RichTextDisplay', () => ({
  default: ({ value }) => <span data-testid='rtd'>{value}</span>,
}));

const mockTc = {
  _id: 'tc1',
  applicationName: 'MyApp',
  moduleName: 'Auth',
  priority: 'High',
  type: 'Functional',
  jiraStory: 'RXR-100',
  traceability: 'TR-1',
  testCaseId: 'TC-001',
  testCase: 'Login with valid credentials',
  preconditions: 'User exists',
  steps: '1. Navigate to login',
  expectedResult: 'Redirect to dashboard',
  notes: '',
  status: 'Pass',
  testedBy: '',
  testedOn: null,
  softwareVersionTested: '',
};

const defaultProps = {
  tc: mockTc,
  rowNum: 1,
  saving: false,
  onSave: vi.fn(),
  onEdit: vi.fn(),
  selected: false,
  onToggle: vi.fn(),
  qaUsers: ['Alice', 'Bob'],
};

const renderRow = (props = {}) =>
  render(
    <table>
      <tbody>
        <TestCaseRow {...defaultProps} {...props} />
      </tbody>
    </table>,
  );

describe('TestCaseRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders row number', () => {
    renderRow({ rowNum: 3 });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders applicationName and moduleName', () => {
    renderRow();
    expect(screen.getByText('MyApp')).toBeInTheDocument();
    expect(screen.getByText('Auth')).toBeInTheDocument();
  });

  it('checkbox reflects selected=true', () => {
    renderRow({ selected: true });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('checkbox reflects selected=false', () => {
    renderRow({ selected: false });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('onToggle called on checkbox change', () => {
    const onToggle = vi.fn();
    renderRow({ onToggle });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('priority select shows initial value from tc.priority', () => {
    renderRow({ tc: { ...mockTc, priority: 'High' } });
    // MUI Select renders the selected value as visible text
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('priority change calls onSave with new value', () => {
    const onSave = vi.fn();
    renderRow({ onSave });
    // MUI v9 Select renders a text input whose value mirrors the selected option;
    // slotProps.htmlInput does not surface data-testid in JSDOM, so find by display value
    const priorityInput = screen.getByDisplayValue('High');
    fireEvent.change(priorityInput, { target: { value: 'Low' } });
    expect(onSave).toHaveBeenCalledWith('tc1', 'priority', 'Low');
  });

  it('status select shows initial value from tc.status', () => {
    renderRow({ tc: { ...mockTc, status: 'Pass' } });
    expect(screen.getByText('Pass')).toBeInTheDocument();
  });

  it('status change calls onSave with new value', () => {
    const onSave = vi.fn();
    renderRow({ onSave });
    // MUI v9 Select renders a text input whose value mirrors the selected option;
    // slotProps.htmlInput does not surface data-testid in JSDOM, so find by display value
    const statusInput = screen.getByDisplayValue('Pass');
    fireEvent.change(statusInput, { target: { value: 'Fail' } });
    expect(onSave).toHaveBeenCalledWith('tc1', 'status', 'Fail');
  });

  it('jiraStory blur calls onSave only when value changed', () => {
    const onSave = vi.fn();
    renderRow({ onSave, tc: { ...mockTc, jiraStory: 'RXR-100' } });
    const jiraInput = screen.getByDisplayValue('RXR-100');
    // Change then blur — should call onSave
    fireEvent.change(jiraInput, { target: { value: 'RXR-999' } });
    fireEvent.blur(jiraInput);
    expect(onSave).toHaveBeenCalledWith('tc1', 'jiraStory', 'RXR-999');
  });

  it('jiraStory blur does NOT call onSave when value unchanged', () => {
    const onSave = vi.fn();
    renderRow({ onSave, tc: { ...mockTc, jiraStory: 'RXR-100' } });
    const jiraInput = screen.getByDisplayValue('RXR-100');
    // Blur without changing value
    fireEvent.blur(jiraInput);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('edit button calls onEdit with tc', () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    const editBtn = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(mockTc);
  });

  it('saving=true reduces opacity to 0.7 on the row', () => {
    renderRow({ saving: true });
    const row = screen.getByRole('row');
    expect(row).toHaveStyle({ opacity: '0.7' });
  });

  it('normalizedStatus handles non-normalized status — invalid value maps to Pending', () => {
    // normalizedStatus maps any non-Pass/Fail value → STATUS.PENDING ('Pending')
    // MUI v9 Select renders a text input mirroring the current value prop
    renderRow({ tc: { ...mockTc, status: 'invalid-status' } });
    const statusInput = screen.getByDisplayValue('Pending');
    expect(statusInput.value).toBe('Pending');
  });

  it('notes inline edit: initial value shown from tc.notes', () => {
    renderRow({ tc: { ...mockTc, notes: 'some note text' } });
    expect(screen.getByDisplayValue('some note text')).toBeInTheDocument();
  });

  it('notes blur calls onSave only when value changed', () => {
    const onSave = vi.fn();
    renderRow({ onSave, tc: { ...mockTc, notes: 'original' } });
    const notesInput = screen.getByDisplayValue('original');
    fireEvent.change(notesInput, { target: { value: 'updated' } });
    fireEvent.blur(notesInput);
    expect(onSave).toHaveBeenCalledWith('tc1', 'notes', 'updated');
  });

  it('notes blur does NOT call onSave when value unchanged', () => {
    const onSave = vi.fn();
    renderRow({ onSave, tc: { ...mockTc, notes: 'unchanged' } });
    const notesInput = screen.getByDisplayValue('unchanged');
    fireEvent.blur(notesInput);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not render an actualResult or defectsImprovements input', () => {
    renderRow({
      tc: { ...mockTc, actualResult: 'old', defectsImprovements: 'old' },
    });
    // Neither legacy field should appear as an editable input
    expect(screen.queryByDisplayValue('old')).not.toBeInTheDocument();
  });
});
