import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../entities/job.dart';
import '../entities/job_application.dart';

abstract class JobsRepository {
  Stream<List<Job>> streamFollowedJobs(String studentId);
  Stream<List<Job>> streamRecruiterJobs(String recruiterId);
  Stream<List<JobApplication>> streamApplicationsForJob(String jobId);
  Future<Either<Failure, void>> createJob({
    required String recruiterId,
    required String recruiterName,
    String? recruiterAvatarUrl,
    required String title,
    required String description,
    required List<String> skills,
    required String jobType,
    required String salaryRange,
    required String location,
    String? formUrl,
  });
  Future<Either<Failure, void>> deleteJob(String jobId);
  Future<Either<Failure, void>> applyToJob({
    required String jobId,
    required String recruiterId,
    required String studentId,
    required String studentName,
  });
  Future<Either<Failure, void>> updateApplicationStatus({
    required String applicationId,
    required String status,
  });
}