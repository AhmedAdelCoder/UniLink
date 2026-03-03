import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:firebase_storage/firebase_storage.dart';

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

  PostsRemoteDataSourceImpl({
    required FirebaseFirestore firestore,
    required FirebaseStorage storage,
    required fb.FirebaseAuth firebaseAuth,
  })  : _firestore = firestore,
        _storage = storage,
        _firebaseAuth = firebaseAuth;

  CollectionReference<Map<String, dynamic>> get _postsCollection =>
      _firestore.collection('posts');

  @override
  Future<PaginatedPostsResult> getFeedPage({
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
    int limit = 10,
  }) async {
    final currentUser = _firebaseAuth.currentUser;
    final queryBase = _postsCollection
        .orderBy('createdAt', descending: true)
        .limit(limit);

    final query = startAfter != null
        ? queryBase.startAfterDocument(startAfter)
        : queryBase;

    final snapshot = await query.get();
    final likeDocs = currentUser != null
        ? await _firestore
            .collectionGroup('likes')
            .where('userId', isEqualTo: currentUser.uid)
            .where('postId', whereIn: snapshot.docs.map((d) => d.id).toList())
            .get()
        : null;

    final likedPostIds = <String>{};
    if (likeDocs != null) {
      for (final doc in likeDocs.docs) {
        final data = doc.data();
        final postId = data['postId'] as String?;
        if (postId != null) likedPostIds.add(postId);
      }
    }

    final posts = snapshot.docs
        .map(
          (doc) => PostModel.fromFirestore(
            doc,
            isLikedByMe: likedPostIds.contains(doc.id),
          ),
        )
        .toList();

    final lastDocument =
        snapshot.docs.isNotEmpty ? snapshot.docs.last : null;

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

    final postData = PostModel(
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
    ).toFirestore();

    await postRef.set(postData);

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
    await _postsCollection.doc(postId).delete();
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

