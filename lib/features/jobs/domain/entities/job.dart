import 'package:equatable/equatable.dart';

class Job extends Equatable {
  const Job({
    required this.id,
    required this.recruiterId,
    required this.recruiterName,
    this.recruiterAvatarUrl,
    required this.title,
    required this.description,
    required this.skills,
    required this.jobType,
    required this.salaryRange,
    required this.location,
    required this.createdAt,
    this.formUrl,
  });

  final String id;
  final String recruiterId;
  final String recruiterName;
  final String? recruiterAvatarUrl;
  final String title;
  final String description;
  final List<String> skills;
  final String jobType;
  final String salaryRange;
  final String location;
  final DateTime createdAt;
  final String? formUrl;

  @override
  List<Object?> get props => [
        id,
        recruiterId,
        recruiterName,
        recruiterAvatarUrl,
        title,
        description,
        skills,
        jobType,
        salaryRange,
        location,
        createdAt,
        formUrl,
      ];
}