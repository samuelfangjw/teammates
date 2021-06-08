import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {finalize} from 'rxjs/operators';
import {saveAs} from 'file-saver';
import {CourseService} from '../../../services/course.service';
import {FeedbackSessionsService} from '../../../services/feedback-sessions.service';
import {StatusMessageService} from '../../../services/status-message.service';
import {TableComparatorService} from '../../../services/table-comparator.service';
import {TimezoneService} from '../../../services/timezone.service';
import {
  Course,
  Courses, FeedbackQuestion,
  FeedbackQuestions,
  FeedbackSession,
  FeedbackSessionPublishStatus,
  FeedbackSessions,
  FeedbackSessionSubmissionStatus,
  HasResponses, Student,
} from '../../../types/api-output';
import {SortBy, SortOrder} from '../../../types/sort-properties';
import {ErrorMessageOutput} from '../../error-message-output';
import {FeedbackQuestionsService} from "../../../services/feedback-questions.service";
import {Intent} from "../../../types/api-request";
import {FeedbackResponsesService} from "../../../services/feedback-responses.service";
import {FeedbackResponseDetailsFactory} from "../../../types/response-details-impl/feedback-response-details-factory";
import {StudentService} from "../../../services/student.service";

interface StudentCourse {
  course: Course;
  feedbackSessions: StudentSession[];
}

interface StudentSession {
  session: FeedbackSession;
  isOpened: boolean;
  isWaitingToOpen: boolean;
  isPublished: boolean;
  isSubmitted: boolean;
}

/**
 * Student home page.
 */
@Component({
  selector: 'tm-student-home-page',
  templateUrl: './student-home-page.component.html',
  styleUrls: ['./student-home-page.component.scss'],
})
export class StudentHomePageComponent implements OnInit {

  // enum
  SortBy: typeof SortBy = SortBy;

  // Tooltip messages
  studentFeedbackSessionStatusPublished: string =
    'The responses for the session have been published and can now be viewed.';
  studentFeedbackSessionStatusNotPublished: string =
    'The responses for the session have not yet been published and cannot be viewed.';
  studentFeedbackSessionStatusAwaiting: string =
    'The session is not open for submission at this time. It is expected to open later.';
  studentFeedbackSessionStatusPending: string = 'The feedback session is yet to be completed by you.';
  studentFeedbackSessionStatusSubmitted: string = 'You have submitted your feedback for this session.';
  studentFeedbackSessionStatusClosed: string = ' The session is now closed for submissions.';

  // Error messages
  allStudentFeedbackSessionsNotReturned: string = 'Something went wrong with fetching responses for all Feedback Sessions.';

  courses: StudentCourse[] = [];
  isCoursesLoading: boolean = false;
  hasCoursesLoadingFailed: boolean = false;

  sortBy: SortBy = SortBy.NONE;

  constructor(private route: ActivatedRoute,
              private courseService: CourseService,
              private statusMessageService: StatusMessageService,
              private studentService: StudentService,
              private feedbackSessionsService: FeedbackSessionsService,
              private feedbackQuestionsService: FeedbackQuestionsService,
              private feedbackResponsesService: FeedbackResponsesService,
              private timezoneService: TimezoneService,
              private tableComparatorService: TableComparatorService) {
    this.timezoneService.getTzVersion();
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(() => {
      this.loadStudentCourses();
    });
  }

