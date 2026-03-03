import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../../core/errors/failures.dart';
import '../../domain/entities/post.dart';
import '../../domain/usecases/add_comment.dart';
import '../../domain/usecases/create_post.dart';
import '../../domain/usecases/get_feed_page.dart';
import '../../domain/usecases/like_post.dart';
import '../../domain/usecases/unlike_post.dart';

part 'feed_event.dart';
part 'feed_state.dart';

class FeedBloc extends Bloc<FeedEvent, FeedState> {
  final GetFeedPage getFeedPage;
  final CreatePost createPost;
  final LikePost likePost;
  final UnlikePost unlikePost;
  final AddComment addComment;

  static const _pageSize = 10;

  FeedBloc({
    required this.getFeedPage,
    required this.createPost,
    required this.likePost,
    required this.unlikePost,
    required this.addComment,
  }) : super(const FeedState.initial()) {
    on<FeedLoadInitial>(_onLoadInitial);
    on<FeedLoadMore>(_onLoadMore);
    on<FeedRefresh>(_onRefresh);
    on<FeedCreatePost>(_onCreatePost);
    on<FeedToggleLike>(_onToggleLike);
    on<FeedAddComment>(_onAddComment);
  }

  Future<void> _onLoadInitial(
    FeedLoadInitial event,
    Emitter<FeedState> emit,
  ) async {
    if (state.isLoadingInitial) return;
    emit(state.copyWith(
      isLoadingInitial: true,
      errorMessage: null,
      posts: const [],
      hasMore: true,
    ));

    final result = await getFeedPage(
      const GetFeedPageParams(limit: _pageSize),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          isLoadingInitial: false,
          errorMessage: _mapFailure(failure),
          posts: const [],
          hasMore: false,
        ),
      ),
      (posts) => emit(
        state.copyWith(
          isLoadingInitial: false,
          posts: posts,
          hasMore: posts.length == _pageSize,
        ),
      ),
    );
  }

  Future<void> _onLoadMore(
    FeedLoadMore event,
    Emitter<FeedState> emit,
  ) async {
    if (state.isLoadingMore || !state.hasMore || state.isLoadingInitial) {
      return;
    }
    if (state.posts.isEmpty) {
      add(const FeedLoadInitial());
      return;
    }

    emit(state.copyWith(isLoadingMore: true, errorMessage: null));

    final lastPost = state.posts.last;
    final result = await getFeedPage(
      GetFeedPageParams(
        lastPost: lastPost,
        limit: _pageSize,
      ),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          isLoadingMore: false,
          errorMessage: _mapFailure(failure),
        ),
      ),
      (posts) => emit(
        state.copyWith(
          isLoadingMore: false,
          posts: [...state.posts, ...posts],
          hasMore: posts.length == _pageSize,
        ),
      ),
    );
  }

  Future<void> _onRefresh(
    FeedRefresh event,
    Emitter<FeedState> emit,
  ) async {
    emit(state.copyWith(isRefreshing: true, errorMessage: null));

    final result = await getFeedPage(
      const GetFeedPageParams(limit: _pageSize),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          isRefreshing: false,
          errorMessage: _mapFailure(failure),
        ),
      ),
      (posts) => emit(
        state.copyWith(
          isRefreshing: false,
          posts: posts,
          hasMore: posts.length == _pageSize,
        ),
      ),
    );
  }

  Future<void> _onCreatePost(
    FeedCreatePost event,
    Emitter<FeedState> emit,
  ) async {
    emit(state.copyWith(isCreatingPost: true, errorMessage: null));

    final result = await createPost(
      CreatePostParams(
        text: event.text,
        skillsTags: event.skillsTags,
        imageFilePath: event.imageFilePath,
      ),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(
          isCreatingPost: false,
          errorMessage: _mapFailure(failure),
        ),
      ),
      (post) => emit(
        state.copyWith(
          isCreatingPost: false,
          posts: [post, ...state.posts],
        ),
      ),
    );
  }

  Future<void> _onToggleLike(
    FeedToggleLike event,
    Emitter<FeedState> emit,
  ) async {
    final index = state.posts.indexWhere((p) => p.id == event.postId);
    if (index == -1) return;

    final post = state.posts[index];
    final currentlyLiked = post.isLikedByMe;
    final updatedPost = post.copyWith(
      isLikedByMe: !currentlyLiked,
      likeCount: post.likeCount + (currentlyLiked ? -1 : 1),
    );

    emit(
      state.copyWith(
        posts: [
          ...state.posts.sublist(0, index),
          updatedPost,
          ...state.posts.sublist(index + 1),
        ],
      ),
    );

    final result = await (currentlyLiked
        ? unlikePost(UnlikePostParams(event.postId))
        : likePost(LikePostParams(event.postId)));

    result.fold(
      (failure) {
        // revert optimistic update on failure
        emit(
          state.copyWith(
            errorMessage: _mapFailure(failure),
            posts: [
              ...state.posts.sublist(0, index),
              post,
              ...state.posts.sublist(index + 1),
            ],
          ),
        );
      },
      (_) {},
    );
  }

  Future<void> _onAddComment(
    FeedAddComment event,
    Emitter<FeedState> emit,
  ) async {
    final index = state.posts.indexWhere((p) => p.id == event.postId);
    if (index == -1) return;

    final oldPost = state.posts[index];

    final result = await addComment(
      AddCommentParams(
        postId: event.postId,
        text: event.text,
      ),
    );

    result.fold(
      (failure) => emit(
        state.copyWith(errorMessage: _mapFailure(failure)),
      ),
      (_) {
        final updatedPost = oldPost.copyWith(
          commentCount: oldPost.commentCount + 1,
        );
        emit(
          state.copyWith(
            posts: [
              ...state.posts.sublist(0, index),
              updatedPost,
              ...state.posts.sublist(index + 1),
            ],
          ),
        );
      },
    );
  }

  String _mapFailure(Failure failure) => failure.message;
}

