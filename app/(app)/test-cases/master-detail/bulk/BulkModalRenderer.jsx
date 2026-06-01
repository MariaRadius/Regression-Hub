import BulkFailModal from './BulkFailModal';
import BulkPassModal from './BulkPassModal';
import BulkPendingModal from './BulkPendingModal';
import BulkReassignModal from './BulkReassignModal';

const MODAL_MAP = {
  pass: BulkPassModal,
  fail: BulkFailModal,
  pending: BulkPendingModal,
  reassign: BulkReassignModal,
};

/**
 * Renders the active bulk-action modal (pass / fail / pending / reassign).
 * Returns null when no modal is open.
 *
 * Selection is keyed by `caseId` for the new results model.
 * Pass/Fail/Pending modals receive `releaseId` and `environment` from the
 * active working context so they can target the correct result row.
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
  releaseId,
  environment,
  applications,
  modules,
  onClose,
  onSuccess,
}) {
  if (!openModal) return null;

  const Modal = MODAL_MAP[openModal];

  const toSelItem = (c) => ({
    _id: c._id,
    caseId: c.caseId,
    testKey: c.testKey,
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
      releaseId={releaseId}
      environment={environment}
      applications={applications}
      modules={modules}
      onSuccess={onSuccess}
    />
  );
}
