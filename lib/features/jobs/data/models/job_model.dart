import 'package:cloud_firestore/cloud_firestore.dart';

import '../../domain/entities/job.dart';

class JobModel extends Job {
  const JobModel({
    required super.id,
    required super.recruiterId,
    required super.recruiterName,
    super.recruiterAvatarUrl,
    required super.title,
    required super.description,
    required super.skills,
    required super.jobType,
    required super.salaryRange,
    required super.location,
    required super.createdAt,
    super.formUrl,
  });

  factory JobModel.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? {};
    final createdAtRaw = data['createdAt'];
    final createdAt = createdAtRaw is Timestamp
        ? createdAtRaw.toDate()
        : DateTime.now().toUtc();

    return JobModel(
      id: doc.id,
      recruiterId: (data['recruiterId'] as String?) ?? '',
      recruiterName: (data['recruiterName'] as String?) ?? 'Recruiter',
      recruiterAvatarUrl: data['recruiterAvatarUrl'] as String?,
      title: (data['title'] as String?) ?? '',
      description: (data['description'] as String?) ?? '',
      skills: ((data['skills'] as List<dynamic>?) ?? const [])
          .map((e) => e.toString())
          .where((skill) => skill.isNotEmpty)
          .toList(),
      jobType: (data['jobType'] as String?) ?? '',
      salaryRange: (data['salaryRange'] as String?) ?? '',
      location: (data['location'] as String?) ?? '',
      createdAt: createdAt,
      formUrl: data['formUrl'] as String?,
    );
  }
}