  /**
   * Load the courses and feedback sessions involving the student.
   */
  loadStudentCourses(): void {
    this.hasCoursesLoadingFailed = false;
    this.isCoursesLoading = true;
    this.courses = [];
    this.courseService.getAllCoursesAsStudent().subscribe((resp: Courses) => {
      if (!resp.courses.length) {
        this.isCoursesLoading = false;
      }
      for (const course of resp.courses) {
        this.feedbackSessionsService.getFeedbackSessionsForStudent(course.courseId)
          .pipe(finalize(() => this.isCoursesLoading = false))
          .subscribe((fss: FeedbackSessions) => {
            const sortedFss: FeedbackSession[] = this.sortFeedbackSessions(fss);

            const studentSessions: StudentSession[] = [];
            this.feedbackSessionsService.hasStudentResponseForAllFeedbackSessionsInCourse(course.courseId)
              .subscribe((hasRes: HasResponses) => {
                if (!hasRes.hasResponsesBySession) {
                  this.statusMessageService.showErrorToast(this.allStudentFeedbackSessionsNotReturned);
                  this.hasCoursesLoadingFailed = true;
                  return;
                }

                const sessionsReturned: Set<string> = new Set(Object.keys(hasRes.hasResponsesBySession));
                const isAllSessionsPresent: boolean =
                  sortedFss.filter((fs: FeedbackSession) =>
                    sessionsReturned.has(fs.feedbackSessionName)).length
                  === sortedFss.length;

                if (!isAllSessionsPresent) {
                  this.statusMessageService.showErrorToast(this.allStudentFeedbackSessionsNotReturned);
                  this.hasCoursesLoadingFailed = true;
                  return;
                }

                for (const fs of sortedFss) {
                  const isOpened: boolean = fs.submissionStatus === FeedbackSessionSubmissionStatus.OPEN;
                  const isWaitingToOpen: boolean =
                    fs.submissionStatus === FeedbackSessionSubmissionStatus.VISIBLE_NOT_OPEN;
                  const isPublished: boolean = fs.publishStatus === FeedbackSessionPublishStatus.PUBLISHED;

                  const isSubmitted: boolean = hasRes.hasResponsesBySession[fs.feedbackSessionName];
                  studentSessions.push(Object.assign({},
                    {isOpened, isWaitingToOpen, isPublished, isSubmitted, session: fs}));
                }
              }, (error: ErrorMessageOutput) => {
                this.hasCoursesLoadingFailed = true;
                this.statusMessageService.showErrorToast(error.error.message);
              });

            this.courses.push(Object.assign({}, {course, feedbackSessions: studentSessions}));
            this.courses.sort((a: StudentCourse, b: StudentCourse) =>
              (a.course.courseId > b.course.courseId) ? 1 : -1);
          }, (error: ErrorMessageOutput) => {
            this.hasCoursesLoadingFailed = true;
            this.statusMessageService.showErrorToast(error.error.message);
          });
      }
    }, (e: ErrorMessageOutput) => {
      this.hasCoursesLoadingFailed = true;
      this.statusMessageService.showErrorToast(e.error.message);
    });
  }

  /**
   * Gets the tooltip message for the submission status.
   */
  getSubmissionStatusTooltip(session: StudentSession): string {
    let msg: string = '';

    if (session.isWaitingToOpen) {
      msg += this.studentFeedbackSessionStatusAwaiting;
    } else if (session.isSubmitted) {
      msg += this.studentFeedbackSessionStatusSubmitted;
    } else {
      msg += this.studentFeedbackSessionStatusPending;
    }
    if (!session.isOpened && !session.isWaitingToOpen) {
      msg += this.studentFeedbackSessionStatusClosed;
    }
    return msg;
  }

  /**
   * Gets the tooltip message for the response status.
   */
  getResponseStatusTooltip(isPublished: boolean): string {
    if (isPublished) {
      return this.studentFeedbackSessionStatusPublished;
    }
    return this.studentFeedbackSessionStatusNotPublished;
  }

  /**
   * Sorts the feedback sessions based on creation and end timestamp.
   */
  sortFeedbackSessions(fss: FeedbackSessions): FeedbackSession[] {
    return fss.feedbackSessions
      .map((fs: FeedbackSession) => Object.assign({}, fs))
      .sort((a: FeedbackSession, b: FeedbackSession) => (a.createdAtTimestamp >
        b.createdAtTimestamp) ? 1 : (a.createdAtTimestamp === b.createdAtTimestamp) ?
        ((a.submissionEndTimestamp > b.submissionEndTimestamp) ? 1 : -1) : -1);
  }

