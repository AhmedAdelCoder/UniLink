import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/post_repository.dart';

class UnlikePost implements UseCase<void, UnlikePostParams> {
  final PostRepository repository;

  UnlikePost(this.repository);

  @override
  Future<Either<Failure, void>> call(UnlikePostParams params) {
    return repository.unlikePost(params.postId);
  }
}

class UnlikePostParams {
  final String postId;

  const UnlikePostParams(this.postId);
}

