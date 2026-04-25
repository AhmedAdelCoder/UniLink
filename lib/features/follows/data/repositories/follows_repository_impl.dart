import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../domain/repositories/follows_repository.dart';
import '../follows_remote_datasource.dart';

class FollowsRepositoryImpl implements FollowsRepository {
  FollowsRepositoryImpl({required this.remoteDataSource});

  final FollowsRemoteDataSource remoteDataSource;

  @override
  Stream<List<String>> watchFollowedCompanyIds(String studentId) {
    return remoteDataSource.watchFollowedCompanyIds(studentId);
  }

  @override
  Stream<bool> watchIsFollowing({
    required String studentId,
    required String companyId,
  }) {
    return remoteDataSource.watchIsFollowing(
      studentId: studentId,
      companyId: companyId,
    );
  }

  @override
  Future<Either<Failure, void>> followCompany({
    required String studentId,
    required String companyId,
  }) async {
    try {
      await remoteDataSource.followCompany(
        studentId: studentId,
        companyId: companyId,
      );
      return const Right(null);
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, void>> unfollowCompany({
    required String studentId,
    required String companyId,
  }) async {
    try {
      await remoteDataSource.unfollowCompany(
        studentId: studentId,
        companyId: companyId,
      );
      return const Right(null);
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }
}
