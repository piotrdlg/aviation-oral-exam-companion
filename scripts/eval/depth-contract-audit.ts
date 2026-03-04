/**
 * Depth & Difficulty Contract Audit (Phase 10)
 *
 * Validates that the contract system produces distinct, well-calibrated
 * contracts across all rating × difficulty × elementType combinations.
 *
 * Checks:
 *   1. All 4×4×2 = 32 combinations produce valid contracts
 *   2. Contracts are deterministic (same input → same output)
 *   3. Examiner format includes required sections
 *   4. Assessment format includes required sections
 *   5. Difficulty gradient: easy < medium < hard precision stringency
 *   6. Rating gradient: private < commercial < instrument precision
 *   7. Contract summaries have reasonable char counts
 *
 * Usage:
 *   npx tsx scripts/eval/depth-contract-audit.ts
 *
 * No DB access required — pure function audit.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import {
  buildDepthDifficultyContract,
  formatContractForExaminer,
  formatContractForAssessment,
  contractSummary,
} from '../../src/lib/difficulty-contract';
import { DEPTH_PROFILES } from '../../src/lib/depth-profile';
import type { Rating, Difficulty, ElementType } from '../../src/types/database';

const EVIDENCE_DIR = join(process.cwd(), 'docs/system-audit/evidence/2026-03-07-phase10/eval');

const RATINGS: Rating[] = ['private', 'commercial', 'instrument', 'atp'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'mixed'];
const ELEMENT_TYPES: ElementType[] = ['knowledge', 'risk'];

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

function main() {
  console.log('=== Depth & Difficulty Contract Audit (Phase 10) ===\n');

  const checks: Check[] = [];

  // ---------------------------------------------------------------------------
  // Check 1: All combinations produce valid contracts
  // ---------------------------------------------------------------------------
  console.log('Check 1: Contract generation for all combinations...');

  let allValid = true;
  const contracts: Array<{
    rating: Rating;
    difficulty: Difficulty;
    elementType: ElementType;
    targetDepthLen: number;
    precisionLen: number;
    toleranceLen: number;
    examinerFormatLen: number;
    assessmentFormatLen: number;
  }> = [];

  for (const rating of RATINGS) {
    for (const difficulty of DIFFICULTIES) {
      for (const elementType of ELEMENT_TYPES) {
        const contract = buildDepthDifficultyContract(rating, difficulty, elementType);

        if (!contract.rating || !contract.difficulty || !contract.targetDepth ||
            !contract.requiredPrecision || !contract.partialTolerance ||
            !contract.followUpStyle || !contract.scenarioComplexity ||
            !contract.crossHubExpectation) {
          allValid = false;
          console.log(`  ❌ ${rating}/${difficulty}/${elementType}: missing field`);
        }

        contracts.push({
          rating, difficulty, elementType,
          targetDepthLen: contract.targetDepth.length,
          precisionLen: contract.requiredPrecision.length,
          toleranceLen: contract.partialTolerance.length,
          examinerFormatLen: formatContractForExaminer(contract).length,
          assessmentFormatLen: formatContractForAssessment(contract).length,
        });
      }
    }
  }

  checks.push({
    name: 'all_combinations_valid',
    pass: allValid && contracts.length === RATINGS.length * DIFFICULTIES.length * ELEMENT_TYPES.length,
    detail: `${contracts.length} contracts generated, all fields populated: ${allValid}`,
  });
  console.log(`  ${allValid ? '✅' : '❌'} ${contracts.length} contracts generated`);

  // ---------------------------------------------------------------------------
  // Check 2: Deterministic
  // ---------------------------------------------------------------------------
  console.log('\nCheck 2: Determinism...');

  let deterministic = true;
  for (const rating of RATINGS) {
    for (const difficulty of DIFFICULTIES) {
      const a = buildDepthDifficultyContract(rating, difficulty, 'knowledge');
      const b = buildDepthDifficultyContract(rating, difficulty, 'knowledge');
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        deterministic = false;
        console.log(`  ❌ ${rating}/${difficulty}: non-deterministic`);
      }
    }
  }

  checks.push({
    name: 'deterministic',
    pass: deterministic,
    detail: deterministic ? 'All contracts deterministic' : 'FAIL: non-deterministic contracts found',
  });
  console.log(`  ${deterministic ? '✅' : '❌'} Deterministic: ${deterministic}`);

  // ---------------------------------------------------------------------------
  // Check 3: Examiner format includes required sections
  // ---------------------------------------------------------------------------
  console.log('\nCheck 3: Examiner format sections...');

  const requiredExaminerSections = ['DEPTH & DIFFICULTY CONTRACT', 'Target Depth:', 'Required Precision:', 'Scenario Complexity:', 'Follow-Up Style:', 'Cross-Topic Awareness:'];
  let examinerFormatValid = true;

  const testContract = buildDepthDifficultyContract('commercial', 'medium');
  const examinerFormatted = formatContractForExaminer(testContract);

  for (const section of requiredExaminerSections) {
    if (!examinerFormatted.includes(section)) {
      examinerFormatValid = false;
      console.log(`  ❌ Missing examiner section: "${section}"`);
    }
  }

  checks.push({
    name: 'examiner_format_sections',
    pass: examinerFormatValid,
    detail: `${requiredExaminerSections.length} required sections: ${examinerFormatValid ? 'all present' : 'MISSING'}`,
  });
  console.log(`  ${examinerFormatValid ? '✅' : '❌'} Examiner format: ${requiredExaminerSections.length} sections`);

  // ---------------------------------------------------------------------------
  // Check 4: Assessment format includes required sections
  // ---------------------------------------------------------------------------
  console.log('\nCheck 4: Assessment format sections...');

  const requiredAssessmentSections = ['GRADING CALIBRATION CONTRACT', 'Certificate Level:', 'Difficulty:', 'Required Precision:', 'Partial Tolerance:', 'Cross-Topic Awareness:'];
  let assessmentFormatValid = true;

  const assessmentFormatted = formatContractForAssessment(testContract);

  for (const section of requiredAssessmentSections) {
    if (!assessmentFormatted.includes(section)) {
      assessmentFormatValid = false;
      console.log(`  ❌ Missing assessment section: "${section}"`);
    }
  }

  checks.push({
    name: 'assessment_format_sections',
    pass: assessmentFormatValid,
    detail: `${requiredAssessmentSections.length} required sections: ${assessmentFormatValid ? 'all present' : 'MISSING'}`,
  });
  console.log(`  ${assessmentFormatValid ? '✅' : '❌'} Assessment format: ${requiredAssessmentSections.length} sections`);

  // ---------------------------------------------------------------------------
  // Check 5: Difficulty gradient (easy → hard increases stringency)
  // ---------------------------------------------------------------------------
  console.log('\nCheck 5: Difficulty gradient...');

  let difficultyGradientPass = true;
  const difficultyGradientDetails: string[] = [];

  for (const rating of RATINGS) {
    const easy = buildDepthDifficultyContract(rating, 'easy');
    const medium = buildDepthDifficultyContract(rating, 'medium');
    const hard = buildDepthDifficultyContract(rating, 'hard');

    // Easy should mention "lenient"/"general"; hard should mention "strict"/"exact"/"demand"
    const easyPrecision = easy.requiredPrecision.toLowerCase();
    const hardPrecision = hard.requiredPrecision.toLowerCase();
    const easyHasLenient = easyPrecision.includes('general') || easyPrecision.includes('accept') || easyPrecision.includes('not required');
    const hardHasStrict = hardPrecision.includes('exact') || hardPrecision.includes('demand') || hardPrecision.includes('specific');

    if (!easyHasLenient || !hardHasStrict) {
      difficultyGradientPass = false;
      difficultyGradientDetails.push(`${rating}: easy_lenient=${easyHasLenient}, hard_strict=${hardHasStrict}`);
    }

    // All three should have different follow-up styles
    if (easy.followUpStyle === medium.followUpStyle || medium.followUpStyle === hard.followUpStyle) {
      difficultyGradientPass = false;
      difficultyGradientDetails.push(`${rating}: duplicate follow-up styles`);
    }
  }

  checks.push({
    name: 'difficulty_gradient',
    pass: difficultyGradientPass,
    detail: difficultyGradientPass
      ? 'easy→hard gradient verified for all ratings'
      : `ISSUES: ${difficultyGradientDetails.join('; ')}`,
  });
  console.log(`  ${difficultyGradientPass ? '✅' : '❌'} Difficulty gradient: ${difficultyGradientPass ? 'PASS' : 'FAIL'}`);

  // ---------------------------------------------------------------------------
  // Check 6: Rating gradient (private → instrument increases depth)
  // ---------------------------------------------------------------------------
  console.log('\nCheck 6: Rating gradient...');

  let ratingGradientPass = true;
  const ratingGradientDetails: string[] = [];

  for (const difficulty of DIFFICULTIES) {
    const priv = buildDepthDifficultyContract('private', difficulty);
    const inst = buildDepthDifficultyContract('instrument', difficulty);

    // Instrument should be stricter than private (different precision, tolerance)
    if (priv.requiredPrecision === inst.requiredPrecision) {
      ratingGradientPass = false;
      ratingGradientDetails.push(`${difficulty}: private=instrument precision (should differ)`);
    }
    if (priv.partialTolerance === inst.partialTolerance) {
      ratingGradientPass = false;
      ratingGradientDetails.push(`${difficulty}: private=instrument tolerance (should differ)`);
    }
  }

  checks.push({
    name: 'rating_gradient',
    pass: ratingGradientPass,
    detail: ratingGradientPass
      ? 'private→instrument gradient verified for all difficulties'
      : `ISSUES: ${ratingGradientDetails.join('; ')}`,
  });
  console.log(`  ${ratingGradientPass ? '✅' : '❌'} Rating gradient: ${ratingGradientPass ? 'PASS' : 'FAIL'}`);

  // ---------------------------------------------------------------------------
  // Check 7: Contract summaries have reasonable char counts
  // ---------------------------------------------------------------------------
  console.log('\nCheck 7: Contract summary char counts...');

  let summaryPass = true;
  for (const rating of RATINGS) {
    for (const difficulty of DIFFICULTIES) {
      const contract = buildDepthDifficultyContract(rating, difficulty);
      const summary = contractSummary(contract);

      if (summary.targetDepthChars < 100 || summary.precisionChars < 50 || summary.toleranceChars < 50) {
        summaryPass = false;
        console.log(`  ❌ ${rating}/${difficulty}: depth=${summary.targetDepthChars}, prec=${summary.precisionChars}, tol=${summary.toleranceChars}`);
      }
    }
  }

  checks.push({
    name: 'summary_char_counts',
    pass: summaryPass,
    detail: summaryPass ? 'All contract summaries have reasonable char counts (depth>=100, prec>=50, tol>=50)' : 'FAIL: some contracts too short',
  });
  console.log(`  ${summaryPass ? '✅' : '❌'} Summary char counts: ${summaryPass ? 'PASS' : 'FAIL'}`);

  // ---------------------------------------------------------------------------
  // Check 8: Depth profiles defined for all ratings
  // ---------------------------------------------------------------------------
  console.log('\nCheck 8: Depth profiles...');

  let profilesPass = true;
  for (const rating of RATINGS) {
    if (!DEPTH_PROFILES[rating]) {
      profilesPass = false;
      console.log(`  ❌ Missing profile: ${rating}`);
    }
  }

  checks.push({
    name: 'depth_profiles_complete',
    pass: profilesPass,
    detail: `${RATINGS.length} depth profiles: ${profilesPass ? 'all defined' : 'MISSING'}`,
  });
  console.log(`  ${profilesPass ? '✅' : '❌'} Depth profiles: ${RATINGS.length} defined`);

  // ---------------------------------------------------------------------------
  // Write results
  // ---------------------------------------------------------------------------
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const allPass = checks.every(c => c.pass);

  const report = {
    timestamp: new Date().toISOString(),
    checks,
    contracts_generated: contracts.length,
    overall_pass: allPass,
    contract_details: contracts,
  };

  writeFileSync(
    join(EVIDENCE_DIR, 'depth-contract-audit.json'),
    JSON.stringify(report, null, 2),
  );

  // Markdown report
  let md = `# Depth & Difficulty Contract Audit (Phase 10)\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;
  md += `## Checks\n\n`;
  md += `| Check | Pass | Detail |\n|-------|------|--------|\n`;
  for (const c of checks) {
    md += `| ${c.name} | ${c.pass ? '✅' : '❌'} | ${c.detail} |\n`;
  }

  md += `\n## Contract Matrix (char counts)\n\n`;
  md += `| Rating | Difficulty | Element | TargetDepth | Precision | Tolerance | Examiner | Assessment |\n`;
  md += `|--------|------------|---------|-------------|-----------|-----------|----------|------------|\n`;
  for (const c of contracts) {
    md += `| ${c.rating} | ${c.difficulty} | ${c.elementType} | ${c.targetDepthLen} | ${c.precisionLen} | ${c.toleranceLen} | ${c.examinerFormatLen} | ${c.assessmentFormatLen} |\n`;
  }

  md += `\n## Overall\n\n`;
  md += `**${allPass ? 'PASS' : 'FAIL'}** — ${checks.filter(c => c.pass).length}/${checks.length} checks passed\n`;

  writeFileSync(join(EVIDENCE_DIR, 'depth-contract-audit.md'), md);

  // Console summary
  console.log('\n=== RESULTS ===');
  for (const c of checks) {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }
  console.log(`\nContracts generated: ${contracts.length}`);
  console.log(`Evidence saved to ${EVIDENCE_DIR}/depth-contract-audit.{json,md}`);
  console.log(`\nOVERALL: ${allPass ? 'PASS' : 'FAIL'}`);

  if (!allPass) process.exit(1);
}

main();
