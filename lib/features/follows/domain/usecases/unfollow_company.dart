import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/follows_repository.dart';

class UnfollowCompany implements UseCase<void, UnfollowCompanyParams> {
  UnfollowCompany(this.repository);

  final FollowsRepository repository;

  @override
  Future<Either<Failure, void>> call(UnfollowCompanyParams params) {
    return repository.unfollowCompany(
      studentId: params.studentId,
      companyId: params.companyId,
    );
  }
}

class UnfollowCompanyParams {
  const UnfollowCompanyParams({
    required this.studentId,
    required this.companyId,
  });

  final String studentId;
  final String companyId;
}
