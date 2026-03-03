import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/auth_repository.dart';

class ResetPassword implements UseCase<void, ResetPasswordParams> {
  final AuthRepository repository;

  ResetPassword(this.repository);

  @override
  Future<Either<Failure, void>> call(ResetPasswordParams params) {
    return repository.resetPassword(email: params.email);
  }
}

class ResetPasswordParams {
  final String email;

  const ResetPasswordParams(this.email);
}

