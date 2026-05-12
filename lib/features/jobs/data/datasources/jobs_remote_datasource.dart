import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:firebase_storage/firebase_storage.dart';
import 'package:unilink/core/services/cloudinary_service.dart';

import '../models/job_application_model.dart';
import '../models/job_model.dart';

class UserNotLoggedInException implements Exception {
  @override
  String toString() => 'No user is currently logged in.';
}

class RecruiterProfileNotFoundException implements Exception {
  @override
  String toString() =>
      'No recruiter profile found. Please complete your profile first.';
}

abstract class JobsRemoteDataSource {
  Stream<List<JobModel>> streamAllJobs();
  Stream<List<JobModel>> streamRecruiterJobs(String recruiterId);

  Future<void> createJob({
    required String title,
    required String description,
    required List<String> skills,
    required String jobType,
    required String salaryRange,
    required String location,
    String? formUrl,
  });

  Future<void> deleteJob(String jobId);

  Future<void> applyToJob({
    required String jobId,
    required String recruiterId,
    required String studentId,
    required String studentName,
  });

  Future<void> updateApplicationStatus({
    required String applicationId,
    required String status,
  });

  Stream<List<JobApplicationModel>> streamApplicationsForJob(String jobId);
}

class JobsRemoteDataSourceImpl implements JobsRemoteDataSource {
  JobsRemoteDataSourceImpl({
    required FirebaseFirestore firestore,
    required FirebaseStorage storage,
    required fb.FirebaseAuth firebaseAuth,
    required CloudinaryService cloudinaryService,
  })  : _firestore = firestore,
        _firebaseAuth = firebaseAuth;

  final FirebaseFirestore _firestore;
  final fb.FirebaseAuth _firebaseAuth;

  CollectionReference<Map<String, dynamic>> get _jobs =>
      _firestore.collection('jobs');

  CollectionReference<Map<String, dynamic>> get _users =>
      _firestore.collection('users');

  CollectionReference<Map<String, dynamic>> get _applications =>
      _firestore.collection('applications');

  @override
  Stream<List<JobModel>> streamAllJobs() {
    return _jobs
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map(JobModel.fromFirestore).toList());
  }

  @override
  Stream<List<JobModel>> streamRecruiterJobs(String recruiterId) {
    return _jobs
        .where('recruiterId', isEqualTo: recruiterId)
        .snapshots()
        .map((snap) {
      final jobs = snap.docs.map(JobModel.fromFirestore).toList();
      jobs.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return jobs;
    });
  }

  @override
  Future<void> createJob({
    required String title,
    required String description,
    required List<String> skills,
    required String jobType,
    required String salaryRange,
    required String location,
    String? formUrl,
  }) async {
    final currentUser = _firebaseAuth.currentUser;
    if (currentUser == null) throw UserNotLoggedInException();

    final userDoc = await _users.doc(currentUser.uid).get();
    if (!userDoc.exists) throw RecruiterProfileNotFoundException();

    final userData = userDoc.data() ?? {};
    final recruiterName =
        (userData['fullName'] as String?) ??
        (userData['name'] as String?) ??
        'Recruiter';
    final recruiterAvatarUrl =
        userData['avatarUrl'] as String? ?? userData['photoUrl'] as String?;

    await _jobs.add({
      'recruiterId': currentUser.uid,
      'recruiterName': recruiterName,
      'recruiterAvatarUrl': recruiterAvatarUrl,
      'title': title,
      'description': description,
      'skills': skills,
      'jobType': jobType,
      'salaryRange': salaryRange,
      'location': location,
      'formUrl': formUrl,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Future<void> deleteJob(String jobId) async {
    await _jobs.doc(jobId).delete();
  }

  @override
  Future<void> applyToJob({
    required String jobId,
    required String recruiterId,
    required String studentId,
    required String studentName,
  }) async {
    // ✅ FIXED: the old duplicate check used two .where() clauses on different
    // fields (jobId + studentId), which requires a composite Firestore index.
    // Without that index, the .get() throws [failed-precondition] silently —
    // the application is never written, so the recruiter never sees it.
    //
    // Fix: use a deterministic document ID = "jobId_studentId".
    // This means the document either exists or it doesn't — no query needed,
    // no index required, and duplicate prevention is guaranteed by Firestore
    // itself (set with merge:false will just overwrite, but we check first
    // with a single doc get which needs no index at all).
    final docId = '${jobId}_$studentId';
    final docRef = _applications.doc(docId);

    final existing = await docRef.get();
    if (existing.exists) return;

    await docRef.set({
      'jobId': jobId,
      'recruiterId': recruiterId,
      'studentId': studentId,
      'studentName': studentName,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Future<void> updateApplicationStatus({
    required String applicationId,
    required String status,
  }) async {
    await _applications.doc(applicationId).update({
      'status': status,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Stream<List<JobApplicationModel>> streamApplicationsForJob(String jobId) {
    return _applications
        .where('jobId', isEqualTo: jobId)
        .snapshots()
        .map((snap) {
      final apps = snap.docs.map(JobApplicationModel.fromFirestore).toList();
      apps.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return apps;
    });
  }
}