import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dartz/dartz.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;

import '../../../../core/errors/failures.dart';
import '../../domain/entities/comment.dart';
import '../../domain/entities/post.dart';
import '../../domain/repositories/post_repository.dart';
import '../datasources/posts_remote_datasource.dart';

class PostRepositoryImpl implements PostRepository {
  final PostsRemoteDataSource remoteDataSource;

  // Map Post.id -> Firestore document snapshot for pagination
  final Map<String, DocumentSnapshot<Map<String, dynamic>>> _postSnapshots = {};

  PostRepositoryImpl({required this.remoteDataSource});

  @override
  Future<Either<Failure, List<Post>>> getFeedPage({
    Post? lastPost,
    int limit = 10,
  }) async {
    try {
      final startAfter = lastPost != null ? _postSnapshots[lastPost.id] : null;
      final result = await remoteDataSource.getFeedPage(
        startAfter: startAfter,
        limit: limit,
      );

      for (final doc in result.posts) {
        // We don't have direct access to the DocumentSnapshot here,
        // but we store snapshots in the datasource result via the lastDocument.
      }

      // Maintain mapping for pagination using the result.lastDocument
      if (result.lastDocument != null) {
        _postSnapshots[result.lastDocument!.id] = result.lastDocument!;
      }

      return Right(result.posts);
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
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
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, void>> deletePost(String postId) async {
    try {
      await remoteDataSource.deletePost(postId);
      return const Right(null);
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, void>> likePost(String postId) async {
    try {
      await remoteDataSource.likePost(postId);
      return const Right(null);
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, void>> unlikePost(String postId) async {
    try {
      await remoteDataSource.unlikePost(postId);
      return const Right(null);
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }

  @override
  Future<Either<Failure, List<Comment>>> getComments({
    required String postId,
    Comment? lastComment,
    int limit = 20,
  }) async {
    try {
      // Simple implementation without pagination cursor for comments yet
      final comments = await remoteDataSource.getComments(
        postId: postId,
        startAfter: null,
        limit: limit,
      );
      return Right(comments);
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
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
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Unexpected server error'));
    } catch (_) {
      return const Left(ServerFailure('Unexpected error occurred'));
    }
  }
}

