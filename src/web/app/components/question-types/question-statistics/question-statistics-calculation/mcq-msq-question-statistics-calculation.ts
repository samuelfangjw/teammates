/**
 * Interface defines common fields for MCQ MSQ stats calculation.
 */
export interface McqMsqQuestionStatisticsCalculation {
  // TODO: remove this interface before merging
  answerFrequency: Record<string, number>;
  percentagePerOption: Record<string, number>;
  weightPerOption: Record<string, number>;
  weightedPercentagePerOption: Record<string, number>;
  perRecipientResponses: Record<string, any>;
}
