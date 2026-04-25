import 'package:cloud_firestore/cloud_firestore.dart';

import '../../domain/entities/job_application.dart';

class JobApplicationModel extends JobApplication {
  const JobApplicationModel({
    required super.id,
    required super.jobId,
    required super.studentId,
    required super.studentName,
    required super.cvUrl,
    required super.message,
    required super.createdAt,
  });

  factory JobApplicationModel.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final createdAtRaw = data['createdAt'];
    final createdAt = createdAtRaw is Timestamp
        ? createdAtRaw.toDate()
        : DateTime.now().toUtc();

    return JobApplicationModel(
      id: doc.id,
      jobId: (data['jobId'] as String?) ?? '',
      studentId: (data['studentId'] as String?) ?? '',
      studentName: (data['studentName'] as String?) ?? 'Student',
      cvUrl: (data['cvUrl'] as String?) ?? '',
      message: (data['message'] as String?) ?? '',
      createdAt: createdAt,
    );
  }
}
