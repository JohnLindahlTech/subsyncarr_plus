import { AgreementStatus, EngineResult } from '../shared/types.js';

export interface ScoreReconciliation {
  bestEngine: string | null;
  bestScore: number | null;
  agreementStatus: AgreementStatus;
}

export class ScoreCalculator {
  public static reconcile(engines: Record<string, EngineResult>): ScoreReconciliation {
    const successes = Object.entries(engines)
      .filter(([, res]) => res.success)
      .map(([name, res]) => ({
        name,
        score: res.score !== undefined ? res.score : 0,
      }));

    if (successes.length === 0) {
      return {
        bestEngine: null,
        bestScore: null,
        agreementStatus: AgreementStatus.LOW_CONFIDENCE,
      };
    }

    // Sort by score descending
    successes.sort((a, b) => b.score - a.score);
    const bestResult = successes[0];
    const bestName = bestResult.name;

    let status: AgreementStatus = AgreementStatus.LOW_CONFIDENCE;

    if (successes.length >= 2) {
      const secondScore = successes[1].score;
      // If the top two engines agree within 5 points and are both high, it's verified
      if (Math.abs(bestResult.score - secondScore) <= 5 && bestResult.score > 70) {
        status = AgreementStatus.VERIFIED;
      } else if (Math.abs(bestResult.score - secondScore) > 30) {
        // High disagreement between engines
        status = AgreementStatus.SUSPICIOUS;
      } else if (bestResult.score > 50) {
        status = AgreementStatus.VERIFIED; // General consensus with decent score
      } else {
        status = AgreementStatus.LOW_CONFIDENCE; // Consensus but both are low
      }
    } else {
      // Only one engine succeeded
      status = bestResult.score > 80 ? AgreementStatus.VERIFIED : AgreementStatus.LOW_CONFIDENCE;
    }

    return {
      bestEngine: bestName,
      bestScore: bestResult.score,
      agreementStatus: status,
    };
  }
}
