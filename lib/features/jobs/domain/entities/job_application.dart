import 'package:equatable/equatable.dart';

class JobApplication extends Equatable {
  const JobApplication({
    required this.id,
    required this.jobId,
    required this.studentId,
    required this.studentName,
    required this.cvUrl,
    required this.message,
    required this.createdAt,
  });

  final String id;
  final String jobId;
  final String studentId;
  final String studentName;
  final String cvUrl;
  final String message;
  final DateTime createdAt;

  @override
  List<Object?> get props => [
        id,
        jobId,
        studentId,
        studentName,
        cvUrl,
        message,
        createdAt,
      ];
}
