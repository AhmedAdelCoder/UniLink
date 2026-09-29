import 'package:flutter_test/flutter_test.dart';
import 'package:dartz/dartz.dart';
import 'package:unilink/core/errors/failures.dart';
import 'package:unilink/features/posts/data/datasources/posts_remote_datasource.dart';
import 'package:unilink/features/posts/data/models/comment_model.dart';
import 'package:unilink/features/posts/data/models/post_model.dart';
import 'package:unilink/features/posts/data/repositories/post_repository_impl.dart';
import 'package:unilink/features/posts/domain/entities/comment.dart';
import 'package:unilink/features/posts/domain/entities/post.dart';

class FakePostsRemoteDataSource implements PostsRemoteDataSource {
  Post? lastPostPassed;
  int? limitPassed;
  List<PostModel> postsToReturn = [];
  Exception? exceptionToThrow;

  String? lastCommentPostIdPassed;
  Comment? lastCommentPassed;
  List<CommentModel> commentsToReturn = [];

  String? createdTextPassed;
  List<String>? createdSkillsPassed;
  String? createdImagePathPassed;
  PostModel? postToReturn;

  String? deletedPostIdPassed;
  String? likedPostIdPassed;
  String? unlikedPostIdPassed;

  String? addedCommentPostIdPassed;
  String? addedCommentTextPassed;
  CommentModel? commentToReturn;

  @override
  Future<List<PostModel>> getFeedPage({
    Post? lastPost,
    int limit = 10,
  }) async {
    lastPostPassed = lastPost;
    limitPassed = limit;
    if (exceptionToThrow != null) throw exceptionToThrow!;
    return postsToReturn;
  }

  @override
  Stream<List<PostModel>> getFeedStream() {
    return Stream.value(postsToReturn);
  }

  @override
  Future<PostModel> createPost({
    required String text,
    List<String> skillsTags = const [],
    String? imageFilePath,
  }) async {
    createdTextPassed = text;
    createdSkillsPassed = skillsTags;
    createdImagePathPassed = imageFilePath;
    if (exceptionToThrow != null) throw exceptionToThrow!;
    return postToReturn!;
  }

  @override
  Future<void> deletePost(String postId) async {
    deletedPostIdPassed = postId;
    if (exceptionToThrow != null) throw exceptionToThrow!;
  }

  @override
  Future<void> likePost(String postId) async {
    likedPostIdPassed = postId;
    if (exceptionToThrow != null) throw exceptionToThrow!;
  }

  @override
  Future<void> unlikePost(String postId) async {
    unlikedPostIdPassed = postId;
    if (exceptionToThrow != null) throw exceptionToThrow!;
  }

  @override
  Future<List<CommentModel>> getComments({
    required String postId,
    Comment? lastComment,
    int limit = 20,
  }) async {
    lastCommentPostIdPassed = postId;
    lastCommentPassed = lastComment;
    if (exceptionToThrow != null) throw exceptionToThrow!;
    return commentsToReturn;
  }

  @override
  Future<CommentModel> addComment({
    required String postId,
    required String text,
  }) async {
    addedCommentPostIdPassed = postId;
    addedCommentTextPassed = text;
    if (exceptionToThrow != null) throw exceptionToThrow!;
    return commentToReturn!;
  }
}

