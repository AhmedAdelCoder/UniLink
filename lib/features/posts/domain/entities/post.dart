import 'package:equatable/equatable.dart';

class Post extends Equatable {
  final String id;
  final String authorId;
  final String authorName;
  final String? authorPhotoUrl;
  final String text;
  final String? imageUrl;
  final List<String> skillsTags;
  final int likeCount;
  final int commentCount;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final bool isLikedByMe;

  const Post({
    required this.id,
    required this.authorId,
    required this.authorName,
    required this.text,
    required this.skillsTags,
    required this.likeCount,
    required this.commentCount,
    required this.createdAt,
    this.authorPhotoUrl,
    this.imageUrl,
    this.updatedAt,
    this.isLikedByMe = false,
  });

  Post copyWith({
    String? id,
    String? authorId,
    String? authorName,
    String? authorPhotoUrl,
    String? text,
    String? imageUrl,
    List<String>? skillsTags,
    int? likeCount,
    int? commentCount,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool? isLikedByMe,
  }) {
    return Post(
      id: id ?? this.id,
      authorId: authorId ?? this.authorId,
      authorName: authorName ?? this.authorName,
      authorPhotoUrl: authorPhotoUrl ?? this.authorPhotoUrl,
      text: text ?? this.text,
      imageUrl: imageUrl ?? this.imageUrl,
      skillsTags: skillsTags ?? this.skillsTags,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isLikedByMe: isLikedByMe ?? this.isLikedByMe,
    );
  }

  @override
  List<Object?> get props => [
        id,
        authorId,
        authorName,
        authorPhotoUrl,
        text,
        imageUrl,
        skillsTags,
        likeCount,
        commentCount,
        createdAt,
        updatedAt,
        isLikedByMe,
      ];
}

