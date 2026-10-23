import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalProgress } from '../src/comment-knowledge.js';

test('counts only approved unedited YES', () => {
 const rows=[{status:'approved',edited:0},{status:'approved',edited:1},{status:'rejected',edited:0},{status:'emailed',edited:0}];
 assert.deepEqual(approvalProgress(rows),{unedited_yes:1,target:100,eligible:false});
});
test('100 unedited approvals unlock eligibility, never publication', () => {
 const rows=Array.from({length:100},()=>({status:'approved',edited:0}));
 assert.equal(approvalProgress(rows).eligible,true);
 assert.equal(approvalProgress(rows).unedited_yes,100);
});
