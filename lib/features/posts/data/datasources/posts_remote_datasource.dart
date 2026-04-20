import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:firebase_storage/firebase_storage.dart';

import '../../../connections/data/connections_remote_datasource.dart';
import '../models/comment_model.dart';
import '../models/post_model.dart';

class PaginatedPostsResult {
  final List<PostModel> posts;
  final DocumentSnapshot<Map<String, dynamic>>? lastDocument;

  PaginatedPostsResult({
    required this.posts,
    required this.lastDocument,
  });
}

abstract class PostsRemoteDataSource {
  Future<PaginatedPostsResult> getFeedPage({
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
    int limit = 10,
  });

 Stream<List<PostModel>> getFeedStream();
  Future<PostModel> createPost({
    required String text,
    List<String> skillsTags,
    String? imageFilePath,
  });

  Future<void> deletePost(String postId);

  Future<void> likePost(String postId);

  Future<void> unlikePost(String postId);

  Future<List<CommentModel>> getComments({
    required String postId,
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
    int limit = 20,
  });

  Future<CommentModel> addComment({
    required String postId,
    required String text,
  });
}

class PostsRemoteDataSourceImpl implements PostsRemoteDataSource {
  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;
  final fb.FirebaseAuth _firebaseAuth;
  final ConnectionsRemoteDataSource _connectionsRemoteDataSource;

  PostsRemoteDataSourceImpl({
    required FirebaseFirestore firestore,
    required FirebaseStorage storage,
    required fb.FirebaseAuth firebaseAuth,
    required ConnectionsRemoteDataSource connectionsRemoteDataSource,
  })  : _firestore = firestore,
        _storage = storage,
        _firebaseAuth = firebaseAuth,
        _connectionsRemoteDataSource = connectionsRemoteDataSource;

  CollectionReference<Map<String, dynamic>> get _postsCollection =>
      _firestore.collection('posts');

