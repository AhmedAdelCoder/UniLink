import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;

import '../../../../core/services/cloudinary_service.dart';
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
    required fb.FirebaseAuth auth,
    required CloudinaryService cloudinaryService,
  })  : _firestore = firestore,
        _auth = auth,
        _cloudinaryService = cloudinaryService;

  final FirebaseFirestore _firestore;
  final fb.FirebaseAuth _auth;
  final CloudinaryService _cloudinaryService;

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

    // 🚀 رفع الصورة على Cloudinary
    final uploadedUrl = await _cloudinaryService.uploadImage(file);
    if (uploadedUrl == null) {
      throw StateError('Failed to upload image to Cloudinary');
    }

    // تحديث رابط الصورة في Firestore
    await _users.doc(uid).update({
      'photoUrl': uploadedUrl,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    return uploadedUrl;
  }
}