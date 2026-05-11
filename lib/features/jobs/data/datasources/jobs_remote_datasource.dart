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

  // ✅ Real-time stream — snapshots() auto-updates on any Firestore change
  @override
  Stream<List<JobModel>> streamAllJobs() {
    return _jobs
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map(JobModel.fromFirestore).toList());
  }

  // ✅ Real-time stream for recruiter jobs
  @override
  Stream<List<JobModel>> streamRecruiterJobs(String recruiterId) {
    return _jobs
        .where('recruiterId', isEqualTo: recruiterId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map(JobModel.fromFirestore).toList());
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
    final recruiterName = (userData['fullName'] as String?) ??
        (userData['name'] as String?) ??
        'Recruiter';
    final recruiterAvatarUrl =
        userData['avatarUrl'] as String? ?? userData['photoUrl'] as String?;

    // ✅ Firestore write triggers streamRecruiterJobs snapshot automatically
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
    final existing = await _applications
        .where('jobId', isEqualTo: jobId)
        .where('studentId', isEqualTo: studentId)
        .limit(1)
        .get();

    if (existing.docs.isNotEmpty) return;

    await _applications.add({
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

  // ✅ Real-time stream for applications
  @override
  Stream<List<JobApplicationModel>> streamApplicationsForJob(String jobId) {
    return _applications
        .where('jobId', isEqualTo: jobId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(JobApplicationModel.fromFirestore).toList());
  }
}