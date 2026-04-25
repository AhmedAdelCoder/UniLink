import 'package:dartz/dartz.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../entities/app_user.dart';
import '../repositories/auth_repository.dart';

class GetCurrentUser implements UseCase<AppUser, NoParams> {
  final AuthRepository repository;

  GetCurrentUser(this.repository);

  @override
  Future<Either<Failure, AppUser>> call(NoParams params) async {
    try {
      final currentUser = fb.FirebaseAuth.instance.currentUser;

      if (currentUser == null) {
        return const Left(AuthFailure('No user logged in'));
      }

      final user = await repository.getCurrentUser();
      return user;
    } catch (e) {
      return const Left(ServerFailure('Failed to get current user'));
    }
  }
}