import 'package:cloud_firestore/cloud_firestore.dart';

import '../../domain/entities/post.dart';

class PostModel extends Post {
  const PostModel({
    required super.id,
    required super.authorId,
    required super.authorName,
    required super.text,
    required super.skillsTags,
    required super.likeCount,
    required super.commentCount,
    required super.createdAt,
    super.authorPhotoUrl,
    super.imageUrl,
    super.updatedAt,
    super.isLikedByMe,
  });

  factory PostModel.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc, {
    bool isLikedByMe = false,
  }) {
    final data = doc.data()!;
    return PostModel(
      id: doc.id,
      authorId: data['authorId'] as String? ?? '',
      authorName: data['authorName'] as String? ?? '',
      authorPhotoUrl: data['authorPhotoUrl'] as String?,
      text: data['text'] as String? ?? '',
      imageUrl: data['imageUrl'] as String?,
      skillsTags: (data['skillsTags'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      likeCount: (data['likeCount'] as num?)?.toInt() ?? 0,
      commentCount: (data['commentCount'] as num?)?.toInt() ?? 0,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate(),
      isLikedByMe: isLikedByMe,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'authorId': authorId,
      'authorName': authorName,
      'authorPhotoUrl': authorPhotoUrl,
      'text': text,
      'imageUrl': imageUrl,
      'skillsTags': skillsTags,
      'likeCount': likeCount,
      'commentCount': commentCount,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': updatedAt != null ? Timestamp.fromDate(updatedAt!) : null,
    }..removeWhere((key, value) => value == null);
  }
}

