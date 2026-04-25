import '../entities/job.dart';
import '../repositories/jobs_repository.dart';

class StreamCompanyJobs {
  StreamCompanyJobs(this.repository);

  final JobsRepository repository;

  Stream<List<Job>> call(String companyId) {
    return repository.streamCompanyJobs(companyId);
  }
}
