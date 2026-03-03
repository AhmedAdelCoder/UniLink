part of 'feed_bloc.dart';

class FeedState extends Equatable {
  final List<Post> posts;
  final bool isLoadingInitial;
  final bool isLoadingMore;
  final bool isRefreshing;
  final bool isCreatingPost;
  final bool hasMore;
  final String? errorMessage;

  const FeedState({
    required this.posts,
    required this.isLoadingInitial,
    required this.isLoadingMore,
    required this.isRefreshing,
    required this.isCreatingPost,
    required this.hasMore,
    required this.errorMessage,
  });

  const FeedState.initial()
      : posts = const [],
        isLoadingInitial = false,
        isLoadingMore = false,
        isRefreshing = false,
        isCreatingPost = false,
        hasMore = true,
        errorMessage = null;

  FeedState copyWith({
    List<Post>? posts,
    bool? isLoadingInitial,
    bool? isLoadingMore,
    bool? isRefreshing,
    bool? isCreatingPost,
    bool? hasMore,
    String? errorMessage,
  }) {
    return FeedState(
      posts: posts ?? this.posts,
      isLoadingInitial: isLoadingInitial ?? this.isLoadingInitial,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isCreatingPost: isCreatingPost ?? this.isCreatingPost,
      hasMore: hasMore ?? this.hasMore,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [
        posts,
        isLoadingInitial,
        isLoadingMore,
        isRefreshing,
        isCreatingPost,
        hasMore,
        errorMessage,
      ];
}

