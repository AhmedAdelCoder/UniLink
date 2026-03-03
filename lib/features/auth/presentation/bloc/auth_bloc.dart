import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../../domain/entities/app_user.dart';
import '../../domain/usecases/get_current_user.dart';
import '../../domain/usecases/login.dart';
import '../../domain/usecases/logout.dart';
import '../../domain/usecases/register.dart';
import '../../domain/usecases/reset_password.dart';

part 'auth_event.dart';
part 'auth_state.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final Login login;
  final Register register;
  final ResetPassword resetPassword;
  final GetCurrentUser getCurrentUser;
  final Logout logout;

  AuthBloc({
    required this.login,
    required this.register,
    required this.resetPassword,
    required this.getCurrentUser,
    required this.logout,
  }) : super(const AuthState.initial()) {
    on<AuthCheckRequested>(_onAuthCheckRequested);
    on<AuthLoginRequested>(_onLoginRequested);
    on<AuthRegisterRequested>(_onRegisterRequested);
    on<AuthResetPasswordRequested>(_onResetPasswordRequested);
    on<AuthLogoutRequested>(_onLogoutRequested);
  }

  Future<void> _onAuthCheckRequested(
    AuthCheckRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(state.copyWith(status: AuthStatus.loading, errorMessage: null));

    final result = await getCurrentUser(NoParams());

    result.fold(
      (failure) => emit(
        state.copyWith(
          status: AuthStatus.unauthenticated,
          user: null,
          errorMessage: _mapFailureToMessage(failure),
        ),
      ),
      (user) => emit(
        state.copyWith(
          status: AuthStatus.authenticated,
          user: user,
          errorMessage: null,
        ),
      ),
    );
  }

  Future<void> _onLoginRequested(
    AuthLoginRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(state.copyWith(status: AuthStatus.loading, errorMessage: null));

    final result = await login(
      LoginParams(
        email: event.email,
        password: event.password,
      ),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          status: AuthStatus.failure,
          errorMessage: _mapFailureToMessage(failure),
        ),
      ),
      (user) => emit(
        state.copyWith(
          status: AuthStatus.authenticated,
          user: user,
          errorMessage: null,
        ),
      ),
    );
  }

  Future<void> _onRegisterRequested(
    AuthRegisterRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(state.copyWith(status: AuthStatus.loading, errorMessage: null));

    final result = await register(
      RegisterParams(
        name: event.name,
        email: event.email,
        password: event.password,
        role: event.role,
      ),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          status: AuthStatus.failure,
          errorMessage: _mapFailureToMessage(failure),
        ),
      ),
      (user) => emit(
        state.copyWith(
          status: AuthStatus.authenticated,
          user: user,
          errorMessage: null,
        ),
      ),
    );
  }

  Future<void> _onResetPasswordRequested(
    AuthResetPasswordRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(state.copyWith(status: AuthStatus.loading, errorMessage: null));

    final result = await resetPassword(
      ResetPasswordParams(event.email),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          status: AuthStatus.failure,
          errorMessage: _mapFailureToMessage(failure),
        ),
      ),
      (_) => emit(
        state.copyWith(
          status: AuthStatus.passwordResetEmailSent,
          errorMessage: null,
        ),
      ),
    );
  }

  Future<void> _onLogoutRequested(
    AuthLogoutRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(state.copyWith(status: AuthStatus.loading, errorMessage: null));

    final result = await logout(NoParams());

    result.fold(
      (failure) => emit(
        state.copyWith(
          status: AuthStatus.failure,
          errorMessage: _mapFailureToMessage(failure),
        ),
      ),
      (_) => emit(
        state.copyWith(
          status: AuthStatus.unauthenticated,
          user: null,
          errorMessage: null,
        ),
      ),
    );
  }

  String _mapFailureToMessage(Failure failure) {
    return failure.message;
  }
}