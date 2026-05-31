import BulkEditModal from './BulkEditModal';
import BulkFailModal from './BulkFailModal';
import BulkPassModal from './BulkPassModal';
import BulkPendingModal from './BulkPendingModal';
import BulkReassignModal from './BulkReassignModal';

const MODAL_MAP = {
  pass: BulkPassModal,
  fail: BulkFailModal,
  pending: BulkPendingModal,
  reassign: BulkReassignModal,
  edit: BulkEditModal,
};

/**
 * Renders the active bulk-action modal (pass / fail / pending / reassign / edit).
 * Returns null when no modal is open.
 *
 * When singleActionId is set the selection is scoped to that one case, sourced
 * from singleActionCase (the drawer's own copy) rather than re-scanning `cases`.
 * This keeps the selection intact even when the case falls out of the current
 * filter after a prior status change.
 *
 * @see app/(app)/test-cases/TestCasesClient.jsx
 */
export default function BulkModalRenderer({
  openModal,
  cases,
  selectedIds,
  singleActionId,
  singleActionCase,
  user,
  applications,
  modules,
  onClose,
  onSuccess,
}) {
  if (!openModal) return null;

  const Modal = MODAL_MAP[openModal];

  const toSelItem = (c) => ({
    _id: c._id,
    testCaseId: c.testCaseId,
    testCase: c.testCase,
    status: c.status,
  });

  const selArr = singleActionId
    ? singleActionCase
      ? [toSelItem(singleActionCase)]
      : []
    : cases.filter((c) => selectedIds.has(c._id)).map(toSelItem);

  return (
    <Modal
      open
      onClose={onClose}
      selection={selArr}
      user={user}
      applications={applications}
      modules={modules}
      onSuccess={onSuccess}
    />
  );
}
