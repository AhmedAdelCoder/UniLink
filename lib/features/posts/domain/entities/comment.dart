import 'package:equatable/equatable.dart';

class Comment extends Equatable {
  final String id;
  final String postId;
  final String userId;
  final String userName;
  final String? userPhotoUrl;
  final String text;
  final DateTime createdAt;

  const Comment({
    required this.id,
    required this.postId,
    required this.userId,
    required this.userName,
    required this.text,
    required this.createdAt,
    this.userPhotoUrl,
  });

  @override
  List<Object?> get props => [
        id,
        postId,
        userId,
        userName,
        userPhotoUrl,
        text,
        createdAt,
      ];
}

