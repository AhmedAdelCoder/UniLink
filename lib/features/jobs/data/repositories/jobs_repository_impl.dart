import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dartz/dartz.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:rxdart/rxdart.dart';

import '../../../../core/errors/failures.dart';
import '../../../connections/data/connections_remote_datasource.dart';
import '../../domain/entities/job.dart';
import '../../domain/entities/job_application.dart';
import '../../domain/repositories/jobs_repository.dart';
import '../datasources/jobs_remote_datasource.dart';

class JobsRepositoryImpl implements JobsRepository {
  JobsRepositoryImpl({
    required this.jobsRemoteDataSource,
    required this.connectionsRemoteDataSource,
  });

  final JobsRemoteDataSource jobsRemoteDataSource;
  final ConnectionsRemoteDataSource connectionsRemoteDataSource;

  @override
  Stream<List<Job>> streamFollowedJobs(String studentId) {
    return Rx.combineLatest2<List<Job>, List<String>, List<Job>>(
      jobsRemoteDataSource.streamAllJobs(),
      connectionsRemoteDataSource.watchConnectedUserIds(studentId),
      (jobs, connectedIds) {
        final connectedSet = connectedIds.toSet();
        return jobs
            .where((job) => connectedSet.contains(job.recruiterId))
            .toList(growable: false);
      },
    );
  }

  @override
  Stream<List<Job>> streamRecruiterJobs(String recruiterId) {
    return jobsRemoteDataSource.streamRecruiterJobs(recruiterId);
  }

  @override
  Stream<List<JobApplication>> streamApplicationsForJob(String jobId) {
    return jobsRemoteDataSource.streamApplicationsForJob(jobId);
  }

  @override
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
  }) async {
    try {
      await jobsRemoteDataSource.createJob(
        title: title,
        description: description,
        skills: skills,
        jobType: jobType,
        salaryRange: salaryRange,
        location: location,
        formUrl: formUrl,
      );
      return const Right(null);
    } on UserNotLoggedInException catch (e) {
      return Left(AuthFailure(e.toString()));
    } on RecruiterProfileNotFoundException catch (e) {
      return Left(ServerFailure(e.toString()));
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Firebase error'));
    } catch (e) {
      return Left(ServerFailure(e.toString()));
    }
  }

  @override
  Future<Either<Failure, void>> deleteJob(String jobId) async {
    try {
      await jobsRemoteDataSource.deleteJob(jobId);
      return const Right(null);
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Firebase error'));
    } catch (e) {
      return Left(ServerFailure(e.toString()));
    }
  }

  @override
  Future<Either<Failure, void>> applyToJob({
    required String jobId,
    required String recruiterId,
    required String studentId,
    required String studentName,
  }) async {
    try {
      await jobsRemoteDataSource.applyToJob(
        jobId: jobId,
        recruiterId: recruiterId,
        studentId: studentId,
        studentName: studentName,
      );
      return const Right(null);
    } on UserNotLoggedInException catch (e) {
      return Left(AuthFailure(e.toString()));
    } on fb.FirebaseAuthException catch (e) {
      return Left(AuthFailure(e.message ?? 'Authentication error'));
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Firebase error'));
    } catch (e) {
      return Left(ServerFailure(e.toString()));
    }
  }

  @override
  Future<Either<Failure, void>> updateApplicationStatus({
    required String applicationId,
    required String status,
  }) async {
    try {
      await jobsRemoteDataSource.updateApplicationStatus(
        applicationId: applicationId,
        status: status,
      );
      return const Right(null);
    } on FirebaseException catch (e) {
      return Left(ServerFailure(e.message ?? 'Firebase error'));
    } catch (e) {
      return Left(ServerFailure(e.toString()));
    }
  }
}