void main() {
  late FakePostsRemoteDataSource fakeDataSource;
  late PostRepositoryImpl repository;

  final tPost = PostModel(
    id: 'post_1',
    authorId: 'author_1',
    authorName: 'Test Author',
    text: 'Hello world',
    skillsTags: const ['Flutter', 'Dart'],
    likeCount: 5,
    commentCount: 2,
    createdAt: DateTime(2026, 1, 1),
  );

  final tComment = CommentModel(
    id: 'comment_1',
    postId: 'post_1',
    userId: 'user_1',
    userName: 'Commenter',
    text: 'Great post!',
    createdAt: DateTime(2026, 1, 1),
  );

  setUp(() {
    fakeDataSource = FakePostsRemoteDataSource();
    repository = PostRepositoryImpl(remoteDataSource: fakeDataSource);
  });

  group('getFeedPage', () {
    test('delegates lastPost and limit to datasource and returns Right(posts)', () async {
      fakeDataSource.postsToReturn = [tPost];

      final result = await repository.getFeedPage(lastPost: tPost, limit: 15);

      expect(fakeDataSource.lastPostPassed, equals(tPost));
      expect(fakeDataSource.limitPassed, equals(15));
      expect(result.isRight(), isTrue);
      expect(result.getOrElse(() => []), equals([tPost]));
    });

    test('returns Left(ServerFailure) when datasource throws generic exception', () async {
      fakeDataSource.exceptionToThrow = Exception('Database unreachable');

      final result = await repository.getFeedPage();

      expect(result.isLeft(), isTrue);
      result.fold(
        (failure) {
          expect(failure, isA<ServerFailure>());
          expect(failure.message, contains('Database unreachable'));
        },
        (_) => fail('Should return Left'),
      );
    });

    test('returns Left(AuthFailure) when datasource throws auth exception', () async {
      fakeDataSource.exceptionToThrow = Exception('User is not authenticated');

      final result = await repository.getFeedPage();

      expect(result.isLeft(), isTrue);
      result.fold(
        (failure) {
          expect(failure, isA<AuthFailure>());
          expect(failure.message, contains('not authenticated'));
        },
        (_) => fail('Should return Left'),
      );
    });
  });

  group('getComments', () {
    test('delegates postId, lastComment, and limit to datasource and returns Right(comments)', () async {
      fakeDataSource.commentsToReturn = [tComment];

      final result = await repository.getComments(
        postId: 'post_1',
        lastComment: tComment,
        limit: 25,
      );

      expect(fakeDataSource.lastCommentPostIdPassed, equals('post_1'));
      expect(fakeDataSource.lastCommentPassed, equals(tComment));
      expect(result.isRight(), isTrue);
      expect(result.getOrElse(() => []), equals([tComment]));
    });
  });

  group('createPost', () {
    test('delegates creation parameters to datasource and returns Right(post)', () async {
      fakeDataSource.postToReturn = tPost;

      final result = await repository.createPost(
        text: 'Hello world',
        skillsTags: ['Flutter'],
        imageFilePath: 'path/to/img.png',
      );

      expect(fakeDataSource.createdTextPassed, equals('Hello world'));
      expect(fakeDataSource.createdSkillsPassed, equals(['Flutter']));
      expect(fakeDataSource.createdImagePathPassed, equals('path/to/img.png'));
      expect(result, equals(Right(tPost)));
    });
  });

  group('deletePost, likePost, unlikePost, addComment', () {
    test('deletePost delegates postId and returns Right(null)', () async {
      final result = await repository.deletePost('post_1');
      expect(fakeDataSource.deletedPostIdPassed, equals('post_1'));
      expect(result, equals(const Right(null)));
    });

    test('likePost delegates postId and returns Right(null)', () async {
      final result = await repository.likePost('post_1');
      expect(fakeDataSource.likedPostIdPassed, equals('post_1'));
      expect(result, equals(const Right(null)));
    });

    test('unlikePost delegates postId and returns Right(null)', () async {
      final result = await repository.unlikePost('post_1');
      expect(fakeDataSource.unlikedPostIdPassed, equals('post_1'));
      expect(result, equals(const Right(null)));
    });

    test('addComment delegates postId, text and returns Right(comment)', () async {
      fakeDataSource.commentToReturn = tComment;
      final result = await repository.addComment(postId: 'post_1', text: 'Nice');
      expect(fakeDataSource.addedCommentPostIdPassed, equals('post_1'));
      expect(fakeDataSource.addedCommentTextPassed, equals('Nice'));
      expect(result, equals(Right(tComment)));
    });
  });
}
