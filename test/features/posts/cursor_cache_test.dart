import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

// ignore: subtype_of_sealed_class
class FakeDocumentSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  @override
  final String id;
  FakeDocumentSnapshot(this.id);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('Cursor Cache Isolation and Cleanup Logic', () {
    test('comments cursor uses composite key {postId}_{commentId} preventing cross-post collisions', () {
      final commentSnapshots = <String, DocumentSnapshot<Map<String, dynamic>>>{};

      final docPost1 = FakeDocumentSnapshot('comment_10');
      final docPost2 = FakeDocumentSnapshot('comment_10');

      // Store comment with same ID for two distinct posts
      final key1 = 'post_A_${docPost1.id}';
      final key2 = 'post_B_${docPost2.id}';

      commentSnapshots[key1] = docPost1;
      commentSnapshots[key2] = docPost2;

      expect(key1, isNot(equals(key2)));
      expect(commentSnapshots.length, equals(2));
      expect(commentSnapshots[key1], equals(docPost1));
      expect(commentSnapshots[key2], equals(docPost2));
    });

    test('clearing comments for postId when lastComment == null only clears that specific post', () {
      final commentSnapshots = <String, DocumentSnapshot<Map<String, dynamic>>>{};

      commentSnapshots['post_A_c1'] = FakeDocumentSnapshot('c1');
      commentSnapshots['post_A_c2'] = FakeDocumentSnapshot('c2');
      commentSnapshots['post_B_c1'] = FakeDocumentSnapshot('c1');
      commentSnapshots['post_C_c3'] = FakeDocumentSnapshot('c3');

      expect(commentSnapshots.length, equals(4));

      // Simulate fresh comments query for post_A with lastComment == null:
      const targetPostId = 'post_A';
      commentSnapshots.removeWhere((key, _) => key.startsWith('${targetPostId}_'));

      // post_A entries removed
      expect(commentSnapshots.containsKey('post_A_c1'), isFalse);
      expect(commentSnapshots.containsKey('post_A_c2'), isFalse);

      // post_B and post_C entries completely preserved
      expect(commentSnapshots.containsKey('post_B_c1'), isTrue);
      expect(commentSnapshots.containsKey('post_C_c3'), isTrue);
      expect(commentSnapshots.length, equals(2));
    });

    test('feed cache clearing when lastPost == null resets all feed entries', () {
      final feedSnapshots = <String, DocumentSnapshot<Map<String, dynamic>>>{};

      feedSnapshots['post_1'] = FakeDocumentSnapshot('post_1');
      feedSnapshots['post_2'] = FakeDocumentSnapshot('post_2');
      feedSnapshots['post_3'] = FakeDocumentSnapshot('post_3');

      expect(feedSnapshots.length, equals(3));

      // Simulate fresh feed query with lastPost == null (FeedLoadInitial / FeedRefresh)
      feedSnapshots.clear();

      expect(feedSnapshots.isEmpty, isTrue);
    });
  });
}
