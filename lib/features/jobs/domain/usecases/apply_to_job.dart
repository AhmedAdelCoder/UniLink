import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/jobs_repository.dart';

class ApplyToJob implements UseCase<void, ApplyToJobParams> {
  ApplyToJob(this.repository);

  final JobsRepository repository;

  @override
  Future<Either<Failure, void>> call(ApplyToJobParams params) {
    return repository.applyToJob(
      jobId: params.jobId,
      message: params.message,
      cvFilePath: params.cvFilePath,
    );
  }
}

class ApplyToJobParams {
  const ApplyToJobParams({
    required this.jobId,
    required this.message,
    required this.cvFilePath,
  });

  final String jobId;
  final String message;
  final String cvFilePath;
}