  // 🔥 REAL-TIME STREAM (حطه هنا داخل الكلاس)
  @override
  Stream<List<PostModel>> getFeedStream() {
    return _postsCollection
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs
              .map((doc) => PostModel.fromFirestore(doc))
              .toList();
        });
  }
  @override
  Future<PaginatedPostsResult> getFeedPage({
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
    int limit = 10,
  }) async {
    final currentUser = _firebaseAuth.currentUser;
    if (currentUser == null) {
      return PaginatedPostsResult(posts: const [], lastDocument: null);
    }

    final allowedAuthorIds = {
      currentUser.uid,
      ...(await _connectionsRemoteDataSource.watchConnectedUserIds(
        currentUser.uid,
      ).first),
    };

    var cursor = startAfter;
    final filteredDocs = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
    DocumentSnapshot<Map<String, dynamic>>? lastDocument;
    final batchSize = limit * 3;

    while (filteredDocs.length < limit) {
      final queryBase = _postsCollection
          .orderBy('createdAt', descending: true)
          .limit(batchSize);
      final query =
          cursor != null ? queryBase.startAfterDocument(cursor) : queryBase;
      final snapshot = await query.get();
      if (snapshot.docs.isEmpty) break;

      for (final doc in snapshot.docs) {
        final authorId = (doc.data()['authorId'] as String?) ?? '';
        if (allowedAuthorIds.contains(authorId)) {
          filteredDocs.add(doc);
          if (filteredDocs.length >= limit) break;
        }
      }

      cursor = snapshot.docs.last;
      lastDocument = cursor;
      if (snapshot.docs.length < batchSize) break;
    }

    // Per-post like doc reads avoid collectionGroup + whereIn limits (max 10) and index issues.
    final likedPostIds = <String>{};
    if (filteredDocs.isNotEmpty) {
      await Future.wait(
        filteredDocs.map((doc) async {
          final likeSnap = await _postsCollection
              .doc(doc.id)
              .collection('likes')
              .doc(currentUser.uid)
              .get();
          if (likeSnap.exists) likedPostIds.add(doc.id);
        }),
      );
    }

    final posts = filteredDocs
        .map(
          (doc) => PostModel.fromFirestore(
            doc,
            isLikedByMe: likedPostIds.contains(doc.id),
          ),
        )
        .toList();

    return PaginatedPostsResult(
      posts: posts,
      lastDocument: lastDocument,
    );
  }

  @override
  Future<PostModel> createPost({
    required String text,
    List<String> skillsTags = const [],
    String? imageFilePath,
  }) async {
    final user = _firebaseAuth.currentUser;
    if (user == null) {
      throw fb.FirebaseAuthException(
        code: 'user-not-logged-in',
        message: 'No user is currently logged in',
      );
    }

    String? imageUrl;
    final now = DateTime.now();

    final postRef = _postsCollection.doc();

    if (imageFilePath != null) {
      final file = File(imageFilePath);
      final storageRef = _storage.ref().child(
          'post_images/${user.uid}/${postRef.id}_${now.millisecondsSinceEpoch}.jpg');
      final uploadTask = await storageRef.putFile(file);
      imageUrl = await uploadTask.ref.getDownloadURL();
    }

    final userDoc =
        await _firestore.collection('users').doc(user.uid).get();
    final userData = userDoc.data() ?? {};

await postRef.set({
  'id': postRef.id,
  'authorId': user.uid,
  'authorName': userData['fullName'] as String? ?? '',
  'authorPhotoUrl': userData['photoUrl'] as String?,
  'text': text,
  'imageUrl': imageUrl,
  'skillsTags': skillsTags,
  'likeCount': 0,
  'commentCount': 0,
  'createdAt': FieldValue.serverTimestamp(),
  'updatedAt': FieldValue.serverTimestamp(),
});



    return PostModel(
      id: postRef.id,
      authorId: user.uid,
      authorName: userData['fullName'] as String? ?? '',
      authorPhotoUrl: userData['photoUrl'] as String?,
      text: text,
      imageUrl: imageUrl,
      skillsTags: skillsTags,
      likeCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    );
  }

  @override
  Future<void> deletePost(String postId) async {
    final user = _firebaseAuth.currentUser;
    if (user == null) {
      throw fb.FirebaseAuthException(
        code: 'user-not-logged-in',
        message: 'No user is currently logged in',
      );
    }
    final postRef = _postsCollection.doc(postId);
    final postSnap = await postRef.get();
    if (!postSnap.exists) return;
    final data = postSnap.data();
    if (data == null) return;
    final authorId = data['authorId'] as String?;
    if (authorId != user.uid) {
      throw StateError('You can only delete your own posts');
    }
    await postRef.delete();
  }

  @override
  Future<void> likePost(String postId) async {
    final user = _firebaseAuth.currentUser;
    if (user == null) return;

    final likeRef =
        _postsCollection.doc(postId).collection('likes').doc(user.uid);

    await _firestore.runTransaction((transaction) async {
      final likeSnapshot = await transaction.get(likeRef);
      if (!likeSnapshot.exists) {
        transaction.set(likeRef, {
          'userId': user.uid,
          'postId': postId,
          'createdAt': FieldValue.serverTimestamp(),
        });
        transaction.update(_postsCollection.doc(postId), {
          'likeCount': FieldValue.increment(1),
        });
      }
    });
  }

  @override
  Future<void> unlikePost(String postId) async {
    final user = _firebaseAuth.currentUser;
    if (user == null) return;

    final likeRef =
        _postsCollection.doc(postId).collection('likes').doc(user.uid);

    await _firestore.runTransaction((transaction) async {
      final likeSnapshot = await transaction.get(likeRef);
      if (likeSnapshot.exists) {
        transaction.delete(likeRef);
        transaction.update(_postsCollection.doc(postId), {
          'likeCount': FieldValue.increment(-1),
        });
      }
    });
  }

  @override
  Future<List<CommentModel>> getComments({
    required String postId,
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
    int limit = 20,
  }) async {
    final commentsCollection =
        _postsCollection.doc(postId).collection('comments');

    final baseQuery =
        commentsCollection.orderBy('createdAt', descending: false).limit(limit);

    final query =
        startAfter != null ? baseQuery.startAfterDocument(startAfter) : baseQuery;

    final snapshot = await query.get();

    return snapshot.docs
        .map((doc) => CommentModel.fromFirestore(postId, doc))
        .toList();
  }

  @override
  Future<CommentModel> addComment({
    required String postId,
    required String text,
  }) async {
    final user = _firebaseAuth.currentUser;
    if (user == null) {
      throw fb.FirebaseAuthException(
        code: 'user-not-logged-in',
        message: 'No user is currently logged in',
      );
    }

    final userDoc =
        await _firestore.collection('users').doc(user.uid).get();
    final userData = userDoc.data() ?? {};
    final now = DateTime.now();

    final commentsCollection =
        _postsCollection.doc(postId).collection('comments');
    final commentRef = commentsCollection.doc();

    final comment = CommentModel(
      id: commentRef.id,
      postId: postId,
      userId: user.uid,
      userName: userData['fullName'] as String? ?? '',
      userPhotoUrl: userData['photoUrl'] as String?,
      text: text,
      createdAt: now,
    );

    await _firestore.runTransaction((transaction) async {
      transaction.set(commentRef, comment.toFirestore());
      transaction.update(_postsCollection.doc(postId), {
        'commentCount': FieldValue.increment(1),
      });
    });

    return comment;
  }
}

