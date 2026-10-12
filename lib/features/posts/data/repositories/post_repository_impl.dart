import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../domain/entities/comment.dart';
import '../../domain/entities/post.dart';
import '../../domain/repositories/post_repository.dart';
import '../datasources/posts_remote_datasource.dart';

class PostRepositoryImpl implements PostRepository {
  final PostsRemoteDataSource remoteDataSource;

  PostRepositoryImpl({required this.remoteDataSource});

  @override
  Future<Either<Failure, List<Post>>> getFeedPage({
    Post? lastPost,
    int limit = 10,
  }) async {
    try {
      final posts = await remoteDataSource.getFeedPage(
        lastPost: lastPost,
        limit: limit,
      );
      return Right(posts);
    } catch (e) {
      return Left(_mapExceptionToFailure(e));
    }
  }

  @override
  Future<Either<Failure, Post>> createPost({
    required String text,
    List<String> skillsTags = const [],
    String? imageFilePath,
  }) async {
    try {
      final post = await remoteDataSource.createPost(
        text: text,
        skillsTags: skillsTags,
        imageFilePath: imageFilePath,
      );
      return Right(post);
    } catch (e) {
      return Left(_mapExceptionToFailure(e));
    }
  }

  @override
  Future<Either<Failure, void>> deletePost(String postId) async {
    try {
      await remoteDataSource.deletePost(postId);
      return const Right(null);
    } catch (e) {
      return Left(_mapExceptionToFailure(e));
    }
  }

  @override
  Future<Either<Failure, void>> likePost(String postId) async {
    try {
      await remoteDataSource.likePost(postId);
      return const Right(null);
    } catch (e) {
      return Left(_mapExceptionToFailure(e));
    }
  }

  @override
  Future<Either<Failure, void>> unlikePost(String postId) async {
    try {
      await remoteDataSource.unlikePost(postId);
      return const Right(null);
    } catch (e) {
      return Left(_mapExceptionToFailure(e));
    }
  }

  @override
  Future<Either<Failure, List<Comment>>> getComments({
    required String postId,
    Comment? lastComment,
    int limit = 20,
  }) async {
    try {
      final comments = await remoteDataSource.getComments(
        postId: postId,
        lastComment: lastComment,
        limit: limit,
      );
      return Right(comments);
    } catch (e) {
      return Left(_mapExceptionToFailure(e));
    }
  }

  @override
  Future<Either<Failure, Comment>> addComment({
    required String postId,
    required String text,
  }) async {
    try {
      final comment = await remoteDataSource.addComment(
        postId: postId,
        text: text,
      );
      return Right(comment);
    } catch (e) {
      return Left(_mapExceptionToFailure(e));
    }
  }

  Failure _mapExceptionToFailure(Object e) {
    if (e is Failure) return e;

    String? message;
    try {
      message = (e as dynamic).message as String?;
    } catch (_) {}

    final raw = message ?? e.toString();
    final clean =
        raw.replaceFirst(RegExp(r'^[A-Za-z0-9_]*Exception:? *'), '').trim();
    final finalMessage = clean.isNotEmpty ? clean : 'Unexpected error occurred';

    final lower = finalMessage.toLowerCase();
    if (lower.contains('auth') ||
        lower.contains('not logged in') ||
        lower.contains('not authenticated')) {
      return AuthFailure(finalMessage);
    }
    return ServerFailure(finalMessage);
  }
}
