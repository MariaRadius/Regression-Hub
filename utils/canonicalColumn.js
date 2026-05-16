export function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[\s/_-]+/g, '').replace(/[^a-z0-9]/g, '');
}

export function canonicalColumn(header) {
  const key = normalizeHeader(header);
  const map = {
    type: 'Type',
    application: 'Application', app: 'Application',
    platform: 'Application', platformapplication: 'Application',
    module: 'Module', modulename: 'Module',
    traceability: 'Traceability',
    testcaseid: 'Test Case ID', testid: 'Test Case ID', tcid: 'Test Case ID',
    testcase: 'Test Case', testcasename: 'Test Case',
    preconditions: 'Preconditions',
    steps: 'Steps', teststeps: 'Steps',
    expectedresult: 'Expected Result', expected: 'Expected Result',
    actualresult: 'Actual Result', actual: 'Actual Result',
    status: 'Status',
    defectsimprovements: 'Defects/Improvements',
    defects: 'Defects/Improvements', improvements: 'Defects/Improvements',
    testedby: 'Tested By', tester: 'Tested By',
    testedon: 'Tested On', testdate: 'Tested On', date: 'Tested On',
    softwareversiontested: 'Software Version Tested',
    version: 'Software Version Tested',
  };
  return map[key] || header;
}
