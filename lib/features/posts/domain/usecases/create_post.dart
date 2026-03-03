import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../entities/post.dart';
import '../repositories/post_repository.dart';

class CreatePost implements UseCase<Post, CreatePostParams> {
  final PostRepository repository;

  CreatePost(this.repository);

  @override
  Future<Either<Failure, Post>> call(CreatePostParams params) {
    return repository.createPost(
      text: params.text,
      skillsTags: params.skillsTags,
      imageFilePath: params.imageFilePath,
    );
  }
}

class CreatePostParams {
  final String text;
  final List<String> skillsTags;
  final String? imageFilePath;

  const CreatePostParams({
    required this.text,
    this.skillsTags = const [],
    this.imageFilePath,
  });
}

