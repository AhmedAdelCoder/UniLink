import 'package:cloud_firestore/cloud_firestore.dart';
import '../../domain/entities/comment.dart';

class CommentModel extends Comment {
  const CommentModel({
    required super.id,
    required super.postId,
    required super.userId,
    required super.userName,
    required super.text,
    required super.createdAt,
    super.userPhotoUrl,
  });

  factory CommentModel.fromFirestore(
    String postId,
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data()!;

    return CommentModel(
      id: doc.id,
      postId: postId,
      userId: data['userId'] as String? ?? '',
      userName: data['userName'] as String? ?? '',
      userPhotoUrl: data['userPhotoUrl'] as String?,
      text: data['text'] as String? ?? '',
      createdAt:
          (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'authorId': userId, 
      'userName': userName,
      'userPhotoUrl': userPhotoUrl,
      'text': text,
      'createdAt': FieldValue.serverTimestamp(),
    }..removeWhere((key, value) => value == null);
  }
}