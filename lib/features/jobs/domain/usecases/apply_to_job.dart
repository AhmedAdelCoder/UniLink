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
      recruiterId: params.recruiterId,
      studentId: params.studentId,
      studentName: params.studentName,
    );
  }
}

class ApplyToJobParams {
  const ApplyToJobParams({
    required this.jobId,
    required this.recruiterId,
    required this.studentId,
    required this.studentName,
  });

  final String jobId;
  final String recruiterId;
  final String studentId;
  final String studentName;
}