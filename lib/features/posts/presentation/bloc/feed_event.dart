part of 'feed_bloc.dart';

abstract class FeedEvent extends Equatable {
  const FeedEvent();

  @override
  List<Object?> get props => [];
}

class FeedLoadInitial extends FeedEvent {
  const FeedLoadInitial();
}

class FeedLoadMore extends FeedEvent {
  const FeedLoadMore();
}

class FeedRefresh extends FeedEvent {
  const FeedRefresh();
}

class FeedCreatePost extends FeedEvent {
  final String text;
  final List<String> skillsTags;
  final String? imageFilePath;

  const FeedCreatePost({
    required this.text,
    this.skillsTags = const [],
    this.imageFilePath,
  });

  @override
  List<Object?> get props => [text, skillsTags, imageFilePath];
}

class FeedToggleLike extends FeedEvent {
  final String postId;

  const FeedToggleLike(this.postId);

  @override
  List<Object?> get props => [postId];
}

class FeedAddComment extends FeedEvent {
  final String postId;
  final String text;

  const FeedAddComment({
    required this.postId,
    required this.text,
  });

  @override
  List<Object?> get props => [postId, text];
}

class FeedDeletePost extends FeedEvent {
  final String postId;

  const FeedDeletePost(this.postId);

  @override
  List<Object?> get props => [postId];
}

