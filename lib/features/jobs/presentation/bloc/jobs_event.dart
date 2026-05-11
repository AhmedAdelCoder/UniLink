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
  const JobsStartRecruiterJobs(this.recruiterId);
  final String recruiterId;

  @override
  List<Object?> get props => [recruiterId];
}

class JobsDataUpdated extends JobsEvent {
  const JobsDataUpdated(this.jobs);
  final List<Job> jobs;

  @override
  List<Object?> get props => [jobs];
}

class JobsCreateRequested extends JobsEvent {
  const JobsCreateRequested({
    required this.recruiterId,
    required this.recruiterName,
    this.recruiterAvatarUrl,
    required this.title,
    required this.description,
    required this.skills,
    required this.jobType,
    required this.salaryRange,
    required this.location,
    this.formUrl,
  });

  final String recruiterId;
  final String recruiterName;
  final String? recruiterAvatarUrl;
  final String title;
  final String description;
  final List<String> skills;
  final String jobType;
  final String salaryRange;
  final String location;
  final String? formUrl;

  @override
  List<Object?> get props => [
        recruiterId,
        recruiterName,
        recruiterAvatarUrl,
        title,
        description,
        skills,
        jobType,
        salaryRange,
        location,
        formUrl,
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
    required this.recruiterId,
    required this.studentId,
    required this.studentName,
  });

  final String jobId;
  final String recruiterId;
  final String studentId;
  final String studentName;

  @override
  List<Object?> get props => [jobId, recruiterId, studentId, studentName];
}

class JobsUpdateApplicationStatus extends JobsEvent {
  const JobsUpdateApplicationStatus({
    required this.applicationId,
    required this.status,
  });

  final String applicationId;
  final String status;

  @override
  List<Object?> get props => [applicationId, status];
}

class JobsClearMessage extends JobsEvent {
  const JobsClearMessage();
}