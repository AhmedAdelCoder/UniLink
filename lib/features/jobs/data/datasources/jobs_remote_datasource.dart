import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:firebase_storage/firebase_storage.dart';

import '../models/job_application_model.dart';
import '../models/job_model.dart';

// ─────────────────────────────────────────────
// Custom Exceptions — يستخدمها الـ UI لتوجيه المستخدم
// ─────────────────────────────────────────────

/// يُرمى لما المستخدم مش logged in
class UserNotLoggedInException implements Exception {
  @override
  String toString() => 'No user is currently logged in.';
}

/// يُرمى لما الـ recruiter مش عنده company profile في Firestore
class CompanyProfileNotFoundException implements Exception {
  @override
  String toString() =>
      'No company profile found for this recruiter. Please create a company profile first.';
}

// ─────────────────────────────────────────────
// Abstract Interface
// ─────────────────────────────────────────────

abstract class JobsRemoteDataSource {
  Stream<List<JobModel>> streamAllJobs();
  Stream<List<JobModel>> streamCompanyJobs(String companyId);

  /// Throws [UserNotLoggedInException] if no user is logged in.
  /// Throws [CompanyProfileNotFoundException] if recruiter has no company profile.
  Future<void> createJob({
    required String title,
    required String description,
    required List<String> skills,
    required String jobType,
    required String salaryRange,
    required String location,
  });

  Future<void> deleteJob(String jobId);

  Future<void> applyToJob({
    required String jobId,
    required String message,
    required String cvFilePath,
  });

  Stream<List<JobApplicationModel>> streamApplicationsForJob(String jobId);
}

// ─────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────

class JobsRemoteDataSourceImpl implements JobsRemoteDataSource {
  JobsRemoteDataSourceImpl({
    required FirebaseFirestore firestore,
    required FirebaseStorage storage,
    required fb.FirebaseAuth firebaseAuth,
  })  : _firestore = firestore,
        _storage = storage,
        _firebaseAuth = firebaseAuth;

  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;
  final fb.FirebaseAuth _firebaseAuth;

  CollectionReference<Map<String, dynamic>> get _jobs =>
      _firestore.collection('jobs');

  CollectionReference<Map<String, dynamic>> get _users =>
      _firestore.collection('users');

  CollectionReference<Map<String, dynamic>> get _companies =>
      _firestore.collection('companies');

  CollectionReference<Map<String, dynamic>> get _applications =>
      _firestore.collection('applications');

  // ───────────────────────────────────────────
  // Stream All Jobs
  // ───────────────────────────────────────────

  @override
  Stream<List<JobModel>> streamAllJobs() {
    return _jobs.orderBy('createdAt', descending: true).snapshots().map(
          (snap) => snap.docs.map(JobModel.fromFirestore).toList(),
        );
  }

  // ───────────────────────────────────────────
  // Stream Jobs for a Specific Company
  // ───────────────────────────────────────────

  @override
  Stream<List<JobModel>> streamCompanyJobs(String companyId) {
    return _jobs
        .where('companyId', isEqualTo: companyId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map(JobModel.fromFirestore).toList());
  }

  // ───────────────────────────────────────────
  // Create Job
  // ───────────────────────────────────────────

  @override
  Future<void> createJob({
    required String title,
    required String description,
    required List<String> skills,
    required String jobType,
    required String salaryRange,
    required String location,
  }) async {
    // 1️⃣ التحقق من تسجيل الدخول
    final currentUser = _firebaseAuth.currentUser;
    if (currentUser == null) {
      throw UserNotLoggedInException();
    }

    // 2️⃣ البحث عن company profile بـ ownerId
    // ⚠️ تأكد إن الـ field في Firestore اسمه "ownerId" وليس "recruiterId"
    final companySnapshot = await _companies
        .where('ownerId', isEqualTo: currentUser.uid)
        .limit(1)
        .get();

    // 3️⃣ لو مفيش company → throw exception واضحة (مش generic Exception)
    if (companySnapshot.docs.isEmpty) {
      throw CompanyProfileNotFoundException();
    }

    // 4️⃣ جلب بيانات الـ company
    final companyDoc = companySnapshot.docs.first;
    final companyData = companyDoc.data();

    // 5️⃣ إنشاء الـ job
    await _jobs.add({
      'companyId': companyDoc.id,
      'companyName': companyData['name'] ?? 'Company',
      'companyLogoUrl': companyData['logoUrl'],
      'recruiterId': currentUser.uid, // مفيد للـ Firestore rules
      'title': title,
      'description': description,
      'skills': skills,
      'jobType': jobType,
      'salaryRange': salaryRange,
      'location': location,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // ───────────────────────────────────────────
  // Delete Job
  // ───────────────────────────────────────────

  @override
  Future<void> deleteJob(String jobId) async {
    await _jobs.doc(jobId).delete();
  }

  // ───────────────────────────────────────────
  // Apply to Job
  // ───────────────────────────────────────────

  @override
  Future<void> applyToJob({
    required String jobId,
    required String message,
    required String cvFilePath,
  }) async {
    final currentUser = _firebaseAuth.currentUser;
    if (currentUser == null) {
      throw UserNotLoggedInException();
    }

    final userSnapshot = await _users.doc(currentUser.uid).get();
    final userData = userSnapshot.data() ?? {};
    final studentName = userData['fullName'] as String? ?? 'Student';

    final cvRef = _storage.ref().child(
          'cvs/${currentUser.uid}/$jobId/${DateTime.now().millisecondsSinceEpoch}.pdf',
        );

    final uploadTask = await cvRef.putFile(File(cvFilePath));
    final cvUrl = await uploadTask.ref.getDownloadURL();

    await _applications.add({
      'jobId': jobId,
      'studentId': currentUser.uid,
      'studentName': studentName,
      'cvUrl': cvUrl,
      'message': message,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  // ───────────────────────────────────────────
  // Stream Applications for a Job
  // ───────────────────────────────────────────

  @override
  Stream<List<JobApplicationModel>> streamApplicationsForJob(String jobId) {
    return _applications
        .where('jobId', isEqualTo: jobId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map(
          (snap) => snap.docs.map(JobApplicationModel.fromFirestore).toList(),
        );
  }
}