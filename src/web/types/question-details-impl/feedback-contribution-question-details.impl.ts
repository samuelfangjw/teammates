// tslint:disable-next-line:max-line-length
import { ContributionQuestionStatisticsCalculation } from '../../app/components/question-types/question-statistics/question-statistics-calculation/contribution-question-statistics-calculation';
import {
  FeedbackContributionQuestionDetails as FeedbackContributionQuestionDetails,
  FeedbackQuestionType, QuestionOutput,
} from '../api-output';
import {
  CONTRIBUTION_POINT_NOT_INITIALIZED,
  CONTRIBUTION_POINT_NOT_SUBMITTED,
  CONTRIBUTION_POINT_NOT_SURE,
} from '../feedback-response-details';
import { AbstractFeedbackQuestionDetails } from './abstract-feedback-question-details';

/**
 * Concrete implementation of {@link FeedbackContributionQuestionDetails}.
 */
export class FeedbackContributionQuestionDetailsImpl extends AbstractFeedbackQuestionDetails
    implements FeedbackContributionQuestionDetails {

  isNotSureAllowed: boolean = true;
  isStudent: boolean;
  questionText: string = '';
  questionType: FeedbackQuestionType = FeedbackQuestionType.CONTRIB;

  constructor(apiOutput: FeedbackContributionQuestionDetails, isStudent: boolean) {
    super();
    this.isNotSureAllowed = apiOutput.isNotSureAllowed;
    this.isStudent = isStudent;
    this.questionText = apiOutput.questionText;
  }

  getQuestionCsvStats(question: QuestionOutput): string[][] {
    const statsRows: string[][] = [];
    
    const statsCalculation: ContributionQuestionStatisticsCalculation
        = new ContributionQuestionStatisticsCalculation(this);
    this.populateQuestionStatistics(statsCalculation, question, this.isStudent);
    statsCalculation.statistics = question.questionStatistics;
    statsCalculation.parseStatistics();
    if (!statsCalculation.questionOverallStatistics || !statsCalculation.questionOverallStatistics) {
      return [];
    }

    if (this.isStudent) {
      const stats = statsCalculation.questionStatisticsForStudent;
      if (!stats) {
        return statsRows;
      }

      const claimed: number = stats.claimed - 100;
      const perceived: number = stats.perceived - 100;
      const claimedOthersValues: number[] = stats.claimedOthersValues.map(claimed => claimed - 100);
      const percceivedOthers: number[] = stats.perceivedOthers.map(perceived => perceived - 100);

      statsRows.push(["My View of Me", `E ${claimed < 0 ? claimed: "+" + claimed}%`]);
      statsRows.push(["Team View of Me", `E ${perceived < 0 ? perceived: "+" + perceived}%`]);
      statsRows.push([]);
      statsRows.push(["My View of Others"].concat(claimedOthersValues.map(claimed => claimed < 0 ? `E ${claimed}%`: `E +${claimed}%`)));
      statsRows.push(["Team View of Others"].concat(percceivedOthers.map(perceived => perceived < 0 ? `E ${perceived}%`: `E +${perceived}%`)));
    } else {
      const stats: {
        teamName: string,
        name: string,
        email: string,
        claimedStr: string,
        perceivedStr: string,
        ratingsReceivedStr: string[],
      }[] = [];

      statsRows.push(['In the points given below, an equal share is equal to 100 points. ' +
        'e.g. 80 means "Equal share - 20%" and 110 means "Equal share + 10%".']);
      statsRows.push(['Claimed Contribution (CC) = the contribution claimed by the student.']);
      statsRows.push(['Perceived Contribution (PC) = the average value of ' +
          "student's contribution as perceived by the team members."]);
      statsRows.push(['Team', 'Name', 'Email', 'CC', 'PC', 'Ratings Received']);
      for (const email of Object.keys(statsCalculation.emailToName)) {
        const teamName: string = statsCalculation.emailToTeamName[email];
        const name: string = statsCalculation.emailToName[email];
        const claimed: number = statsCalculation.questionOverallStatistics.results[email].claimed;
        const claimedStr: string = this.getContributionPointToText(claimed);
        const perceived: number = statsCalculation.questionOverallStatistics.results[email].perceived;
        const perceivedStr: string = this.getContributionPointToText(perceived);
        const ratingsReceivedStr: string[] =
            statsCalculation.questionOverallStatistics.results[email].perceivedOthers
                .concat()
                .sort((a: number, b: number) => b - a)
                .map(this.getContributionPointToText);
        if (ratingsReceivedStr.length === 0) {
          ratingsReceivedStr[0] = 'N/A';
        }
        stats.push({
          teamName,
          name,
          email,
          claimedStr,
          perceivedStr,
          ratingsReceivedStr,
        });
      }
      // sort by team then name
      stats.sort(((a: {teamName: string, name: string}, b: {teamName: string, name: string}): number => {
        return a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name);
      }));
      // construct lines
      stats.forEach((value: {
        teamName: string,
        name: string,
        email: string,
        claimedStr: string,
        perceivedStr: string,
        ratingsReceivedStr: string[],
      }) => {
        statsRows.push([value.teamName, value.name, value.email,
          value.claimedStr, value.perceivedStr, ...value.ratingsReceivedStr]);
      });
    }

    return statsRows;
  }

  private getContributionPointToText(point: number): string {
    if (point === CONTRIBUTION_POINT_NOT_SURE) {
      return 'Not Sure';
    } if (point === CONTRIBUTION_POINT_NOT_SUBMITTED) {
      return 'Not Submitted';
    } if (point === CONTRIBUTION_POINT_NOT_INITIALIZED) {
      return 'N/A';
    }
    return String(point);
  }

  isParticipantCommentsOnResponsesAllowed(): boolean {
    return false;
  }

  isInstructorCommentsOnResponsesAllowed(): boolean {
    return false;
  }
}
