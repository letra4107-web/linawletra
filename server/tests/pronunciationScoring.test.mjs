import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { computeTranscriptScore } from '../services/pronunciationScoring.js';
import { compareReadingText } from '../services/readingAccuracy.js';

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
  test('short Tagalog vowel i accepts Web Speech I/ee transcripts', () => {
    assert.equal(compareReadingText('i', 'I').accuracyScore, 100);
    assert.equal(compareReadingText('i', 'i').accuracyScore, 100);
    assert.equal(compareReadingText('i', 'ee').accuracyScore, 100);
  });

  test('short consonant-vowel syllables accept Web Speech long-vowel spellings', () => {
    const cases = [
      ['ba', 'bah'], ['be', 'beh'], ['bi', 'bee'], ['bi', 'BI'], ['bo', 'boh'], ['bu', 'boo'],
      ['ka', 'kah'], ['ke', 'keh'], ['ki', 'kee'], ['ko', 'koh'], ['ku', 'koo'],
      ['da', 'dah'], ['de', 'deh'], ['di', 'dee'], ['do', 'doh'], ['du', 'doo'],
    ];
    for (const [expected, spoken] of cases) {
      assert.equal(
        compareReadingText(expected, spoken).accuracyScore, 100,
        `expected "${expected}" to accept spoken "${spoken}" as a match`
      );
    }
  });

  test('a wrong consonant or vowel in a short syllable is still rejected', () => {
    const cases = [['bi', 'ki'], ['bi', 'di'], ['ba', 'da'], ['ka', 'ta'], ['ku', 'tu'], ['di', 'gi'], ['bo', 'do'], ['bi', 'ba']];
    for (const [expected, spoken] of cases) {
      assert.ok(
        compareReadingText(expected, spoken).accuracyScore < 80,
        `expected "${expected}" spoken as "${spoken}" to score below 80, was scored too high`
      );
    }
  });
});
