import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../entities/app_user.dart';
import '../repositories/auth_repository.dart';

class Register implements UseCase<AppUser, RegisterParams> {
  final AuthRepository repository;

  Register(this.repository);

  @override
  Future<Either<Failure, AppUser>> call(RegisterParams params) {
    return repository.register(
      name: params.name,
      email: params.email,
      password: params.password,
      role: params.role,
    );
  }
}

class RegisterParams {
  final String name;
  final String email;
  final String password;
  final UserRole role;

  const RegisterParams({
    required this.name,
    required this.email,
    required this.password,
    required this.role,
  });
}

