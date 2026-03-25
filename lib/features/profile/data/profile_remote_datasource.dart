import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:firebase_storage/firebase_storage.dart';

import '../../auth/data/models/app_user_model.dart';
import '../../auth/domain/entities/user_project.dart';

abstract class ProfileRemoteDataSource {
  Stream<AppUserModel?> watchProfile(String uid);

  Future<void> updateProfile({
    required String uid,
    required String fullName,
    required String bio,
    required List<String> skills,
    required List<UserProject> projects,
    String? githubUrl,
    String? linkedinUrl,
    String? websiteUrl,
  });

  Future<String> uploadProfilePhoto(String uid, File file);
}

class ProfileRemoteDataSourceImpl implements ProfileRemoteDataSource {
  ProfileRemoteDataSourceImpl({
    required FirebaseFirestore firestore,
    required FirebaseStorage storage,
    required fb.FirebaseAuth auth,
  })  : _firestore = firestore,
        _storage = storage,
        _auth = auth;

  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;
  final fb.FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _users =>
      _firestore.collection('users');

  @override
  Stream<AppUserModel?> watchProfile(String uid) {
    return _users.doc(uid).snapshots().map((snap) {
      if (!snap.exists || snap.data() == null) return null;
      return AppUserModel.fromFirestore(snap.id, snap.data()!);
    });
  }

  @override
  Future<void> updateProfile({
    required String uid,
    required String fullName,
    required String bio,
    required List<String> skills,
    required List<UserProject> projects,
    String? githubUrl,
    String? linkedinUrl,
    String? websiteUrl,
  }) async {
    final user = _auth.currentUser;
    if (user == null || user.uid != uid) {
      throw StateError('Not authenticated');
    }

    await _users.doc(uid).update({
      'fullName': fullName,
      'searchNameLower': fullName.toLowerCase(),
      'bio': bio,
      'skills': skills,
      'projects': projects
          .map(
            (p) => {
              'title': p.title,
              'description': p.description,
              'link': p.link,
            },
          )
          .toList(),
      'githubUrl': githubUrl,
      'linkedinUrl': linkedinUrl,
      'websiteUrl': websiteUrl,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Future<String> uploadProfilePhoto(String uid, File file) async {
    final user = _auth.currentUser;
    if (user == null || user.uid != uid) {
      throw StateError('Not authenticated');
    }
    final ref = _storage.ref().child('profile_pictures/$uid.jpg');
    await ref.putFile(file);
    final url = await ref.getDownloadURL();
    await _users.doc(uid).update({
      'photoUrl': url,
      'updatedAt': FieldValue.serverTimestamp(),
    });
    return url;
  }
}
