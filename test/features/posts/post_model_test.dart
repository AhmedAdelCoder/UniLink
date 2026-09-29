import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unilink/features/posts/data/models/post_model.dart';

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
  group('PostModel.fromFirestore', () {
    test('converts Timestamp to DateTime for createdAt and updatedAt', () {
      final createdTimestamp = Timestamp.fromDate(DateTime(2026, 3, 15, 10, 30));
      final updatedTimestamp = Timestamp.fromDate(DateTime(2026, 3, 15, 12, 00));

      final doc = FakeDocumentSnapshot(
        id: 'post_123',
        data: {
          'authorId': 'user_456',
          'authorName': 'Alice',
          'authorPhotoUrl': 'https://example.com/alice.png',
          'text': 'Testing PostModel',
          'imageUrl': 'https://example.com/image.png',
          'skillsTags': ['Flutter', 'Clean Architecture'],
          'likeCount': 42,
          'commentCount': 7,
          'createdAt': createdTimestamp,
          'updatedAt': updatedTimestamp,
        },
      );

      final model = PostModel.fromFirestore(doc, isLikedByMe: true);

      expect(model.id, equals('post_123'));
      expect(model.authorId, equals('user_456'));
      expect(model.authorName, equals('Alice'));
      expect(model.authorPhotoUrl, equals('https://example.com/alice.png'));
      expect(model.text, equals('Testing PostModel'));
      expect(model.imageUrl, equals('https://example.com/image.png'));
      expect(model.skillsTags, equals(['Flutter', 'Clean Architecture']));
      expect(model.likeCount, equals(42));
      expect(model.commentCount, equals(7));
      expect(model.isLikedByMe, isTrue);

      expect(model.createdAt, equals(createdTimestamp.toDate()));
      expect(model.updatedAt, equals(updatedTimestamp.toDate()));
      expect(model.createdAt, isA<DateTime>());
      expect(model.updatedAt, isA<DateTime>());
    });

    test('handles null updatedAt and missing createdAt gracefully', () {
      final doc = FakeDocumentSnapshot(
        id: 'post_999',
        data: {
          'authorId': 'user_1',
          'authorName': 'Bob',
          'text': 'Post without dates',
          'createdAt': null,
          'updatedAt': null,
        },
      );

      final before = DateTime.now();
      final model = PostModel.fromFirestore(doc);
      final after = DateTime.now();

      expect(model.updatedAt, isNull);
      expect(model.createdAt.isAfter(before.subtract(const Duration(seconds: 1))), isTrue);
      expect(model.createdAt.isBefore(after.add(const Duration(seconds: 1))), isTrue);
    });
  });
}
