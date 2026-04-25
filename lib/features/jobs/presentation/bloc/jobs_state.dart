part of 'jobs_bloc.dart';

class JobsState extends Equatable {
  const JobsState({
    required this.jobs,
    required this.isLoading,
    required this.isSubmitting,
    required this.isApplying,
    required this.errorMessage,
    required this.infoMessage,
  });

  const JobsState.initial()
      : jobs = const [],
        isLoading = false,
        isSubmitting = false,
        isApplying = false,
        errorMessage = null,
        infoMessage = null;

  final List<Job> jobs;
  final bool isLoading;
  final bool isSubmitting;
  final bool isApplying;
  final String? errorMessage;
  final String? infoMessage;

  JobsState copyWith({
    List<Job>? jobs,
    bool? isLoading,
    bool? isSubmitting,
    bool? isApplying,
    String? errorMessage,
    String? infoMessage,
  }) {
    return JobsState(
      
      jobs: jobs ?? this.jobs,
      isLoading: isLoading ?? this.isLoading,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      isApplying: isApplying ?? this.isApplying,
      errorMessage: errorMessage,
      infoMessage: infoMessage,
    );
  }

  @override
  List<Object?> get props => [
        jobs,
        isLoading,
        isSubmitting,
        isApplying,
        errorMessage,
        infoMessage,
      ];
}
