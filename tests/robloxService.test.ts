import test from 'node:test';
import assert from 'node:assert/strict';
import { isAssetModerated, matchesScanDateFilter, parseNumericIds } from '../src/server/services/robloxService.js';

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

test('matchesScanDateFilter filters by exact date, month/year, and timezone offset', () => {
  const utcCreateTime = '2026-11-28T18:30:00Z';

  assert.equal(matchesScanDateFilter(utcCreateTime, { mode: 'all' }), true);
  assert.equal(matchesScanDateFilter(utcCreateTime, { mode: 'date', date: '2026-11-28', tzOffsetMinutes: 0 }), true);
  // In UTC+7 (tzOffsetMinutes = -420), 18:30Z on Nov 28 is 01:30 on Nov 29
  assert.equal(matchesScanDateFilter(utcCreateTime, { mode: 'date', date: '2026-11-29', tzOffsetMinutes: -420 }), true);
  assert.equal(matchesScanDateFilter(utcCreateTime, { mode: 'date', date: '2026-11-28', tzOffsetMinutes: -420 }), false);

  assert.equal(matchesScanDateFilter(utcCreateTime, { mode: 'month', month: '2026-11', tzOffsetMinutes: -420 }), true);
  assert.equal(matchesScanDateFilter(utcCreateTime, { mode: 'month', month: '2026-10', tzOffsetMinutes: -420 }), false);
  assert.equal(matchesScanDateFilter(undefined, { mode: 'date', date: '2026-11-28' }), false);
});
