import 'package:equatable/equatable.dart';

class JobApplication extends Equatable {
  const JobApplication({
    required this.id,
    required this.jobId,
    required this.recruiterId,
    required this.studentId,
    required this.studentName,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String jobId;
  final String recruiterId;
  final String studentId;
  final String studentName;
  final String status; 
  final DateTime createdAt;

  @override
  List<Object?> get props => [
        id,
        jobId,
        recruiterId,
        studentId,
        studentName,
        status,
        createdAt,
      ];
}