import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../entities/job.dart';
import '../repositories/jobs_repository.dart';

class StreamRecruiterJobs {
  StreamRecruiterJobs(this.repository);

  final JobsRepository repository;

  Stream<List<Job>> call(String recruiterId) {
    return repository.streamRecruiterJobs(recruiterId);
  }
}

