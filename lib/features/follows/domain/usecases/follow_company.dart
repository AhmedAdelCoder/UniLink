import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/follows_repository.dart';

class FollowCompany implements UseCase<void, FollowCompanyParams> {
  FollowCompany(this.repository);

  final FollowsRepository repository;

  @override
  Future<Either<Failure, void>> call(FollowCompanyParams params) {
    return repository.followCompany(
      studentId: params.studentId,
      companyId: params.companyId,
    );
  }
}

class FollowCompanyParams {
  const FollowCompanyParams({
    required this.studentId,
    required this.companyId,
  });

  final String studentId;
  final String companyId;
}
