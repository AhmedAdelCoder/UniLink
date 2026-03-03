import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../entities/comment.dart';
import '../repositories/post_repository.dart';

class AddComment implements UseCase<Comment, AddCommentParams> {
  final PostRepository repository;

  AddComment(this.repository);

  @override
  Future<Either<Failure, Comment>> call(AddCommentParams params) {
    return repository.addComment(
      postId: params.postId,
      text: params.text,
    );
  }
}

class AddCommentParams {
  final String postId;
  final String text;

  const AddCommentParams({
    required this.postId,
    required this.text,
  });
}

