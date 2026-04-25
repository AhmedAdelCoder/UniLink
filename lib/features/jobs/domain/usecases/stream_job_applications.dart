import '../entities/job_application.dart';
import '../repositories/jobs_repository.dart';

class StreamJobApplications {
  StreamJobApplications(this.repository);

  final JobsRepository repository;

  Stream<List<JobApplication>> call(String jobId) {
    return repository.streamApplicationsForJob(jobId);
  }
}
