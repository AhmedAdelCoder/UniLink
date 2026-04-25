import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';

abstract class FollowsRepository {
  Stream<List<String>> watchFollowedCompanyIds(String studentId);
  Stream<bool> watchIsFollowing({
    required String studentId,
    required String companyId,
  });
  Future<Either<Failure, void>> followCompany({
    required String studentId,
    required String companyId,
  });
  Future<Either<Failure, void>> unfollowCompany({
    required String studentId,
    required String companyId,
  });
}
