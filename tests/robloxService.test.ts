import test from 'node:test';
import assert from 'node:assert/strict';
import { isAssetModerated, parseNumericIds } from '../src/server/services/robloxService.js';

test('parseNumericIds parses comma, newline, and space separated IDs and deduplicates', () => {
  const input = '123456, 789012\n345678; 123456\n invalid_id 999000';
  assert.deepEqual(parseNumericIds(input), ['123456', '789012', '345678', '999000']);
});

test('parseNumericIds handles array input and empty values', () => {
  assert.deepEqual(parseNumericIds(['111, 222', '333', 'abc', '222']), ['111', '222', '333']);
  assert.deepEqual(parseNumericIds(''), []);
  assert.deepEqual(parseNumericIds(null), []);
});

test('isAssetModerated detects rejected/moderated states accurately', () => {
  assert.equal(isAssetModerated('MODERATION_STATE_REJECTED'), true);
  assert.equal(isAssetModerated('MODERATION_STATE_APPROVED'), false);
  assert.equal(isAssetModerated('MODERATION_STATE_REVIEWING'), false);
  assert.equal(isAssetModerated(null), false);
});
