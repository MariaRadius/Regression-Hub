import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  CASCADE_CATEGORIES,
  PER_CASE_CATEGORIES,
  STATUS,
  statusToAction,
} from '@/lib/constants';

describe('AUDIT_CATEGORY', () => {
  it('covers the full 9-category taxonomy', () => {
    expect(AUDIT_CATEGORY).toEqual({
      RESULT: 'result',
      TEST_CASE: 'test_case',
      ASSIGNMENT: 'assignment',
      IMPORT: 'import',
      RELEASE: 'release',
      AUTH: 'auth',
      USER: 'user',
      EXPORT: 'export',
      CONFIG: 'config',
    });
  });
});

describe('AUDIT_ACTION', () => {
  it('keeps the existing result/assignment action values', () => {
    expect(AUDIT_ACTION.PASS).toBe('pass');
    expect(AUDIT_ACTION.FAIL).toBe('fail');
    expect(AUDIT_ACTION.RESET).toBe('reset');
    expect(AUDIT_ACTION.ASSIGN).toBe('assign');
  });

  it('adds the new action values', () => {
    expect(AUDIT_ACTION.CREATE).toBe('create');
    expect(AUDIT_ACTION.EDIT).toBe('edit');
    expect(AUDIT_ACTION.UPDATE).toBe('update');
    expect(AUDIT_ACTION.DELETE).toBe('delete');
    expect(AUDIT_ACTION.IMPORT).toBe('import');
    expect(AUDIT_ACTION.ARCHIVE).toBe('archive');
    expect(AUDIT_ACTION.UNARCHIVE).toBe('unarchive');
    expect(AUDIT_ACTION.CLONE).toBe('clone');
    expect(AUDIT_ACTION.ADD_ENVIRONMENT).toBe('add-environment');
    expect(AUDIT_ACTION.REMOVE_ENVIRONMENT).toBe('remove-environment');
    expect(AUDIT_ACTION.LOGIN).toBe('login');
    expect(AUDIT_ACTION.LOGOUT).toBe('logout');
    expect(AUDIT_ACTION.ROLE_CHANGE).toBe('role-change');
    expect(AUDIT_ACTION.PASSWORD_CHANGE).toBe('password-change');
    expect(AUDIT_ACTION.ACTIVATE).toBe('activate');
    expect(AUDIT_ACTION.DEACTIVATE).toBe('deactivate');
    expect(AUDIT_ACTION.EXPORT_EXCEL).toBe('excel');
    expect(AUDIT_ACTION.EXPORT_PDF).toBe('pdf');
    expect(AUDIT_ACTION.MODULE_CREATE).toBe('module-create');
    expect(AUDIT_ACTION.RESET_DATA).toBe('reset-data');
  });

  it('has exactly the expected action keys (no silent additions)', () => {
    expect(AUDIT_ACTION).toEqual({
      PASS: 'pass',
      FAIL: 'fail',
      RESET: 'reset',
      CREATE: 'create',
      EDIT: 'edit',
      UPDATE: 'update',
      DELETE: 'delete',
      ASSIGN: 'assign',
      IMPORT: 'import',
      ARCHIVE: 'archive',
      UNARCHIVE: 'unarchive',
      CLONE: 'clone',
      ADD_ENVIRONMENT: 'add-environment',
      REMOVE_ENVIRONMENT: 'remove-environment',
      LOGIN: 'login',
      LOGOUT: 'logout',
      ROLE_CHANGE: 'role-change',
      PASSWORD_CHANGE: 'password-change',
      ACTIVATE: 'activate',
      DEACTIVATE: 'deactivate',
      EXPORT_EXCEL: 'excel',
      EXPORT_PDF: 'pdf',
      MODULE_CREATE: 'module-create',
      RESET_DATA: 'reset-data',
    });
  });
});

describe('statusToAction (unchanged behavior)', () => {
  it('maps STATUS values to result actions', () => {
    expect(statusToAction(STATUS.PASS)).toBe(AUDIT_ACTION.PASS);
    expect(statusToAction(STATUS.FAIL)).toBe(AUDIT_ACTION.FAIL);
    expect(statusToAction(STATUS.PENDING)).toBe(AUDIT_ACTION.RESET);
  });
});

describe('category classification lists', () => {
  it('PER_CASE_CATEGORIES are exactly the tcId-bearing categories', () => {
    expect(PER_CASE_CATEGORIES).toEqual([
      AUDIT_CATEGORY.RESULT,
      AUDIT_CATEGORY.TEST_CASE,
      AUDIT_CATEGORY.ASSIGNMENT,
      AUDIT_CATEGORY.IMPORT,
    ]);
  });

  it('CASCADE_CATEGORIES add RELEASE to the per-case set', () => {
    expect(CASCADE_CATEGORIES).toEqual([
      AUDIT_CATEGORY.RESULT,
      AUDIT_CATEGORY.TEST_CASE,
      AUDIT_CATEGORY.ASSIGNMENT,
      AUDIT_CATEGORY.IMPORT,
      AUDIT_CATEGORY.RELEASE,
    ]);
  });

  it('never-purge categories are excluded from CASCADE_CATEGORIES', () => {
    for (const c of [
      AUDIT_CATEGORY.AUTH,
      AUDIT_CATEGORY.USER,
      AUDIT_CATEGORY.EXPORT,
      AUDIT_CATEGORY.CONFIG,
    ]) {
      expect(CASCADE_CATEGORIES).not.toContain(c);
    }
  });
});
