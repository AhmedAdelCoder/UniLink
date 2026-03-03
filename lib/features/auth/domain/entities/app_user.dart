import 'package:equatable/equatable.dart';

enum UserRole { student, recruiter }

class AppUser extends Equatable {
  final String id;
  final String email;
  final String fullName;
  final UserRole role;
  final String? photoUrl;

  const AppUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    this.photoUrl,
  });

  @override
  List<Object?> get props => [id, email, fullName, role, photoUrl];
}

