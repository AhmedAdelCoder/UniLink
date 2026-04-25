import '../entities/job.dart';
import '../repositories/jobs_repository.dart';

class StreamFollowedJobs {
  StreamFollowedJobs(this.repository);

  final JobsRepository repository;

  Stream<List<Job>> call(String studentId) {
    return repository.streamFollowedJobs(studentId);
  }
}
