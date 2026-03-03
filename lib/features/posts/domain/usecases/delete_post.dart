import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/post_repository.dart';

class DeletePost implements UseCase<void, DeletePostParams> {
  final PostRepository repository;

  DeletePost(this.repository);

  @override
  Future<Either<Failure, void>> call(DeletePostParams params) {
    return repository.deletePost(params.postId);
  }
}

class DeletePostParams {
  final String postId;

  const DeletePostParams(this.postId);
}