  sortCoursesBy(by: SortBy): void {
    this.sortBy = by;
    this.courses.sort(this.sortPanelsBy(by));
  }

  sortPanelsBy(by: SortBy): ((a: StudentCourse, b: StudentCourse) => number) {
    return ((a: StudentCourse, b: StudentCourse): number => {
      let strA: string;
      let strB: string;
      switch (by) {
        case SortBy.COURSE_NAME:
          strA = a.course.courseName;
          strB = b.course.courseName;
          break;
        case SortBy.COURSE_ID:
          strA = a.course.courseId;
          strB = b.course.courseId;
          break;
        default:
          strA = '';
          strB = '';
      }
      return this.tableComparatorService.compare(by, SortOrder.ASC, strA, strB);
    });
  }

  /**
   * Triggers the download of a student's response as a text file.
   */
  downloadResponse(rowIndex: number): void {
    console.log(rowIndex);
  }

  /**
   * Triggers the download of a student's submission as a text file.
   */
  downloadSubmission(rowIndex: number, studentCourse: StudentCourse): void {
    const studentSession: StudentSession = studentCourse.feedbackSessions[rowIndex];
    const courseId = studentSession.session.courseId;

    this.getStudent(courseId, (student: Student) => {
      this.processSubmission(student, studentSession);
    })
  }

  /**
   * Fetch the student, following which calls {@param onComplete} with the student.
   * @param courseId The courseId the student is in.
   * @param onComplete The function to call once student is fetched.
   */
  getStudent(courseId: string, onComplete: (student: Student) => void) {
    this.studentService.getStudent(courseId).subscribe((student: Student) => {
      onComplete(student);
    })
  }

  processSubmission(student: Student, studentSession: StudentSession) {
    const feedbackSession = studentSession.session;
    const time: number = new Date().getTime();
    const formattedTime: string = this.timezoneService.formatToString(
      time, feedbackSession.timeZone, 'YYYYMMDDHHmmSSZZ');

    const fileContent: string[] = [
      'TEAMMATES Proof of Submission',
      `Updated as at ${time}::${formattedTime}`,
      '==============================',
      `Submitted by: ${student.name} [${student.email}]`,
      `Course: ${feedbackSession.courseId}`,
      `Session: ${feedbackSession.feedbackSessionName}`,
      '',
      '',
      '',
    ];

    this.feedbackQuestionsService.getFeedbackQuestions({
      courseId: feedbackSession.courseId,
      feedbackSessionName: feedbackSession.feedbackSessionName,
      intent: Intent.STUDENT_SUBMISSION
    }).subscribe(async (response: FeedbackQuestions) => {
      this.processQuestions(response.questions, 0, fileContent, time);
    })
  }

  processQuestions(questions: FeedbackQuestion[], idx: number, fileContent: string[], time: number) {
    const question = questions[idx];

    this.feedbackResponsesService.getFeedbackResponse({
      questionId: question.feedbackQuestionId,
      intent: Intent.STUDENT_SUBMISSION,
      key: '',
      moderatedPerson: '',
    }).subscribe({
      next: answers => {
        fileContent.push(`${question.questionNumber}: ${question.questionBrief}`);

        answers.responses.forEach(answer => {
          fileContent.push(`> ${answer.recipientIdentifier}`);
          fileContent.push(FeedbackResponseDetailsFactory
            .fromApiOutput(answer.responseDetails)
            .getResponseCsvAnswers(question.questionDetails)
            .join(','));
          fileContent.push('');
          fileContent.push('');
        })
      },
      complete: () => {
        if (idx >= questions.length - 1) {
          const blob: Blob = new Blob([fileContent.join('\r\n')], {type: 'text/plain'});
          saveAs(blob, `TEAMMATES Proof of Submission - ${time}`);
        } else {
          this.processQuestions(questions, idx + 1, fileContent, time);
        }
      }
    })
  }
}
