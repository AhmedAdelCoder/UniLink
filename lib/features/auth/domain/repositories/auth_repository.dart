import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../entities/app_user.dart';

abstract class AuthRepository {
  Future<Either<Failure, AppUser>> register({
    required String name,
    required String email,
    required String password,
    required UserRole role,
  });

  /// Returns true if an account already exists for [email].
  /// Uses Firebase Auth sign-in methods to avoid throwing during registration.
  Future<Either<Failure, bool>> isEmailRegistered({required String email});

  Future<Either<Failure, AppUser>> login({
    required String email,
    required String password,
  });

  Future<Either<Failure, void>> resetPassword({
    required String email,
  });

  Future<Either<Failure, void>> logout();

  Future<Either<Failure, AppUser>> getCurrentUser();
}

