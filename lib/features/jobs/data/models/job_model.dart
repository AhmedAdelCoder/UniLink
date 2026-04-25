import 'package:cloud_firestore/cloud_firestore.dart';

import '../../domain/entities/job.dart';

class JobModel extends Job {
  const JobModel({
    required super.id,
    required super.companyId,
    required super.companyName,
    super.companyLogoUrl,
    required super.title,
    required super.description,
    required super.skills,
    required super.jobType,
    required super.salaryRange,
    required super.location,
    required super.createdAt,
  });

  factory JobModel.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? {};
    final createdAtRaw = data['createdAt'];
    final createdAt = createdAtRaw is Timestamp
        ? createdAtRaw.toDate()
        : DateTime.now().toUtc();

    return JobModel(
      id: doc.id,
      companyId: (data['companyId'] as String?) ?? '',
      companyName: (data['companyName'] as String?) ?? 'Company',
      companyLogoUrl: data['companyLogoUrl'] as String?,
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
    );
  }
}
