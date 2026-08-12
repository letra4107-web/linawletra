import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { computeTranscriptScore } from '../services/pronunciationScoring.js';

describe('pronunciation scoring', () => {
  test('exact match -> 100', () => {
    const s = computeTranscriptScore('salita', 'salita');
    assert.equal(s, 100);
  });

  test('single-letter substitution drops but remains >50', () => {
    const s = computeTranscriptScore('kuto', 'kuko');
    assert.ok(s < 100, 'should be less than 100');
    assert.ok(s > 50, `score ${s} should remain reasonably high`);
  });

  test('transposed adjacent letters produces score < 80', () => {
    const expected = 'bata';
    const transposed = 'btaa'; // severe transposition
    const s = computeTranscriptScore(expected, transposed);
    assert.ok(s < 80, `transposed score ${s} should be < 80`);
  });

  test('prefix mismatch applies penalty compared to equivalent interior mismatch', () => {
    const expected = 'pagbasa';
    const prefixMismatch = 'magbasa'; // p -> m at start
    const interiorMismatch = 'pagmasa'; // b -> m in middle
    const sPrefix = computeTranscriptScore(expected, prefixMismatch);
    const sInterior = computeTranscriptScore(expected, interiorMismatch);
    assert.ok(sPrefix < sInterior, `prefix-penalized ${sPrefix} should be less than interior ${sInterior}`);
  });

  test('empty transcript vs non-empty expected -> 0', () => {
    const s = computeTranscriptScore('mabuhay', '');
    assert.equal(s, 0);
  });

  test('case-insensitivity and diacritic stripping', () => {
    const a = computeTranscriptScore('SALITA', 'salita');
    const b = computeTranscriptScore('níño', 'nino');
    assert.equal(a, 100);
    assert.equal(b, 100);
  });
});
