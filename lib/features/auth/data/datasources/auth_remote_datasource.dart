import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:unilink/features/request/request.dart';

import '../../domain/entities/app_user.dart';
import '../models/app_user_model.dart';

abstract class AuthRemoteDataSource {
  Future<AppUserModel> register({
    required String name,
    required String email,
    required String password,
    required UserRole role,
  });

  Future<bool> isEmailRegistered({required String email});

  Future<AppUserModel> login({
    required String email,
    required String password,
  });

  Future<void> resetPassword({required String email});

  Future<void> logout();

  Future<AppUserModel> getCurrentUser();
}

class AuthRemoteDataSourceImpl implements AuthRemoteDataSource {
  final fb.FirebaseAuth _firebaseAuth;
  final FirebaseFirestore _firestore;

  AuthRemoteDataSourceImpl({
    required fb.FirebaseAuth firebaseAuth,
    required FirebaseFirestore firestore,
  })  : _firebaseAuth = firebaseAuth,
        _firestore = firestore;

  CollectionReference<Map<String, dynamic>> get _usersCollection =>
      _firestore.collection('users');

  @override
  Future<AppUserModel> register({
    required String name,
    required String email,
    required String password,
    required UserRole role,
  }) async {
    final credential = await _firebaseAuth.createUserWithEmailAndPassword(
      email: email,
      password: password,
    );

    final firebaseUser = credential.user!;
    final uid = firebaseUser.uid;

    final userDoc = AppUserModel(
      id: uid,
      email: email,
      fullName: name,
      role: role,
    );

    await _usersCollection.doc(uid).set(
          userDoc.toFirestoreNewUser(),
          SetOptions(merge: true),
        );

    await sendWelcomeEmail(email, name);

    return userDoc;
  }

  @override
  Future<bool> isEmailRegistered({required String email}) async {
    final methods =
        await _firebaseAuth.fetchSignInMethodsForEmail(email.trim());
    return methods.isNotEmpty;
  }

  @override
  Future<AppUserModel> login({
    required String email,
    required String password,
  }) async {
    final credential = await _firebaseAuth.signInWithEmailAndPassword(
      email: email,
      password: password,
    );
    final user = credential.user!;
    final doc = await _usersCollection.doc(user.uid).get();

    if (!doc.exists) {
      final minimalUser = AppUserModel(
        id: user.uid,
        email: user.email ?? email,
        fullName: user.displayName ?? '',
        role: UserRole.student,
      );
      await _usersCollection
          .doc(user.uid)
          .set(minimalUser.toFirestoreNewUser(), SetOptions(merge: true));
      return minimalUser;
    }

    return AppUserModel.fromFirestore(doc.id, doc.data()!);
  }

  @override
  Future<void> resetPassword({required String email}) {
    return _firebaseAuth.sendPasswordResetEmail(email: email);
  }

  @override
  Future<void> logout() {
    return _firebaseAuth.signOut();
  }

  @override
  Future<AppUserModel> getCurrentUser() async {
    final user = _firebaseAuth.currentUser;
    if (user == null) {
      throw fb.FirebaseAuthException(
        code: 'user-not-logged-in',
        message: 'No user is currently logged in is ok',
      );
    }

    final doc = await _usersCollection.doc(user.uid).get();
    if (!doc.exists) {
      final minimalUser = AppUserModel(
        id: user.uid,
        email: user.email ?? '',
        fullName: user.displayName ?? '',
        role: UserRole.student,
      );
      await _usersCollection
          .doc(user.uid)
          .set(minimalUser.toFirestoreNewUser(), SetOptions(merge: true));
      return minimalUser;
    }

    return AppUserModel.fromFirestore(doc.id, doc.data()!);
  }
}