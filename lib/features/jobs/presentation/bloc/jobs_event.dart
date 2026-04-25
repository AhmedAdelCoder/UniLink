part of 'jobs_bloc.dart';

abstract class JobsEvent extends Equatable {
  const JobsEvent();

  @override
  List<Object?> get props => [];
}

class JobsStartFeed extends JobsEvent {
  const JobsStartFeed(this.studentId);

  final String studentId;

  @override
  List<Object?> get props => [studentId];
}

class JobsStartRecruiterJobs extends JobsEvent {
  const JobsStartRecruiterJobs(this.companyId);

  final String companyId;

  @override
  List<Object?> get props => [companyId];
}

class JobsDataUpdated extends JobsEvent {
  const JobsDataUpdated(this.jobs);

  final List<Job> jobs;

  @override
  List<Object?> get props => [jobs];
}

class JobsCreateRequested extends JobsEvent {
  const JobsCreateRequested({
    required this.title,
    required this.description,
    required this.skills,
    required this.jobType,
    required this.salaryRange,
    required this.location,
  });

  final String title;
  final String description;
  final List<String> skills;
  final String jobType;
  final String salaryRange;
  final String location;

  @override
  List<Object?> get props => [
        title,
        description,
        skills,
        jobType,
        salaryRange,
        location,
      ];
}

class JobsDeleteRequested extends JobsEvent {
  const JobsDeleteRequested(this.jobId);

  final String jobId;

  @override
  List<Object?> get props => [jobId];
}

class JobsApplyRequested extends JobsEvent {
  const JobsApplyRequested({
    required this.jobId,
    required this.cvFilePath,
    this.message = '',
  });

  final String jobId;
  final String cvFilePath;
  final String message;

  @override
  List<Object?> get props => [jobId, cvFilePath, message];
}

class JobsClearMessage extends JobsEvent {
  const JobsClearMessage();
}
