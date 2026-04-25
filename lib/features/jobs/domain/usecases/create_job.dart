import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../repositories/jobs_repository.dart';

class CreateJob implements UseCase<void, CreateJobParams> {
  CreateJob(this.repository);

  final JobsRepository repository;

  @override
  Future<Either<Failure, void>> call(CreateJobParams params) {
    return repository.createJob(
      title: params.title,
      description: params.description,
      skills: params.skills,
      jobType: params.jobType,
      salaryRange: params.salaryRange,
      location: params.location,
    );
  }
}

class CreateJobParams {
  const CreateJobParams({
    required this.title,
    required this.description,
    required this.skills,
    required this.jobType,
    required this.salaryRange,
    required this.location,
  });

  final String title;
  final String description;
  final List<String> skills;
  final String jobType;
  final String salaryRange;
  final String location;
}
