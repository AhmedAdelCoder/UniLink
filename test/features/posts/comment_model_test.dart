import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unilink/features/posts/data/models/comment_model.dart';

// ignore: subtype_of_sealed_class
class FakeDocumentSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  @override
  final String id;
  final Map<String, dynamic>? _data;

  FakeDocumentSnapshot({required this.id, required Map<String, dynamic>? data})
      : _data = data;

  @override
  Map<String, dynamic>? data() => _data;

  @override
  bool get exists => _data != null;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('CommentModel.fromFirestore', () {
    test('converts Timestamp to DateTime for createdAt', () {
      final createdTimestamp = Timestamp.fromDate(DateTime(2026, 4, 1, 9, 15));

      final doc = FakeDocumentSnapshot(
        id: 'comment_456',
        data: {
          'userId': 'user_789',
          'userName': 'Charlie',
          'userPhotoUrl': 'https://example.com/charlie.png',
          'text': 'Insightful comment!',
          'createdAt': createdTimestamp,
        },
      );

      final model = CommentModel.fromFirestore('post_100', doc);

      expect(model.id, equals('comment_456'));
      expect(model.postId, equals('post_100'));
      expect(model.userId, equals('user_789'));
      expect(model.userName, equals('Charlie'));
      expect(model.userPhotoUrl, equals('https://example.com/charlie.png'));
      expect(model.text, equals('Insightful comment!'));

      expect(model.createdAt, equals(createdTimestamp.toDate()));
      expect(model.createdAt, isA<DateTime>());
    });

    test('handles missing or null createdAt gracefully', () {
      final doc = FakeDocumentSnapshot(
        id: 'comment_999',
        data: {
          'userId': 'user_1',
          'userName': 'Dave',
          'text': 'No date comment',
          'createdAt': null,
        },
      );

      final before = DateTime.now();
      final model = CommentModel.fromFirestore('post_200', doc);
      final after = DateTime.now();

      expect(model.createdAt.isAfter(before.subtract(const Duration(seconds: 1))), isTrue);
      expect(model.createdAt.isBefore(after.add(const Duration(seconds: 1))), isTrue);
    });
  });
}
