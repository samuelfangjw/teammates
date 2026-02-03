import { NgIf, NgClass, NgFor } from '@angular/common';
import { Component, DOCUMENT, inject, Inject, signal, computed, viewChild, DestroyRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PageScrollService } from 'ngx-page-scroll-core';
import { combineLatest, from, of } from 'rxjs';
import { bufferCount, catchError, concatMap, filter, finalize, map, switchMap, tap } from 'rxjs/operators';
import { EnrollStatus } from './enroll-status';
import { CourseService } from '../../../services/course.service';
import { ProgressBarService } from '../../../services/progress-bar.service';
import { SimpleModalService } from '../../../services/simple-modal.service';
import { StatusMessageService } from '../../../services/status-message.service';
import { StudentService } from '../../../services/student.service';
import { EnrollStudents, JoinState, Student, Students } from '../../../types/api-output';
import { StudentEnrollRequest } from '../../../types/api-request';
import { AjaxLoadingComponent } from '../../components/ajax-loading/ajax-loading.component';
import { AjaxPreloadComponent } from '../../components/ajax-preload/ajax-preload.component';
import { LoadingRetryComponent } from '../../components/loading-retry/loading-retry.component';
import { LoadingSpinnerDirective } from '../../components/loading-spinner/loading-spinner.directive';
import { PanelChevronComponent } from '../../components/panel-chevron/panel-chevron.component';
import { ProgressBarComponent } from '../../components/progress-bar/progress-bar.component';
import { SimpleModalType } from '../../components/simple-modal/simple-modal-type';
import { StatusMessage } from '../../components/status-message/status-message';
import { StatusMessageComponent } from '../../components/status-message/status-message.component';
import { collapseAnim } from '../../components/teammates-common/collapse-anim';
import { ErrorMessageOutput } from '../../error-message-output';
import { registerAllModules } from 'handsontable/registry';
import { DataGridComponent } from '../../components/data-grid/data-grid.component';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';

interface EnrollResultPanel {
  status: EnrollStatus;
  messageForEnrollmentStatus: string;
  studentList: Student[];
}

registerAllModules();

/**
 * Instructor course enroll page.
 */
