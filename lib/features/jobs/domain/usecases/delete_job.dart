import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/jobs_repository.dart';

class DeleteJob implements UseCase<void, DeleteJobParams> {
  DeleteJob(this.repository);

  final JobsRepository repository;

  @override
  Future<Either<Failure, void>> call(DeleteJobParams params) {
    return repository.deleteJob(params.jobId);
  }
}

class DeleteJobParams {
  const DeleteJobParams(this.jobId);

  final String jobId;
}
