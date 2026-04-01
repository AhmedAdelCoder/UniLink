// lib/core/config/injection_container.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:firebase_storage/firebase_storage.dart';
import 'package:get_it/get_it.dart';

import '../../features/auth/data/datasources/auth_remote_datasource.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/get_current_user.dart';
import '../../features/auth/domain/usecases/login.dart';
import '../../features/auth/domain/usecases/logout.dart';
import '../../features/auth/domain/usecases/register.dart';
import '../../features/auth/domain/usecases/reset_password.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';
import '../../features/chat/data/chat_remote_datasource.dart';
import '../../features/posts/data/datasources/posts_remote_datasource.dart';
import '../../features/posts/data/repositories/post_repository_impl.dart';
import '../../features/posts/domain/repositories/post_repository.dart';
import '../../features/posts/domain/usecases/add_comment.dart';
import '../../features/posts/domain/usecases/create_post.dart';
import '../../features/posts/domain/usecases/delete_post.dart';
import '../../features/posts/domain/usecases/get_feed_page.dart';
import '../../features/posts/domain/usecases/like_post.dart';
import '../../features/posts/domain/usecases/unlike_post.dart';
import '../../features/posts/presentation/bloc/feed_bloc.dart';
import '../../features/profile/data/profile_remote_datasource.dart';
import '../../core/services/cloudinary_service.dart';

final sl = GetIt.instance;

Future<void> initDependencies() async {
  // Firebase
  sl.registerLazySingleton<fb.FirebaseAuth>(() => fb.FirebaseAuth.instance);
  sl.registerLazySingleton<FirebaseFirestore>(() => FirebaseFirestore.instance);
  sl.registerLazySingleton<FirebaseStorage>(() => FirebaseStorage.instance);

  // Services
  sl.registerLazySingleton<CloudinaryService>(() => CloudinaryService());

  // Data sources
  sl.registerLazySingleton<AuthRemoteDataSource>(
        () => AuthRemoteDataSourceImpl(
      firebaseAuth: sl<fb.FirebaseAuth>(),
      firestore: sl<FirebaseFirestore>(),
    ),
  );

  sl.registerLazySingleton<PostsRemoteDataSource>(
        () => PostsRemoteDataSourceImpl(
      firestore: sl<FirebaseFirestore>(),
      storage: sl<FirebaseStorage>(), // ← تم إضافته
      firebaseAuth: sl<fb.FirebaseAuth>(),
    ),
  );

  sl.registerLazySingleton<ProfileRemoteDataSource>(
        () => ProfileRemoteDataSourceImpl(
      firestore: sl<FirebaseFirestore>(),
      auth: sl<fb.FirebaseAuth>(),
      cloudinaryService: sl<CloudinaryService>(),
    ),
  );

  sl.registerLazySingleton<ChatRemoteDataSource>(
        () => ChatRemoteDataSourceImpl(
      firestore: sl<FirebaseFirestore>(),
      auth: sl<fb.FirebaseAuth>(),
    ),
  );

  // Repositories
  sl.registerLazySingleton<AuthRepository>(
        () => AuthRepositoryImpl(remoteDataSource: sl<AuthRemoteDataSource>()),
  );

  sl.registerLazySingleton<PostRepository>(
        () => PostRepositoryImpl(remoteDataSource: sl<PostsRemoteDataSource>()),
  );

  // Use cases
  sl.registerLazySingleton(() => Login(sl<AuthRepository>()));
  sl.registerLazySingleton(() => Register(sl<AuthRepository>()));
  sl.registerLazySingleton(() => ResetPassword(sl<AuthRepository>()));
  sl.registerLazySingleton(() => GetCurrentUser(sl<AuthRepository>()));
  sl.registerLazySingleton(() => Logout(sl<AuthRepository>()));
  sl.registerLazySingleton(() => GetFeedPage(sl<PostRepository>()));
  sl.registerLazySingleton(() => CreatePost(sl<PostRepository>()));
  sl.registerLazySingleton(() => DeletePost(sl<PostRepository>()));
  sl.registerLazySingleton(() => LikePost(sl<PostRepository>()));
  sl.registerLazySingleton(() => UnlikePost(sl<PostRepository>()));
  sl.registerLazySingleton(() => AddComment(sl<PostRepository>()));

  // Blocs
  sl.registerFactory(
        () => AuthBloc(
      login: sl<Login>(),
      register: sl<Register>(),
      resetPassword: sl<ResetPassword>(),
      getCurrentUser: sl<GetCurrentUser>(),
      logout: sl<Logout>(),
    ),
  );

  sl.registerFactory(
        () => FeedBloc(
      getFeedPage: sl<GetFeedPage>(),
      createPost: sl<CreatePost>(),
      likePost: sl<LikePost>(),
      unlikePost: sl<UnlikePost>(),
      addComment: sl<AddComment>(),
      deletePost: sl<DeletePost>(),
    ),
  );
}