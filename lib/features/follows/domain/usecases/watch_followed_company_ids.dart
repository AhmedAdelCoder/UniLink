import '../repositories/follows_repository.dart';

class WatchFollowedCompanyIds {
  WatchFollowedCompanyIds(this.repository);

  final FollowsRepository repository;

  Stream<List<String>> call(String studentId) {
    return repository.watchFollowedCompanyIds(studentId);
  }
}
