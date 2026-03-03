import '../../domain/entities/app_user.dart';

class AppUserModel extends AppUser {
  const AppUserModel({
    required super.id,
    required super.email,
    required super.fullName,
    required super.role,
    super.photoUrl,
  });

  factory AppUserModel.fromFirestore(
    String id,
    Map<String, dynamic> data,
  ) {
    final roleString = (data['role'] as String?) ?? 'student';
    final role = roleString == 'recruiter' ? UserRole.recruiter : UserRole.student;

    return AppUserModel(
      id: id,
      email: (data['email'] as String?) ?? '',
      fullName: (data['fullName'] as String?) ?? '',
      role: role,
      photoUrl: data['photoUrl'] as String?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'email': email,
      'fullName': fullName,
      'role': role == UserRole.recruiter ? 'recruiter' : 'student',
      'photoUrl': photoUrl,
      'createdAt': DateTime.now(),
      'updatedAt': DateTime.now(),
    };
  }
}

