import '../../domain/entities/comment.dart';
import '../../domain/entities/post.dart';
import '../models/comment_model.dart';
import '../models/post_model.dart';

abstract class PostsRemoteDataSource {
  Future<List<PostModel>> getFeedPage({
    Post? lastPost,
    int limit = 10,
  });

  Stream<List<PostModel>> getFeedStream();

  Future<PostModel> createPost({
    required String text,
    List<String> skillsTags = const [],
    String? imageFilePath,
  });

  Future<void> deletePost(String postId);

  Future<void> likePost(String postId);

  Future<void> unlikePost(String postId);

  Future<List<CommentModel>> getComments({
    required String postId,
    Comment? lastComment,
    int limit = 20,
  });

  Future<CommentModel> addComment({
    required String postId,
    required String text,
  });
}