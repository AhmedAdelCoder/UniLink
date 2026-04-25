import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dartz/dartz.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:rxdart/rxdart.dart';

import '../../../../core/errors/failures.dart';
import '../../../follows/domain/repositories/follows_repository.dart';
import '../../domain/entities/job.dart';
import '../../domain/entities/job_application.dart';
import '../../domain/repositories/jobs_repository.dart';
import '../datasources/jobs_remote_datasource.dart';

class JobsRepositoryImpl implements JobsRepository {
  JobsRepositoryImpl({
    required this.jobsRemoteDataSource,
    required this.followsRepository,
  });

  final JobsRemoteDataSource jobsRemoteDataSource;
  final FollowsRepository followsRepository;

  @override
  Stream<List<Job>> streamFollowedJobs(String studentId) {
    return Rx.combineLatest2<List<Job>, List<String>, List<Job>>(
      jobsRemoteDataSource.streamAllJobs(),
      followsRepository.watchFollowedCompanyIds(studentId),
      (jobs, followedCompanyIds) {
        final followedSet = followedCompanyIds.toSet();
        return jobs
            .where((job) => followedSet.contains(job.companyId))
            .toList(growable: false);
      },
    );
  }

  @override
  Stream<List<Job>> streamCompanyJobs(String companyId) {
    return jobsRemoteDataSource.streamCompanyJobs(companyId);
  }

  @override
  Stream<List<JobApplication>> streamApplicationsForJob(String jobId) {
    return jobsRemoteDataSource.streamApplicationsForJob(jobId);
  }

  @override
  Future<Either<Failure, void>> createJob({
    required String title,
    required String description,
    required List<String> skills,
    required String jobType,
    required String salaryRange,
    required String location,
  }) async {
    try {
      print("🔥 CREATE JOB START");

      final result = await jobsRemoteDataSource.createJob(
        title: title,
        description: description,
        skills: skills,
        jobType: jobType,
        salaryRange: salaryRange,
        location: location,
      );

      print("✅ CREATE JOB SUCCESS");
      return Right(result);
    } on fb.FirebaseAuthException catch (e) {
      print("❌ AUTH ERROR: ${e.message}");
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      print("❌ FIREBASE ERROR: ${e.message}");
      return Left(ServerFailure(e.message ?? 'Firebase error'));
    } catch (e, stack) {
      print("❌ UNKNOWN ERROR: $e");
      print(stack);
      return Left(ServerFailure(e.toString()));
    }
  }

  @override
  Future<Either<Failure, void>> deleteJob(String jobId) async {
    try {
      await jobsRemoteDataSource.deleteJob(jobId);
      return const Right(null);
    } on FirebaseException catch (e) {
      print("❌ DELETE ERROR: ${e.message}");
      return Left(ServerFailure(e.message ?? 'Firebase error'));
    } catch (e) {
      print("❌ UNKNOWN DELETE ERROR: $e");
      return Left(ServerFailure(e.toString()));
    }
  }

  @override
  Future<Either<Failure, void>> applyToJob({
    required String jobId,
    required String message,
    required String cvFilePath,
  }) async {
    try {
      await jobsRemoteDataSource.applyToJob(
        jobId: jobId,
        message: message,
        cvFilePath: cvFilePath,
      );

      return const Right(null);
    } on fb.FirebaseAuthException catch (e) {
      print("❌ AUTH APPLY ERROR: ${e.message}");
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      print("❌ FIREBASE APPLY ERROR: ${e.message}");
      return Left(ServerFailure(e.message ?? 'Firebase error'));
    } catch (e, stack) {
      print("❌ UNKNOWN APPLY ERROR: $e");
      print(stack);
      return Left(ServerFailure(e.toString()));
    }
  }
}