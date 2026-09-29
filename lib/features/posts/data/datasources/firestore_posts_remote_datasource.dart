import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/foundation.dart';

import '../../../../core/services/cloudinary_service.dart';
import '../../../connections/data/connections_remote_datasource.dart';
import '../../domain/entities/comment.dart';
import '../../domain/entities/post.dart';
import '../models/comment_model.dart';
import '../models/post_model.dart';
import 'posts_remote_datasource.dart';

class FirestorePostsRemoteDataSource implements PostsRemoteDataSource {
  final FirebaseFirestore _firestore;
  final fb.FirebaseAuth _firebaseAuth;
  final ConnectionsRemoteDataSource _connectionsRemoteDataSource;
  final CloudinaryService _cloudinaryService;

  final Map<String, DocumentSnapshot<Map<String, dynamic>>> _feedSnapshots = {};
  final Map<String, DocumentSnapshot<Map<String, dynamic>>> _commentSnapshots = {};

  FirestorePostsRemoteDataSource({
    required FirebaseFirestore firestore,
    required fb.FirebaseAuth firebaseAuth,
    required ConnectionsRemoteDataSource connectionsRemoteDataSource,
    required CloudinaryService cloudinaryService,
  })  : _firestore = firestore,
        _firebaseAuth = firebaseAuth,
        _connectionsRemoteDataSource = connectionsRemoteDataSource,
        _cloudinaryService = cloudinaryService;

  @visibleForTesting
  Map<String, DocumentSnapshot<Map<String, dynamic>>> get feedSnapshots =>
      _feedSnapshots;

  @visibleForTesting
  Map<String, DocumentSnapshot<Map<String, dynamic>>> get commentSnapshots =>
      _commentSnapshots;

  CollectionReference<Map<String, dynamic>> get _postsCollection =>
      _firestore.collection('posts');

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
  Future<List<PostModel>> getFeedPage({
    Post? lastPost,
    int limit = 10,
  }) async {
    if (lastPost == null) {
      _feedSnapshots.clear();
    }

    final currentUser = _firebaseAuth.currentUser;
    if (currentUser == null) {
      return const [];
    }

    final allowedAuthorIds = {
      currentUser.uid,
      ...(await _connectionsRemoteDataSource
          .watchConnectedUserIds(currentUser.uid)
          .first),
    };

    final startAfter = lastPost != null ? _feedSnapshots[lastPost.id] : null;
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

    final posts = await Future.wait(
      filteredDocs.map((doc) async {
        final likeDoc = await _postsCollection
            .doc(doc.id)
            .collection('likes')
            .doc(currentUser.uid)
            .get();

        return PostModel.fromFirestore(doc, isLikedByMe: likeDoc.exists);
      }),
    );

    for (final doc in filteredDocs) {
      _feedSnapshots[doc.id] = doc;
    }
    if (lastDocument != null) {
      _feedSnapshots[lastDocument.id] = lastDocument;
      if (posts.isNotEmpty) {
        _feedSnapshots[posts.last.id] = lastDocument;
      }
    }

    return posts;
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
      imageUrl = await _cloudinaryService.uploadImage(file);
    }

    final userDoc = await _firestore.collection('users').doc(user.uid).get();
    final userData = userDoc.data() ?? {};

    await postRef.set({
      'id': postRef.id,
      'authorId': user.uid,
      'authorName': userData['fullName'] ?? '',
      'authorPhotoUrl': userData['photoUrl'],
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
      authorName: userData['fullName'] ?? '',
      authorPhotoUrl: userData['photoUrl'],
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
    if (user == null) return;

    final ref = _postsCollection.doc(postId);
    final doc = await ref.get();

    if (!doc.exists) return;

    if (doc.data()?['authorId'] != user.uid) {
      throw Exception("Not allowed");
    }

    await ref.delete();
  }

  @override
  Future<void> likePost(String postId) async {
    final user = _firebaseAuth.currentUser;
    if (user == null) {
      throw fb.FirebaseAuthException(
        code: 'user-not-logged-in',
        message: 'No user is currently logged in',
      );
    }

    final likeRef =
        _postsCollection.doc(postId).collection('likes').doc(user.uid);

    await _firestore.runTransaction((tx) async {
      final doc = await tx.get(likeRef);

      if (!doc.exists) {
        tx.set(likeRef, {
          'userId': user.uid,
          'createdAt': FieldValue.serverTimestamp(),
        });
        tx.update(_postsCollection.doc(postId), {
          'likeCount': FieldValue.increment(1),
        });
      }
    });
  }

  @override
  Future<void> unlikePost(String postId) async {
    final user = _firebaseAuth.currentUser;
    if (user == null) {
      throw fb.FirebaseAuthException(
        code: 'user-not-logged-in',
        message: 'No user is currently logged in',
      );
    }

    final likeRef =
        _postsCollection.doc(postId).collection('likes').doc(user.uid);

    await _firestore.runTransaction((tx) async {
      final doc = await tx.get(likeRef);

      if (doc.exists) {
        tx.delete(likeRef);
        tx.update(_postsCollection.doc(postId), {
          'likeCount': FieldValue.increment(-1),
        });
      }
    });
  }

  @override
  Future<List<CommentModel>> getComments({
    required String postId,
    Comment? lastComment,
    int limit = 20,
  }) async {
    if (lastComment == null) {
      _commentSnapshots.removeWhere((key, _) => key.startsWith('${postId}_'));
    }

    final cursorKey =
        lastComment != null ? '${postId}_${lastComment.id}' : null;
    final startAfter =
        cursorKey != null ? _commentSnapshots[cursorKey] : null;

    final ref = _postsCollection.doc(postId).collection('comments');
    final query = ref.orderBy('createdAt').limit(limit);

    final snap = startAfter != null
        ? await query.startAfterDocument(startAfter).get()
        : await query.get();

    for (final doc in snap.docs) {
      _commentSnapshots['${postId}_${doc.id}'] = doc;
    }

    return snap.docs
        .map((e) => CommentModel.fromFirestore(postId, e))
        .toList();
  }

  @override
  Future<CommentModel> addComment({
    required String postId,
    required String text,
  }) async {
    final user = _firebaseAuth.currentUser;

    if (user == null) {
      throw Exception("Not authenticated");
    }

    final userDoc = await _firestore.collection('users').doc(user.uid).get();
    final data = userDoc.data() ?? {};

    final commentRef =
        _postsCollection.doc(postId).collection('comments').doc();

    final comment = CommentModel(
      id: commentRef.id,
      postId: postId,
      userId: user.uid,
      userName: data['fullName'] ?? '',
      userPhotoUrl: data['photoUrl'],
      text: text,
      createdAt: DateTime.now(),
    );

    await _firestore.runTransaction((tx) async {
      tx.set(commentRef, comment.toFirestore());
      tx.update(_postsCollection.doc(postId), {
        'commentCount': FieldValue.increment(1),
      });
    });

    return comment;
  }
}

typedef PostsRemoteDataSourceImpl = FirestorePostsRemoteDataSource;
