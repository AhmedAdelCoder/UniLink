import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../entities/job.dart';
import '../entities/job_application.dart';

abstract class JobsRepository {
  Stream<List<Job>> streamFollowedJobs(String studentId);
  Stream<List<Job>> streamCompanyJobs(String companyId);
  Stream<List<JobApplication>> streamApplicationsForJob(String jobId);
  Future<Either<Failure, void>> createJob({
    required String title,
    required String description,
    required List<String> skills,
    required String jobType,
    required String salaryRange,
    required String location,
  });
  Future<Either<Failure, void>> deleteJob(String jobId);
  Future<Either<Failure, void>> applyToJob({
    required String jobId,
    required String message,
    required String cvFilePath,
  });
}
