import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../entities/comment.dart';
import '../entities/post.dart';

abstract class PostRepository {
  Future<Either<Failure, List<Post>>> getFeedPage({
    Post? lastPost,
    int limit = 10,
  });

  Future<Either<Failure, Post>> createPost({
    required String text,
    List<String> skillsTags,
    String? imageFilePath,
  });

  Future<Either<Failure, void>> deletePost(String postId);

  Future<Either<Failure, void>> likePost(String postId);

  Future<Either<Failure, void>> unlikePost(String postId);

  Future<Either<Failure, List<Comment>>> getComments({
    required String postId,
    Comment? lastComment,
    int limit = 20,
  });

  Future<Either<Failure, Comment>> addComment({
    required String postId,
    required String text,
  });
}

