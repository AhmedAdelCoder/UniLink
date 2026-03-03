import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dartz/dartz.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;

import '../../../../core/errors/failures.dart';
import '../../domain/entities/app_user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_datasource.dart';

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDataSource remoteDataSource;

  AuthRepositoryImpl({required this.remoteDataSource});

  @override
  Future<Either<Failure, AppUser>> register({
    required String name,
    required String email,
    required String password,
    required UserRole role,
  }) async {
    try {
      final user = await remoteDataSource.register(
        name: name,
        email: email,
        password: password,
        role: role,
      );
      return Right(user);
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(_mapFirebaseAuthError(e)));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected error occurred'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, AppUser>> login({
    required String email,
    required String password,
  }) async {
    try {
      final user = await remoteDataSource.login(
        email: email,
        password: password,
      );
      return Right(user);
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(_mapFirebaseAuthError(e)));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected error occurred'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, void>> resetPassword({required String email}) async {
    try {
      await remoteDataSource.resetPassword(email: email);
      return const Right(null);
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(_mapFirebaseAuthError(e)));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected error occurred'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, void>> logout() async {
    try {
      await remoteDataSource.logout();
      return const Right(null);
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(_mapFirebaseAuthError(e)));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected error occurred'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, AppUser>> getCurrentUser() async {
    try {
      final user = await remoteDataSource.getCurrentUser();
      return Right(user);
    } on fb.FirebaseAuthException catch (e) {
      if (e.code == 'user-not-logged-in') {
        return const Left(AuthFailure('No user logged in'));
      }
      return Left(AuthFailure(_mapFirebaseAuthError(e)));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected error occurred'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  String _mapFirebaseAuthError(fb.FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-email':
        return 'The email address is badly formatted.';
      case 'user-disabled':
        return 'This user has been disabled.';
      case 'user-not-found':
        return 'No user found for that email.';
      case 'wrong-password':
        return 'Wrong password provided.';
      case 'email-already-in-use':
        return 'An account already exists for that email.';
      case 'weak-password':
        return 'The password is too weak.';
      case 'too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return e.message ?? 'Authentication failed. Please try again.';
    }
  }
}

