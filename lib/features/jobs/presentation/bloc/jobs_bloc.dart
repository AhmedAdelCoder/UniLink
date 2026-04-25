import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../../core/errors/failures.dart';
import '../../domain/entities/job.dart';
import '../../domain/usecases/apply_to_job.dart';
import '../../domain/usecases/create_job.dart';
import '../../domain/usecases/delete_job.dart';
import '../../domain/usecases/stream_company_jobs.dart';
import '../../domain/usecases/stream_followed_jobs.dart';

part 'jobs_event.dart';
part 'jobs_state.dart';

class JobsBloc extends Bloc<JobsEvent, JobsState> {
  JobsBloc({
    required this.streamFollowedJobs,
    required this.streamCompanyJobs,
    required this.createJob,
    required this.deleteJob,
    required this.applyToJob,
  }) : super(const JobsState.initial()) {
    on<JobsStartFeed>(_onStartFeed);
    on<JobsStartRecruiterJobs>(_onStartRecruiterJobs);
    on<JobsDataUpdated>(_onDataUpdated);
    on<JobsCreateRequested>(_onCreateRequested);
    on<JobsDeleteRequested>(_onDeleteRequested);
    on<JobsApplyRequested>(_onApplyRequested);
    on<JobsClearMessage>(_onClearMessage);
  }

  final StreamFollowedJobs streamFollowedJobs;
  final StreamCompanyJobs streamCompanyJobs;
  final CreateJob createJob;
  final DeleteJob deleteJob;
  final ApplyToJob applyToJob;

  StreamSubscription<List<Job>>? _jobsSubscription;

  Future<void> _onStartFeed(
    JobsStartFeed event,
    Emitter<JobsState> emit,
  ) async {
    await _jobsSubscription?.cancel();
    emit(state.copyWith(isLoading: true, errorMessage: null));

    _jobsSubscription = streamFollowedJobs(event.studentId).listen(
      (jobs) => add(JobsDataUpdated(jobs)),
      onError: (Object error) {
        addError(error, StackTrace.current);
      },
    );
  }

  Future<void> _onStartRecruiterJobs(
    JobsStartRecruiterJobs event,
    Emitter<JobsState> emit,
  ) async {
    await _jobsSubscription?.cancel();
    emit(state.copyWith(isLoading: true, errorMessage: null));

    _jobsSubscription = streamCompanyJobs(event.companyId).listen(
      (jobs) => add(JobsDataUpdated(jobs)),
      onError: (Object error) {
        addError(error, StackTrace.current);
      },
    );
  }

  void _onDataUpdated(
    JobsDataUpdated event,
    Emitter<JobsState> emit,
  ) {
    emit(
      state.copyWith(
        isLoading: false,
        jobs: event.jobs,
        errorMessage: null,
      ),
    );
  }

  Future<void> _onCreateRequested(
    JobsCreateRequested event,
    Emitter<JobsState> emit,
  ) async {
    emit(state.copyWith(isSubmitting: true, errorMessage: null, infoMessage: null));
    final result = await createJob(
      CreateJobParams(
        title: event.title,
        description: event.description,
        skills: event.skills,
        jobType: event.jobType,
        salaryRange: event.salaryRange,
        location: event.location,
      ),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          isSubmitting: false,
          errorMessage: _mapFailure(failure),
        ),
      ),
      (_) => emit(
        state.copyWith(
          isSubmitting: false,
          infoMessage: 'Job posted successfully.',
        ),
      ),
    );
  }

  Future<void> _onDeleteRequested(
    JobsDeleteRequested event,
    Emitter<JobsState> emit,
  ) async {
    emit(state.copyWith(isSubmitting: true, errorMessage: null, infoMessage: null));
    final result = await deleteJob(DeleteJobParams(event.jobId));
    result.fold(
      (failure) => emit(
        state.copyWith(
          isSubmitting: false,
          errorMessage: _mapFailure(failure),
        ),
      ),
      (_) => emit(
        state.copyWith(
          isSubmitting: false,
          infoMessage: 'Job deleted.',
        ),
      ),
    );
  }

  Future<void> _onApplyRequested(
    JobsApplyRequested event,
    Emitter<JobsState> emit,
  ) async {
    emit(state.copyWith(isApplying: true, errorMessage: null, infoMessage: null));
    final result = await applyToJob(
      ApplyToJobParams(
        jobId: event.jobId,
        message: event.message,
        cvFilePath: event.cvFilePath,
      ),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          isApplying: false,
          errorMessage: _mapFailure(failure),
        ),
      ),
      (_) => emit(
        state.copyWith(
          isApplying: false,
          infoMessage: 'Application submitted successfully.',
        ),
      ),
    );
  }

  void _onClearMessage(
    JobsClearMessage event,
    Emitter<JobsState> emit,
  ) {
    emit(
      state.copyWith(
        errorMessage: null,
        infoMessage: null,
      ),
    );
  }

  String _mapFailure(Failure failure) => failure.message;

  @override
  Future<void> close() async {
    await _jobsSubscription?.cancel();
    return super.close();
  }
}
