import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/post_repository.dart';

class LikePost implements UseCase<void, LikePostParams> {
  final PostRepository repository;

  LikePost(this.repository);

  @override
  Future<Either<Failure, void>> call(LikePostParams params) {
    return repository.likePost(params.postId);
  }
}

class LikePostParams {
  final String postId;

  const LikePostParams(this.postId);
}