@Component({
  selector: 'tm-instructor-course-enroll-page',
  templateUrl: './instructor-course-enroll-page.component.html',
  styleUrls: ['./instructor-course-enroll-page.component.scss'],
  animations: [collapseAnim],
  imports: [
    LoadingSpinnerDirective,
    LoadingRetryComponent,
    NgIf,
    StatusMessageComponent,
    AjaxPreloadComponent,
    PanelChevronComponent,
    NgClass,
    ProgressBarComponent,
    AjaxLoadingComponent,
    NgFor,
    DataGridComponent,
  ],
})
export class InstructorCourseEnrollPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly statusMessageService = inject(StatusMessageService);
  private readonly courseService = inject(CourseService);
  private readonly studentService = inject(StudentService);
  private readonly progressBarService = inject(ProgressBarService);
  private readonly simpleModalService = inject(SimpleModalService);
  private readonly pageScrollService = inject(PageScrollService);

  // Reference to the new students data grid
  newStudentsGrid = viewChild.required<DataGridComponent>('newStudentsGrid');

  GENERAL_ERROR_MESSAGE: string = `You may check that: "Section" and "Comment" are optional while "Team", "Name",
        and "Email" must be filled. "Section", "Team", "Name", and "Comment" should start with an
        alphabetical character, unless wrapped by curly brackets "{}", and should not contain vertical bar "|" and
        percentage sign "%". "Email" should contain some text followed by one "@" sign followed by some
        more text. "Team" should not have the same format as email to avoid mis-interpretation.`;
  SECTION_ERROR_MESSAGE: string = 'Section cannot be empty if the total number of students is more than 100. ';
  TEAM_ERROR_MESSAGE: string = 'Duplicated team detected in different sections. ';

  COL_HEADERS = ['Section', 'Team', 'Name', 'Email', 'Comments'] as const;
  ENROLL_BATCH_SIZE = 50;

  // enum
  EnrollStatus: typeof EnrollStatus = EnrollStatus;

  private readonly queryParams = toSignal(this.route.queryParams);
  courseId = computed<string>(() => this.queryParams()?.['courseid'] ?? '');
  refreshExistingStudents = signal(0);

  isEnrollingStudents = signal(false);
  isLoadingCoursePresent = signal(true);
  isLoadingExistingStudents = signal(true);
  isLoadingCourseEnrollPage = computed(() => this.isLoadingCoursePresent() && this.isLoadingExistingStudents());

  enrollErrorMessage = signal('');

  coursePresent = toSignal(
    toObservable(this.courseId).pipe(
      filter((courseId) => !!courseId),
      tap(() => this.isLoadingCoursePresent.set(true)),
      switchMap((courseId) =>
        this.courseService.hasResponsesForCourse(courseId).pipe(
          tap((response) => response && this.openHasExistingResponsesModal()),
          map(() => true),
          catchError((resp: ErrorMessageOutput) => {
            this.showErrorToast(resp.error.message);
            return of(false)
          }),
          finalize(() => this.isLoadingCoursePresent.set(false)),
        )
      ),
    )
  )

  existingStudents = toSignal(
    combineLatest([
      toObservable(this.courseId),
      toObservable(this.refreshExistingStudents),
    ]).pipe(
      filter(([courseId]) => !!courseId),
      tap(() => this.isLoadingExistingStudents.set(true)),
      switchMap(([courseId]) =>
        this.studentService.getStudentsFromCourse({ courseId }).pipe(
          map((resp: Students) => resp.students),
          catchError((resp: ErrorMessageOutput) => {
            this.showErrorToast(resp.error.message);
            return of([]);
          }),
          finalize(() => this.isLoadingExistingStudents.set(false)),
        )
      ),
    ),
    { initialValue: [] }
  );

  existingStudentsData = computed(() =>
    this.mapStudentsToRows(this.existingStudents())
  )

  showEnrollResults?: boolean = false;
  statusMessage: StatusMessage[] = [];
  unsuccessfulEnrolls: { [email: string]: string } = {};

  isNewStudentsPanelOpen = signal(true);
  isExistingStudentsPanelOpen = signal(false);

  enrollResultPanelList?: EnrollResultPanel[];
  isExistingStudentsPresent: boolean = true;

  allStudentChunks: StudentEnrollRequest[][] = [];

  invalidRowsIndex = signal(new Set<number>());
  newStudentRowsIndex = signal(new Set<number>());
  modifiedStudentRowsIndex = signal(new Set<number>());
  unchangedStudentRowsIndex = signal(new Set<number>());

  constructor(@Inject(DOCUMENT) private document: Document) { }

  addRowsToNewStudentsTable(numberOfRows: number): void {
    this.newStudentsGrid().addRows(numberOfRows);
  }

  enrollStudents() {
    this.resetEnrollmentState();
    this.isEnrollingStudents.set(true);

    const data = this.newStudentsGrid().getData();
    const studentEnrollRequests: [number, StudentEnrollRequest][] = data
      .map((row, index) => [index, row] as const)
      .filter(([, row]) => !row.every((cell) => cell === null || cell === ''))
      .map(([index, row]) => [index, {
        section: String(row[0] ?? '').trim(),
        team: String(row[1] ?? '').trim(),
        name: String(row[2] ?? '').trim(),
        email: String(row[3] ?? '').trim(),
        comments: String(row[4] ?? '').trim(),
      }]);

    if (!this.validateEnrollmentData(studentEnrollRequests)) {
      this.isEnrollingStudents.set(false);
      return;
    }

    let currentProgress = 0
    this.progressBarService.updateProgress(0);
    const validEnrollRequests = studentEnrollRequests.filter(([idx, _]) => !this.invalidRowsIndex().has(idx));

    const successfulEnrolls: Student[] = [];
    // const unssuccessfulEnrolls: EnrollErrorResults[] = [];

    from(validEnrollRequests).pipe(
      bufferCount(this.ENROLL_BATCH_SIZE),
      concatMap((studentChunk: [number, StudentEnrollRequest][]) => this.studentService.enrollStudents(
        this.courseId(),
        {
          studentEnrollRequests: studentChunk.map(([_, request]) => request),
        }
      )),
      finalize(() => this.isEnrollingStudents.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (resp: EnrollStudents) => {
        currentProgress += this.ENROLL_BATCH_SIZE;
        const percentage: number = Math.max(100, Math.round(100 * currentProgress / validEnrollRequests.length));
        this.progressBarService.updateProgress(percentage);

        if (resp.studentsData.students) {
          successfulEnrolls.push(...resp.studentsData.students);
        }
        // if (resp.unsuccessfulEnrolls != null) {
        //   unssuccessfulEnrolls.push(...resp.unsuccessfulEnrolls);
        // }
      },
      error: (resp: ErrorMessageOutput) => {
        this.enrollErrorMessage.set(resp.error.message);
      },
      complete: () => {
        this.showSuccessToast();
        const result = this.processEnrollmentResults(successfulEnrolls, studentEnrollRequests, this.existingStudents());
        this.enrollResultPanelList = result.panels;
        this.newStudentsGrid().styleRows(result.rowIdxToClass);
        this.showEnrollResults = true;
        this.refreshExistingStudents.update(n => n + 1);
      }
    });
  }

  private resetEnrollmentState(): void {
    this.invalidRowsIndex.set(new Set());
    this.newStudentRowsIndex.set(new Set());
    this.modifiedStudentRowsIndex.set(new Set());
    this.unchangedStudentRowsIndex.set(new Set());
    this.enrollErrorMessage.set('');
    this.showEnrollResults = false;
  }

  private mapStudentsToRows(students: Student[] | undefined): string[][] {
    if (!students) {
      return [];
    }

    return students.map((student: Student) => ([
      student.sectionName,
      student.teamName,
      student.name,
      student.email,
      student.comments || '',
    ]));
  }

  private validateEnrollmentData(studentEnrollRequests: [number, StudentEnrollRequest][]): boolean {
    if (!this.checkStudentsNotEmpty(studentEnrollRequests)) {
      this.enrollErrorMessage.set('No students to enroll.');
      return false;
    }

    const invalidCompulsoryFieldsRows = this.checkCompulsoryFields(studentEnrollRequests);
    const invalidEmailRows = this.checkValidEmails(studentEnrollRequests);
    const invalidTeamRows = this.checkTeamsValid(studentEnrollRequests);

    // TODO: clean this up
    if (invalidCompulsoryFieldsRows.size > 0) {
      this.enrollErrorMessage.set(this.enrollErrorMessage() + 'Found empty compulsory fields and/or sections with more than 100 students. ');
      this.invalidRowsIndex.set(new Set([...this.invalidRowsIndex(), ...invalidCompulsoryFieldsRows]));
    }

    if (invalidEmailRows.size > 0) {
      this.enrollErrorMessage.set(this.enrollErrorMessage() + 'Found duplicated emails. ');
      this.invalidRowsIndex.set(new Set([...this.invalidRowsIndex(), ...invalidEmailRows]));
    }

    if (invalidTeamRows.size > 0) {
      this.enrollErrorMessage.set(this.enrollErrorMessage() + 'Found duplicated teams in different sections. ');
      this.invalidRowsIndex.set(new Set([...this.invalidRowsIndex(), ...invalidTeamRows]));
    }

    return invalidCompulsoryFieldsRows.size === 0 && invalidEmailRows.size === 0 && invalidTeamRows.size === 0;
  }

  /**
   * Checks that the number of students to enroll is non-zero.
   */
  private checkStudentsNotEmpty(studentEnrollRequests: [number, StudentEnrollRequest][]): boolean {
    return studentEnrollRequests.length > 0;
  }

  /**
   * Checks that teams are valid.
   * 
   * Teams are valid if no two students belonging to the same team are in different sections.
   */
  private checkTeamsValid(studentEnrollRequests: [number, StudentEnrollRequest][]): Set<number> {
    const invalidTeams = new Set<string>();
    const teamSectionMap: Map<string, string> = new Map();

    for (const [_, request] of studentEnrollRequests) {
      if (request.team in invalidTeams) {
        continue;
      }

      if (teamSectionMap.has(request.team) && teamSectionMap.get(request.team) !== request.section) {
        invalidTeams.add(request.team);
        continue;
      }

      teamSectionMap.set(request.team, request.section);
    }

    const invalidRows = new Set<number>();
    for (const [idx, request] of studentEnrollRequests) {
      if (invalidTeams.has(request.team)) {
        invalidRows.add(idx);
      }
    }

    return invalidRows;
  }

  /**
   * Checks that compulsory fields are filled.
   * 
   * Compulsory fields are: Team, Name, Email.
   * Section is also compulsory if there are more than 100 students.
   */
  private checkCompulsoryFields(studentEnrollRequests: [number, StudentEnrollRequest][]): Set<number> {
    const invalidRows = new Set<number>();
    const existingStudentsSize = this.existingStudents()?.length ?? 0;
    const totalSizeAfterEnrollment = studentEnrollRequests.length + existingStudentsSize;

    for (const [idx, request] of studentEnrollRequests) {
      if ((totalSizeAfterEnrollment > 100 && !request.section)
        || !request.team || !request.name || !request.email) {
        invalidRows.add(idx);
      }
    }

    return invalidRows;
  }

  /**
   * Checks that emails are valid.
   * 
   * Emails are valid if no two students have the same email.
   */
  private checkValidEmails(studentEnrollRequests: [number, StudentEnrollRequest][]): Set<number> {
    const emails: Set<string> = new Set();
    const invalidEmails: Set<string> = new Set();

    for (const [_, request] of studentEnrollRequests) {
      if (emails.has(request.email)) {
        invalidEmails.add(request.email);
      } else {
        emails.add(request.email);
      }
    }

    const invalidRows = new Set<number>();

    for (const [idx, request] of studentEnrollRequests) {
      if (invalidEmails.has(request.email)) {
        invalidRows.add(idx);
      }
    }

    return invalidRows;
  }

  private processEnrollmentResults(successfulyEnrolls: Student[], enrollRequests: [number, StudentEnrollRequest][], existingStudents: Student[]): { panels: EnrollResultPanel[], rowIdxToClass: Record<number, string> } {
    const panels: EnrollResultPanel[] = [];
    const emailToIndexMap = new Map<string, number>(
      enrollRequests.map(([index, enrollRequest]) => [enrollRequest.email, index])
    );
    const studentLists: Record<EnrollStatus, Student[]> = {
      [EnrollStatus.UNMODIFIED]: [],
      [EnrollStatus.MODIFIED_UNCHANGED]: [],
      [EnrollStatus.MODIFIED]: [],
      [EnrollStatus.NEW]: [],
      [EnrollStatus.ERROR]: [],
    };
    const rowIdxToClass: Record<number, string> = {};

    // Identify students not in the enroll list.
    for (const existingStudent of existingStudents) {
      if (!emailToIndexMap.has(existingStudent.email)) {
        studentLists[EnrollStatus.UNMODIFIED].push(existingStudent);
      }
    }

    // Identify new students, modified students, and students that are modified without any changes.
    for (const enrolledStudent of successfulyEnrolls) {
      const unchangedStudent: Student | undefined = existingStudents.find((student: Student) => {
        return this.isSameEnrollInformation(student, enrolledStudent);
      });
      const modifiedStudent: Student | undefined = existingStudents.find((student: Student) => {
        return student.email === enrolledStudent.email;
      });

      if (unchangedStudent !== undefined) {
        studentLists[EnrollStatus.MODIFIED_UNCHANGED].push(enrolledStudent);
        this.unchangedStudentRowsIndex().add(emailToIndexMap.get(enrolledStudent.email)!);
        rowIdxToClass[emailToIndexMap.get(enrolledStudent.email)!] = 'unchanged-row';
      } else if (unchangedStudent === undefined && modifiedStudent !== undefined) {
        studentLists[EnrollStatus.MODIFIED].push(enrolledStudent);
        this.modifiedStudentRowsIndex().add(emailToIndexMap.get(enrolledStudent.email)!);
        rowIdxToClass[emailToIndexMap.get(enrolledStudent.email)!] = 'modified-row';
      } else if (unchangedStudent === undefined && modifiedStudent === undefined) {
        studentLists[EnrollStatus.NEW].push(enrolledStudent);
        this.newStudentRowsIndex().add(emailToIndexMap.get(enrolledStudent.email)!);
        rowIdxToClass[emailToIndexMap.get(enrolledStudent.email)!] = 'new-row';
      }
    }

    // Identify students that failed to enroll.
    for (const [_, request] of enrollRequests) {
      const enrolledStudent: Student | undefined = successfulyEnrolls.find((student: Student) => {
        return student.email === request.email;
      });

      if (enrolledStudent === undefined) {
        studentLists[EnrollStatus.ERROR].push({
          email: request.email,
          courseId: this.courseId(),
          name: request.name,
          sectionName: request.section,
          teamName: request.team,
          comments: request.comments,
          joinState: JoinState.NOT_JOINED,
        });
        rowIdxToClass[emailToIndexMap.get(request.email)!] = 'invalid-row';
      }
    }

    const statusMessage: Record<number, string> = {
      0: `${studentLists[EnrollStatus.ERROR].length} student(s) failed to be enrolled:`,
      1: `${studentLists[EnrollStatus.NEW].length} student(s) added:`,
      2: `${studentLists[EnrollStatus.MODIFIED].length} student(s) modified:`,
      3: `${studentLists[EnrollStatus.MODIFIED_UNCHANGED].length} student(s) updated with no changes:`,
      4: `${studentLists[EnrollStatus.UNMODIFIED].length} student(s) remain unmodified:`,
    };

    for (const status of [
      EnrollStatus.ERROR,
      EnrollStatus.NEW,
      EnrollStatus.MODIFIED,
      EnrollStatus.MODIFIED_UNCHANGED,
      EnrollStatus.UNMODIFIED,
    ]) {
      panels.push({
        status,
        messageForEnrollmentStatus: statusMessage[status],
        studentList: studentLists[status],
      });
    }

    if (studentLists[EnrollStatus.ERROR].length > 0) {
      this.enrollErrorMessage.set(this.GENERAL_ERROR_MESSAGE);
      this.showErrorToast('Some students failed to be enrolled, see the summary below.');
    }

    return {
      panels,
      rowIdxToClass
    };
  }

  private isSameEnrollInformation(enrolledStudent: Student, existingStudent: Student): boolean {
    return enrolledStudent.email === existingStudent.email
      && enrolledStudent.name === existingStudent.name
      && enrolledStudent.teamName === existingStudent.teamName
      && enrolledStudent.sectionName === existingStudent.sectionName
      && enrolledStudent.comments === existingStudent.comments;
  }

  toggleNewStudentsPanel(): void {
    this.isNewStudentsPanelOpen.update(value => !value);
  }

  toggleExistingStudentsPanel(): void {
    this.isExistingStudentsPanelOpen.update(value => !value);
  }

  private showSuccessToast(): void {
    this.statusMessageService.showSuccessToast('Enrollment successful. Summary given below.');
  }

  private showErrorToast(message: string): void {
    this.statusMessageService.showErrorToast(message);
  }

  private openHasExistingResponsesModal() {
    const modalContent = `<p><strong>There are existing feedback responses for this course.</strong></p>
          Modifying records of enrolled students will result in some existing responses
          from those modified students to be deleted. You may wish to download the data
          before you make the changes.`;
    this.simpleModalService.openInformationModal(
      'Existing feedback responses', SimpleModalType.WARNING, modalContent);
  }

  /**
   * Scrolls user to the target section.
   */
  navigateTo(target: string): void {
    this.pageScrollService.scroll({
      document: this.document,
      duration: 500,
      scrollTarget: `#${target}`,
      scrollOffset: 70,
    });
  }
}
