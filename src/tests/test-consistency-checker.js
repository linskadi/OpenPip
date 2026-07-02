const { runConsistencyCheck, checkFigureTableContinuity, checkReferenceCompleteness } = require('../engine/quality/consistency-checker');

// Test 1: figure gap detection
const text1 = 'As shown in Figure 1 and Figure 3 in the results.';
const r1 = runConsistencyCheck(text1);
if (r1.issues.length === 0) throw new Error('Should detect Figure 2 gap');
if (!r1.issues[0].includes('Figure 2')) throw new Error(`Wrong issue: ${r1.issues[0]}`);

// Test 2: no issues with continuous numbering and proper references
const text2 = 'As shown in Figure 1, the result is clear. Figure 2 provides additional data. Table 1 summarizes the findings. Table 2 shows detailed comparison. As Figure 1 indicates and Figure 2 confirms, the data in Table 1 and Table 2 are consistent.';
const r2 = runConsistencyCheck(text2);
if (r2.issues.length > 0) throw new Error(`Unexpected issues: ${r2.issues}`);

// Test 3: table gap detection
const text3 = 'Table 1 shows data. Table 3 shows more data.';
const r3 = checkFigureTableContinuity(text3);
if (r3.length === 0) throw new Error('Should detect Table 2 gap');

// Test 4: reference completeness
const text4 = 'Figure 1 is shown above.';
const r4 = checkReferenceCompleteness(text4);
if (r4.length === 0) throw new Error('Figure 1 only appears once, should flag');

// Test 5: empty text
const r5 = runConsistencyCheck('');
if (!r5.pass) throw new Error('Empty text should pass');

console.log('✅ test-consistency-checker passed');
