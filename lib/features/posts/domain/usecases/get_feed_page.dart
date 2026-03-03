import 'package:dartz/dartz.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../entities/post.dart';
import '../repositories/post_repository.dart';

class GetFeedPage implements UseCase<List<Post>, GetFeedPageParams> {
  final PostRepository repository;

  GetFeedPage(this.repository);

  @override
  Future<Either<Failure, List<Post>>> call(GetFeedPageParams params) {
    return repository.getFeedPage(
      lastPost: params.lastPost,
      limit: params.limit,
    );
  }
}

class GetFeedPageParams {
  final Post? lastPost;
  final int limit;

  const GetFeedPageParams({
    this.lastPost,
    this.limit = 10,
  });
}

