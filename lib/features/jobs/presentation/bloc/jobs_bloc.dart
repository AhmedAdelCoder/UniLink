import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../../core/errors/failures.dart';
import '../../domain/entities/job.dart';
import '../../domain/usecases/apply_to_job.dart';
import '../../domain/usecases/create_job.dart';
import '../../domain/usecases/delete_job.dart';
import '../../domain/usecases/stream_followed_jobs.dart';
import '../../domain/usecases/stream_recruiter_jobs.dart';

part 'jobs_event.dart';
part 'jobs_state.dart';

class JobsBloc extends Bloc<JobsEvent, JobsState> {
  JobsBloc({
    required this.streamFollowedJobs,
    required this.streamRecruiterJobs,
    required this.createJob,
    required this.deleteJob,
    required this.applyToJob,
  }) : super(const JobsState.initial()) {
    on<JobsStartFeed>(_onStartFeed);
    on<JobsStartRecruiterJobs>(_onStartRecruiterJobs);
    // ❌ REMOVED: on<JobsDataUpdated> — no longer needed
    on<JobsCreateRequested>(_onCreateRequested);
    on<JobsDeleteRequested>(_onDeleteRequested);
    on<JobsApplyRequested>(_onApplyRequested);
    on<JobsClearMessage>(_onClearMessage);
  }

  final StreamFollowedJobs streamFollowedJobs;
  final StreamRecruiterJobs streamRecruiterJobs;
  final CreateJob createJob;
  final DeleteJob deleteJob;
  final ApplyToJob applyToJob;

  // ❌ REMOVED: StreamSubscription<List<Job>>? _jobsSubscription
  // emit.onEach manages the subscription lifetime automatically.

  Future<void> _onStartFeed(
    JobsStartFeed event,
    Emitter<JobsState> emit,
  ) async {
    emit(state.copyWith(isLoading: true, errorMessage: null));

    await emit.onEach<List<Job>>(
      streamFollowedJobs(event.studentId),
      onData: (jobs) => emit(state.copyWith(
        isLoading: false,
        jobs: jobs,
        errorMessage: null,
      )),
      onError: (error, _) => emit(state.copyWith(
        isLoading: false,
        errorMessage: error.toString(),
      )),
    );
  }

  Future<void> _onStartRecruiterJobs(
    JobsStartRecruiterJobs event,
    Emitter<JobsState> emit,
  ) async {
    emit(state.copyWith(isLoading: true, errorMessage: null));

    await emit.onEach<List<Job>>(
      streamRecruiterJobs(event.recruiterId),
      onData: (jobs) => emit(state.copyWith(
        isLoading: false,
        jobs: jobs,
        errorMessage: null,
      )),
      onError: (error, _) => emit(state.copyWith(
        isLoading: false,
        errorMessage: error.toString(),
      )),
    );
  }

  Future<void> _onCreateRequested(
    JobsCreateRequested event,
    Emitter<JobsState> emit,
  ) async {
    emit(state.copyWith(
      isSubmitting: true,
      errorMessage: null,
      infoMessage: null,
    ));

    final result = await createJob(
      CreateJobParams(
        recruiterId: event.recruiterId,
        recruiterName: event.recruiterName,
        recruiterAvatarUrl: event.recruiterAvatarUrl,
        title: event.title,
        description: event.description,
        skills: event.skills,
        jobType: event.jobType,
        salaryRange: event.salaryRange,
        location: event.location,
        formUrl: event.formUrl,
      ),
    );

    result.fold(
      (failure) => emit(state.copyWith(
        isSubmitting: false,
        errorMessage: _mapFailure(failure),
      )),
      (_) => emit(state.copyWith(
        isSubmitting: false,
        infoMessage: 'Job posted successfully.',
      )),
    );
  }

  Future<void> _onDeleteRequested(
    JobsDeleteRequested event,
    Emitter<JobsState> emit,
  ) async {
    emit(state.copyWith(
      isSubmitting: true,
      errorMessage: null,
      infoMessage: null,
    ));

    final result = await deleteJob(DeleteJobParams(event.jobId));

    result.fold(
      (failure) => emit(state.copyWith(
        isSubmitting: false,
        errorMessage: _mapFailure(failure),
      )),
      (_) => emit(state.copyWith(
        isSubmitting: false,
        infoMessage: 'Job deleted.',
      )),
    );
  }

  Future<void> _onApplyRequested(
    JobsApplyRequested event,
    Emitter<JobsState> emit,
  ) async {
    emit(state.copyWith(
      isApplying: true,
      errorMessage: null,
      infoMessage: null,
    ));

    final result = await applyToJob(
      ApplyToJobParams(
        jobId: event.jobId,
        recruiterId: event.recruiterId,
        studentId: event.studentId,
        studentName: event.studentName,
      ),
    );

    result.fold(
      (failure) => emit(state.copyWith(
        isApplying: false,
        errorMessage: _mapFailure(failure),
      )),
      (_) => emit(state.copyWith(
        isApplying: false,
        infoMessage: 'Application submitted successfully.',
      )),
    );
  }

  void _onClearMessage(
    JobsClearMessage event,
    Emitter<JobsState> emit,
  ) {
    emit(state.copyWith(errorMessage: null, infoMessage: null));
  }

  String _mapFailure(Failure failure) => failure.message;

  // ❌ REMOVED: close() override — no manual subscription to cancel anymore.
}