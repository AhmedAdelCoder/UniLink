import 'package:equatable/equatable.dart';

class Job extends Equatable {
  const Job({
    required this.id,
    required this.companyId,
    required this.companyName,
    this.companyLogoUrl,
    required this.title,
    required this.description,
    required this.skills,
    required this.jobType,
    required this.salaryRange,
    required this.location,
    required this.createdAt,
  });

  final String id;
  final String companyId;
  final String companyName;
  final String? companyLogoUrl;
  final String title;
  final String description;
  final List<String> skills;
  final String jobType;
  final String salaryRange;
  final String location;
  final DateTime createdAt;

  @override
  List<Object?> get props => [
        id,
        companyId,
        companyName,
        companyLogoUrl,
        title,
        description,
        skills,
        jobType,
        salaryRange,
        location,
        createdAt,
      ];
}
