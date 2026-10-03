import '../entities/app_user.dart';
import '../repositories/auth_repository.dart';

class WatchAuthState {
  WatchAuthState(this.repository);

  final AuthRepository repository;

  Stream<AppUser?> call() {
    return repository.watchAuthState();
  }
}
